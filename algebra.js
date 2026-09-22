(function(global){
"use strict";

const M=global.CalcMath;
if(!M)throw new Error("CalcMath must load before CalcAlgebra");

class AlgebraError extends M.CalcError{
  constructor(code,message,details){super(code||"ALGEBRA_ERROR",message,undefined,undefined,details);}
}
class UnsupportedSymbolicError extends AlgebraError{
  constructor(message,details){super("UNSUPPORTED_SYMBOLIC",message,details);}
}
class EquationError extends AlgebraError{
  constructor(message,details){super("EQUATION_ERROR",message,details);}
}
class InconsistentSystemError extends AlgebraError{
  constructor(message){super("INCONSISTENT_SYSTEM",message||"The system is inconsistent");}
}

function rat(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function isRat(v){return v instanceof M.Rational;}
function isLit(n){return n&&n.type==="literal";}
function lit(v){return {type:"literal",value:v,start:0,end:0};}
function id(name){return {type:"identifier",name:name,start:0,end:0};}
function unary(op,arg){return {type:"unary",op:op,arg:arg,start:0,end:0};}
function bin(op,left,right){return {type:"binary",op:op,left:left,right:right,implicit:false,start:0,end:0};}
function call(name,args){return {type:"call",name:name,args:args,start:0,end:0};}
function cloneAst(ast){return M.deserializeAst(M.serializeAst(ast));}
function isZeroNode(n){return isLit(n)&&isRat(n.value)&&n.value.isZero();}
function isOneNode(n){return isLit(n)&&isRat(n.value)&&n.value.equals(rat(1));}
function isMinusOneNode(n){return isLit(n)&&isRat(n.value)&&n.value.equals(rat(-1));}
function isIntegerLiteral(n){return isLit(n)&&isRat(n.value)&&n.value.isInteger();}
function exactFold(op,a,b){
  if(!isLit(a)||!isLit(b)||!M.isExactValue(a.value)||!M.isExactValue(b.value))return null;
  try{
    var v=op==="+"?M.add(a.value,b.value):op==="-"?M.sub(a.value,b.value):op==="*"?M.mul(a.value,b.value):op==="/"?M.div(a.value,b.value):op==="^"?M.power(a.value,b.value,{complex:true}):null;
    return v!==null&&M.isExactValue(v)?lit(v):null;
  }catch(e){return null;}
}
function astKey(n){return printAst(n);}
function sameAst(a,b){return astKey(a)===astKey(b);}
function canonicalCompare(a,b,op){
  var al=isLit(a),bl=isLit(b);
  if(al!==bl){
    if(op==="*")return al?-1:1;
    if(op==="+")return al?1:-1;
  }
  var ak=astKey(a),bk=astKey(b);
  return ak<bk?-1:ak>bk?1:0;
}

function precedence(n){
  if(!n)return 100;
  if(n.type==="binary"){if(n.op==="+"||n.op==="-")return 10;if(n.op==="*"||n.op==="/")return 20;if(n.op==="^")return 30;}
  if(n.type==="unary")return 25;
  if(n.type==="postfix")return 40;
  return 50;
}
function printAst(n,parentPrec,side){
  parentPrec=parentPrec||0;side=side||"";
  if(!n)return "";
  var out,p=precedence(n);
  if(n.type==="literal")out=M.formatValue(n.value);
  else if(n.type==="identifier")out=n.name;
  else if(n.type==="call")out=n.name+"("+n.args.map(function(a){return printAst(a,0);}).join(", ")+")";
  else if(n.type==="unary")out=n.op+printAst(n.arg,p,"right");
  else if(n.type==="postfix")out=printAst(n.arg,p,"left")+n.op;
  else if(n.type==="binary"){
    var left=printAst(n.left,n.op==="^"?p+1:p,"left"),right=printAst(n.right,n.op==="^"?p-1:p,"right");
    if(n.op==="+"&&n.right.type==="unary"&&n.right.op==="-")out=left+" - "+printAst(n.right.arg,p,"right");
    else if(n.op==="-"&&n.right.type==="unary"&&n.right.op==="-")out=left+" + "+printAst(n.right.arg,p,"right");
    else out=left+" "+n.op+" "+right;
  }else out="?";
  var need=p<parentPrec||(side==="right"&&(n.type==="binary"&&(n.op==="-"||n.op==="/")));
  return need?"("+out+")":out;
}

function collectVariables(ast,set){
  set=set||new Set();
  if(!ast)return set;
  if(ast.type==="identifier"){
    if(!Object.prototype.hasOwnProperty.call(M.CONSTANT_REGISTRY,ast.name)&&ast.name!=="ans")set.add(ast.name);
  }else if(ast.type==="unary"||ast.type==="postfix")collectVariables(ast.arg,set);
  else if(ast.type==="binary"){collectVariables(ast.left,set);collectVariables(ast.right,set);}
  else if(ast.type==="call")ast.args.forEach(function(a){collectVariables(a,set);});
  return set;
}
function singleVariable(ast,preferred){
  if(preferred)return preferred;
  var vars=Array.from(collectVariables(ast));if(vars.length===1)return vars[0];if(vars.length===0)return null;
  throw new UnsupportedSymbolicError("This operation currently requires a single symbolic variable",{variables:vars});
}

class Restriction{
  constructor(expression,relation,value){
    this.expression=expression instanceof SymbolicExpression?expression:new SymbolicExpression(expression);
    this.relation=relation||"!=";
    this.value=value===undefined?rat(0):value;
  }
  toString(){return this.expression.toString()+" "+(this.relation==="!="?"≠":this.relation)+" "+M.formatValue(this.value);}
  accepts(variable,candidate){
    try{
      var env={};env[variable]=candidate;
      var v=M.evaluateAst(this.expression.ast,env,{complex:true},0),d=M.sub(v,this.value),num=M.toNumber(d);
      if(this.relation==="!=")return !M.isZero(d);
      if(!Number.isFinite(num))return false;
      if(this.relation===">")return num>0;if(this.relation===">=")return num>=0;if(this.relation==="<")return num<0;if(this.relation==="<=")return num<=0;
      return true;
    }catch(e){return false;}
  }
}
function restrictionKey(r){return r.toString();}
function uniqueRestrictions(rs){
  var seen=new Set(),out=[];(rs||[]).forEach(function(r){var k=restrictionKey(r);if(!seen.has(k)){seen.add(k);out.push(r);}});return out;
}
function collectRestrictions(ast,options,out){
  options=options||{};out=out||[];
  if(!ast)return out;
  if(ast.type==="binary"){
    if(ast.op==="/")out.push(new Restriction(new SymbolicExpression(cloneAst(ast.right)),"!=",rat(0)));
    collectRestrictions(ast.left,options,out);collectRestrictions(ast.right,options,out);
  }else if(ast.type==="call"){
    if(options.realDomain!==false&&ast.name==="sqrt"&&ast.args[0])out.push(new Restriction(new SymbolicExpression(cloneAst(ast.args[0])),">=",rat(0)));
    if(options.realDomain!==false&&(ast.name==="ln"||ast.name==="log"||ast.name==="log10")&&ast.args[0])out.push(new Restriction(new SymbolicExpression(cloneAst(ast.args[0])),">",rat(0)));
    ast.args.forEach(function(a){collectRestrictions(a,options,out);});
  }else if(ast.type==="unary"||ast.type==="postfix")collectRestrictions(ast.arg,options,out);
  return uniqueRestrictions(out);
}

function simplifyAst(ast){
  if(!ast)return ast;
  if(ast.type==="literal"||ast.type==="identifier")return cloneAst(ast);
  if(ast.type==="unary"){
    var a=simplifyAst(ast.arg);
    if(ast.op==="+")return a;
    if(ast.op==="-"&&isLit(a)&&M.isExactValue(a.value))return lit(M.neg(a.value));
    if(ast.op==="-"&&a.type==="unary"&&a.op==="-")return a.arg;
    return unary(ast.op,a);
  }
  if(ast.type==="postfix"){
    var pa=simplifyAst(ast.arg);
    if(ast.op==="%"&&isLit(pa)&&M.isExactValue(pa.value))return lit(M.div(pa.value,rat(100)));
    return {type:"postfix",op:ast.op,arg:pa,start:0,end:0};
  }
  if(ast.type==="call"){
    var args=ast.args.map(simplifyAst);
    if(ast.name==="sqrt"&&args.length===1&&isLit(args[0])&&isRat(args[0].value)){
      try{var sq=M.sqrtValue(args[0].value,true);if(M.isExactValue(sq))return lit(sq);}catch(e){}
    }
    if(ast.name==="abs"&&args.length===1&&isLit(args[0])&&isRat(args[0].value))return lit(args[0].value.abs());
    return call(ast.name,args);
  }
  if(ast.type==="binary"){
    var l=simplifyAst(ast.left),r=simplifyAst(ast.right),fold=exactFold(ast.op,l,r);if(fold)return fold;
    if(ast.op==="+"){
      if(isZeroNode(l))return r;if(isZeroNode(r))return l;
      if(isLit(r)&&isRat(r.value)&&r.value.n<0n)return simplifyAst(bin("-",l,lit(r.value.neg())));
      if(sameAst(l,r))return bin("*",lit(rat(2)),l);
      if(canonicalCompare(l,r,"+")>0){var at=l;l=r;r=at;}
    }else if(ast.op==="-"){
      if(isZeroNode(r))return l;if(isZeroNode(l))return simplifyAst(unary("-",r));if(sameAst(l,r))return lit(rat(0));
      if(isLit(r)&&isRat(r.value)&&r.value.n<0n)return simplifyAst(bin("+",l,lit(r.value.neg())));
    }else if(ast.op==="*"){
      if(isZeroNode(l)||isZeroNode(r))return lit(rat(0));if(isOneNode(l))return r;if(isOneNode(r))return l;
      if(isMinusOneNode(l))return simplifyAst(unary("-",r));if(isMinusOneNode(r))return simplifyAst(unary("-",l));
      if(sameAst(l,r))return bin("^",l,lit(rat(2)));
      if(canonicalCompare(l,r,"*")>0){var mt=l;l=r;r=mt;}
    }else if(ast.op==="/"){
      if(isZeroNode(l))return lit(rat(0));if(isOneNode(r))return l;if(sameAst(l,r))return lit(rat(1));
    }else if(ast.op==="^"){
      if(isIntegerLiteral(r)){if(r.value.n===1n)return l;if(r.value.n===0n&&!isZeroNode(l))return lit(rat(1));}
      if(isOneNode(l))return lit(rat(1));
    }
    return bin(ast.op,l,r);
  }
  throw new UnsupportedSymbolicError("Unsupported AST node '"+String(ast.type)+"'");
}

class Polynomial{
  constructor(variable,coefficients){
    this.variable=variable||"x";this.coefficients=new Map();
    if(coefficients instanceof Map)coefficients.forEach((v,k)=>this.set(k,v));
    else if(Array.isArray(coefficients))coefficients.forEach((v,k)=>this.set(k,v));
    this.normalize();
  }
  set(degree,value){
    degree=Number(degree);if(!Number.isInteger(degree)||degree<0)throw new AlgebraError("POLYNOMIAL_ERROR","Polynomial degree must be a non-negative integer");
    if(!(value instanceof M.Rational))throw new UnsupportedSymbolicError("Polynomial coefficients must currently be exact rational numbers");
    if(value.isZero())this.coefficients.delete(degree);else this.coefficients.set(degree,value);
    return this;
  }
  get(degree){return this.coefficients.get(Number(degree))||rat(0);}
  normalize(){for(const [d,v] of this.coefficients)if(v.isZero())this.coefficients.delete(d);return this;}
  get degree(){if(this.coefficients.size===0)return -Infinity;return Math.max.apply(null,Array.from(this.coefficients.keys()));}
  isZero(){return this.coefficients.size===0;}
  leading(){return this.isZero()?rat(0):this.get(this.degree);}
  clone(){return new Polynomial(this.variable,new Map(this.coefficients));}
  add(other){this.assertVar(other);var p=this.clone();other.coefficients.forEach((v,d)=>p.set(d,p.get(d).add(v)));return p.normalize();}
  sub(other){this.assertVar(other);var p=this.clone();other.coefficients.forEach((v,d)=>p.set(d,p.get(d).sub(v)));return p.normalize();}
  scale(c){c=asRational(c);var p=new Polynomial(this.variable);this.coefficients.forEach((v,d)=>p.set(d,v.mul(c)));return p.normalize();}
  mul(other){
    this.assertVar(other);var p=new Polynomial(this.variable);
    this.coefficients.forEach((a,da)=>other.coefficients.forEach((b,db)=>p.set(da+db,p.get(da+db).add(a.mul(b)))));
    return p.normalize();
  }
  pow(n){
    n=Number(n);if(!Number.isInteger(n)||n<0||n>32)throw new UnsupportedSymbolicError("Polynomial exponent must be an integer from 0 to 32");
    var result=new Polynomial(this.variable,[rat(1)]),base=this.clone(),e=n;
    while(e>0){if(e&1)result=result.mul(base);e=Math.floor(e/2);if(e)base=base.mul(base);}return result;
  }
  derivative(){var p=new Polynomial(this.variable);this.coefficients.forEach((v,d)=>{if(d>0)p.set(d-1,v.mul(rat(d)));});return p;}
  evaluate(x){x=asRational(x);var d=this.degree;if(d===-Infinity)return rat(0);var value=rat(0);for(var i=d;i>=0;i--)value=value.mul(x).add(this.get(i));return value;}
  divmod(divisor){
    this.assertVar(divisor);if(divisor.isZero())throw new M.DivisionByZeroError("Polynomial division by zero");
    var q=new Polynomial(this.variable),r=this.clone(),dd=divisor.degree,dl=divisor.leading();
    while(!r.isZero()&&r.degree>=dd){
      var deg=r.degree-dd,c=r.leading().div(dl),term=new Polynomial(this.variable);term.set(deg,c);q=q.add(term);r=r.sub(term.mul(divisor));
    }
    return {quotient:q.normalize(),remainder:r.normalize()};
  }
  monic(){if(this.isZero())return this.clone();return this.scale(this.leading().inv());}
  assertVar(other){if(!(other instanceof Polynomial)||other.variable!==this.variable)throw new AlgebraError("POLYNOMIAL_ERROR","Polynomial variables do not match");}
  toAst(){
    if(this.isZero())return lit(rat(0));
    var terms=[];
    Array.from(this.coefficients.keys()).sort((a,b)=>b-a).forEach(d=>{
      var c=this.get(d),absC=c.abs(),term;
      if(d===0)term=lit(absC);
      else{
        var base=d===1?id(this.variable):bin("^",id(this.variable),lit(rat(d)));
        term=absC.equals(rat(1))?base:bin("*",lit(absC),base);
      }
      terms.push({negative:c.n<0n,ast:term});
    });
    var out=terms[0].negative?unary("-",terms[0].ast):terms[0].ast;
    for(var i=1;i<terms.length;i++)out=bin(terms[i].negative?"-":"+",out,terms[i].ast);
    return out;
  }
  toString(){return printAst(this.toAst());}
  static constant(variable,c){return new Polynomial(variable,[asRational(c)]);}
  static variable(variable){var p=new Polynomial(variable);p.set(1,rat(1));return p;}
  static fromAst(ast,variable){
    function walk(n){
      if(n.type==="literal"){
        if(!(n.value instanceof M.Rational))throw new UnsupportedSymbolicError("Polynomial coefficients must be exact rationals");
        return Polynomial.constant(variable,n.value);
      }
      if(n.type==="identifier"){
        if(n.name===variable)return Polynomial.variable(variable);
        throw new UnsupportedSymbolicError("Expression contains non-polynomial symbol '"+n.name+"'");
      }
      if(n.type==="unary"){
        var p=walk(n.arg);return n.op==="-"?p.scale(rat(-1)):p;
      }
      if(n.type==="binary"){
        var a=walk(n.left),b;
        if(n.op==="+"){b=walk(n.right);return a.add(b);}
        if(n.op==="-"){b=walk(n.right);return a.sub(b);}
        if(n.op==="*"){b=walk(n.right);return a.mul(b);}
        if(n.op==="/"){
          b=walk(n.right);if(b.degree>0)throw new UnsupportedSymbolicError("Variable denominator is not polynomial");
          var c=b.get(0);if(c.isZero())throw new M.DivisionByZeroError();return a.scale(c.inv());
        }
        if(n.op==="^"){
          if(!isIntegerLiteral(n.right)||n.right.value.n<0n)throw new UnsupportedSymbolicError("Polynomial powers require a non-negative integer exponent");
          var exp=Number(n.right.value.n);if(exp>32)throw new UnsupportedSymbolicError("Polynomial exponent exceeds the Phase 2 limit");
          return a.pow(exp);
        }
      }
      throw new UnsupportedSymbolicError("Expression is not a polynomial in "+variable);
    }
    return walk(simplifyAst(ast)).normalize();
  }
}

function asRational(v){if(v instanceof M.Rational)return v;if(typeof v==="bigint")return new M.Rational(v);if(Number.isSafeInteger(v))return new M.Rational(BigInt(v));throw new UnsupportedSymbolicError("Expected an exact rational coefficient");}
function polynomialGcd(a,b){
  a=a.clone();b=b.clone();while(!b.isZero()){var rem=a.divmod(b).remainder;a=b;b=rem;}return a.isZero()?new Polynomial(a.variable):a.monic();
}

class RationalFunction{
  constructor(numerator,denominator){this.numerator=numerator;this.denominator=denominator;}
  static fromAst(ast,variable){
    function walk(n){
      if(n.type==="literal"||n.type==="identifier"||n.type==="unary"){
        if(n.type==="unary"){var u=walk(n.arg);return n.op==="-"?new RationalFunction(u.numerator.scale(rat(-1)),u.denominator):u;}
        return new RationalFunction(Polynomial.fromAst(n,variable),Polynomial.constant(variable,rat(1)));
      }
      if(n.type==="binary"){
        var a=walk(n.left),b=walk(n.right);
        if(n.op==="+")return new RationalFunction(a.numerator.mul(b.denominator).add(b.numerator.mul(a.denominator)),a.denominator.mul(b.denominator));
        if(n.op==="-")return new RationalFunction(a.numerator.mul(b.denominator).sub(b.numerator.mul(a.denominator)),a.denominator.mul(b.denominator));
        if(n.op==="*")return new RationalFunction(a.numerator.mul(b.numerator),a.denominator.mul(b.denominator));
        if(n.op==="/"){
          if(b.numerator.isZero())throw new M.DivisionByZeroError();
          return new RationalFunction(a.numerator.mul(b.denominator),a.denominator.mul(b.numerator));
        }
        if(n.op==="^"){
          if(!isIntegerLiteral(n.right))throw new UnsupportedSymbolicError("Rational-function powers require integer exponents");
          var e=Number(n.right.value.n);if(Math.abs(e)>32)throw new UnsupportedSymbolicError("Rational-function exponent exceeds the Phase 2 limit");
          if(e>=0)return new RationalFunction(a.numerator.pow(e),a.denominator.pow(e));
          return new RationalFunction(a.denominator.pow(-e),a.numerator.pow(-e));
        }
      }
      throw new UnsupportedSymbolicError("Expression is not a rational function in "+variable);
    }
    return walk(simplifyAst(ast)).reduce();
  }
  reduce(){
    if(this.denominator.isZero())throw new M.DivisionByZeroError();
    var g=polynomialGcd(this.numerator,this.denominator),n=this.numerator,d=this.denominator;
    if(!g.isZero()&&g.degree>=0){var nd=n.divmod(g),dd=d.divmod(g);if(nd.remainder.isZero()&&dd.remainder.isZero()){n=nd.quotient;d=dd.quotient;}}
    var lead=d.leading();if(!lead.equals(rat(1))){n=n.scale(lead.inv());d=d.scale(lead.inv());}
    if(d.leading().n<0n){n=n.scale(rat(-1));d=d.scale(rat(-1));}
    return new RationalFunction(n,d);
  }
  toAst(){return this.denominator.degree===0&&this.denominator.get(0).equals(rat(1))?this.numerator.toAst():bin("/",this.numerator.toAst(),this.denominator.toAst());}
}

class SymbolicExpression{
  constructor(sourceOrAst,options){
    options=options||{};
    this.ast=typeof sourceOrAst==="string"?M.parseExpression(sourceOrAst):cloneAst(sourceOrAst);
    this.restrictions=uniqueRestrictions((options.restrictions||[]).concat(collectRestrictions(this.ast,{realDomain:options.realDomain!==false})));
  }
  simplify(variable){
    var ast=simplifyAst(this.ast),vars=Array.from(collectVariables(ast)),v=variable||((vars.length===1)?vars[0]:null);
    if(v){
      try{ast=RationalFunction.fromAst(ast,v).toAst();}catch(e){if(!(e instanceof UnsupportedSymbolicError))throw e;}
    }
    return new SymbolicExpression(ast,{restrictions:this.restrictions,realDomain:true});
  }
  expand(variable){
    var vars=Array.from(collectVariables(this.ast)),v=variable||((vars.length===1)?vars[0]:null);
    if(v){
      try{return new SymbolicExpression(Polynomial.fromAst(this.ast,v).toAst(),{restrictions:this.restrictions});}catch(e){if(!(e instanceof UnsupportedSymbolicError))throw e;}
    }
    return new SymbolicExpression(expandAst(this.ast),{restrictions:this.restrictions});
  }
  factor(variable){
    var v=singleVariable(this.ast,variable);if(!v) return this.simplify();
    var p=Polynomial.fromAst(this.ast,v),f=factorPolynomial(p);
    return new SymbolicExpression(f.ast,{restrictions:this.restrictions});
  }
  substitute(mapping){
    var parsed={};Object.keys(mapping||{}).forEach(k=>{parsed[k]=mapping[k] instanceof SymbolicExpression?mapping[k].ast:(typeof mapping[k]==="string"?M.parseExpression(mapping[k]):(mapping[k]&&mapping[k].type?mapping[k]:lit(mapping[k])));});
    return new SymbolicExpression(substituteAst(this.ast,parsed),{restrictions:this.restrictions}).simplify();
  }
  variables(){return Array.from(collectVariables(this.ast)).sort();}
  toString(){return printAst(this.ast);}
  toJSON(){return {type:"symbolic",ast:M.serializeAst(this.ast),restrictions:this.restrictions.map(r=>({ast:M.serializeAst(r.expression.ast),relation:r.relation,value:M.serializeValue(r.value)}))};}
  static fromJSON(data){return new SymbolicExpression(M.deserializeAst(data.ast),{restrictions:(data.restrictions||[]).map(r=>new Restriction(new SymbolicExpression(M.deserializeAst(r.ast)),r.relation,M.deserializeValue(r.value)))});}
}

function substituteAst(ast,map){
  if(ast.type==="identifier"&&Object.prototype.hasOwnProperty.call(map,ast.name))return cloneAst(map[ast.name]);
  if(ast.type==="literal"||ast.type==="identifier")return cloneAst(ast);
  if(ast.type==="unary"||ast.type==="postfix"){var c=cloneAst(ast);c.arg=substituteAst(ast.arg,map);return c;}
  if(ast.type==="binary")return bin(ast.op,substituteAst(ast.left,map),substituteAst(ast.right,map));
  if(ast.type==="call")return call(ast.name,ast.args.map(a=>substituteAst(a,map)));
  return cloneAst(ast);
}
function expandAst(ast){
  ast=simplifyAst(ast);
  if(ast.type==="binary"){
    if(ast.op==="^"&&isIntegerLiteral(ast.right)&&ast.right.value.n>=0n&&ast.right.value.n<=12n){
      var e=Number(ast.right.value.n),base=expandAst(ast.left),out=lit(rat(1));for(var i=0;i<e;i++)out=expandProduct(out,base);return simplifyAst(out);
    }
    if(ast.op==="*")return expandProduct(expandAst(ast.left),expandAst(ast.right));
    return simplifyAst(bin(ast.op,expandAst(ast.left),expandAst(ast.right)));
  }
  if(ast.type==="unary")return simplifyAst(unary(ast.op,expandAst(ast.arg)));
  if(ast.type==="call")return call(ast.name,ast.args.map(expandAst));
  return ast;
}
function expandProduct(a,b){
  if(a.type==="binary"&&(a.op==="+"||a.op==="-"))return simplifyAst(bin(a.op,expandProduct(a.left,b),expandProduct(a.right,b)));
  if(b.type==="binary"&&(b.op==="+"||b.op==="-"))return simplifyAst(bin(b.op,expandProduct(a,b.left),expandProduct(a,b.right)));
  return simplifyAst(bin("*",a,b));
}

function bigAbs(n){return n<0n?-n:n;}
function divisorsBig(n){
  n=bigAbs(n);if(n===0n)return [0n];if(n>1000000n)return [];
  var nn=Number(n),out=[];for(var i=1;i*i<=nn;i++)if(nn%i===0){out.push(BigInt(i));if(i*i!==nn)out.push(BigInt(nn/i));}
  return out.sort((a,b)=>Number(a-b));
}
function integerizedCoefficients(p){
  var degrees=Array.from(p.coefficients.keys()),lcm=1n;degrees.forEach(d=>{lcm=M.lcmBig(lcm,p.get(d).d);});
  var ints=[];for(var i=0;i<=p.degree;i++)ints.push(p.get(i).n*(lcm/p.get(i).d));
  var g=0n;ints.forEach(v=>{g=M.gcdBig(g,v);});if(g!==0n)ints=ints.map(v=>v/g);return ints;
}
function rationalRootCandidates(p){
  if(p.degree<1)return [];
  var ints=integerizedCoefficients(p),constant=ints[0],leading=ints[ints.length-1];
  if(constant===0n)return [rat(0)];
  var ps=divisorsBig(constant),qs=divisorsBig(leading);if(!ps.length||!qs.length)return [];
  var seen=new Set(),out=[];ps.forEach(a=>qs.forEach(b=>{[1n,-1n].forEach(s=>{var r=new M.Rational(s*a,b),k=r.toString();if(!seen.has(k)){seen.add(k);out.push(r);}});}));
  return out;
}
function syntheticDivide(p,root){
  var n=p.degree;if(n<1)return {quotient:new Polynomial(p.variable),remainder:p.get(0)};
  var q=new Polynomial(p.variable),next=p.get(n);q.set(n-1,next);
  for(var k=n-1;k>=1;k--){next=p.get(k).add(root.mul(next));q.set(k-1,next);}
  return {quotient:q.normalize(),remainder:p.get(0).add(root.mul(next))};
}
function perfectRationalSqrt(v){
  if(!(v instanceof M.Rational)||v.n<0n)return null;
  var s=M.sqrtValue(v,false);return s instanceof M.Rational?s:null;
}
function factorPolynomial(p){
  if(p.degree<=0)return {ast:p.toAst(),roots:[],residual:p};
  var current=p.clone(),roots=[];
  while(current.degree>2){
    var candidates=rationalRootCandidates(current),found=null;
    for(var i=0;i<candidates.length;i++)if(current.evaluate(candidates[i]).isZero()){found=candidates[i];break;}
    if(found===null)break;roots.push(found);current=syntheticDivide(current,found).quotient;
  }
  if(current.degree===2){
    var a=current.get(2),b=current.get(1),c=current.get(0),disc=b.mul(b).sub(a.mul(c).mul(rat(4))),sd=perfectRationalSqrt(disc);
    if(sd){var den=a.mul(rat(2)),r1=b.neg().add(sd).div(den),r2=b.neg().sub(sd).div(den);roots.push(r1,r2);current=Polynomial.constant(p.variable,a);}
  }else if(current.degree===1){
    roots.push(current.get(0).neg().div(current.get(1)));current=Polynomial.constant(p.variable,current.get(1));
  }
  var ast=current.toAst();roots.forEach(r=>{ast=bin("*",ast,bin("-",id(p.variable),lit(r)));});
  return {ast:simplifyAst(ast),roots:roots,residual:current};
}

function splitRelation(source,allowed){
  var s=M.normalizeInput(source),depth=0,found=null,ops=allowed||["<=",">=","!=","=","<",">"];
  for(var i=0;i<s.length;i++){
    var c=s[i];if(c==="(")depth++;else if(c===")")depth--;if(depth!==0)continue;
    for(var j=0;j<ops.length;j++){var op=ops[j];if(s.slice(i,i+op.length)===op){if(found)throw new EquationError("Expression contains more than one top-level relation");found={op:op,index:i};i+=op.length-1;break;}}
  }
  if(!found)return null;
  return {left:s.slice(0,found.index).trim(),right:s.slice(found.index+found.op.length).trim(),op:found.op};
}
class Equation{
  constructor(left,right,options){
    options=options||{};this.left=left instanceof SymbolicExpression?left:new SymbolicExpression(left,options);this.right=right instanceof SymbolicExpression?right:new SymbolicExpression(right,options);
    this.restrictions=uniqueRestrictions(this.left.restrictions.concat(this.right.restrictions));
  }
  static parse(source,options){
    var r=splitRelation(source,["="]);if(!r)throw new EquationError("Expected an equation containing '='");
    if(!r.left||!r.right)throw new EquationError("Both sides of the equation are required");return new Equation(r.left,r.right,options);
  }
  variables(){return Array.from(new Set(this.left.variables().concat(this.right.variables()))).sort();}
  toString(){return this.left.toString()+" = "+this.right.toString();}
}

class SolutionValue{
  constructor(expression,approximate,verified){this.expression=expression instanceof SymbolicExpression?expression:new SymbolicExpression(expression);this.approximate=approximate;this.verified=verified!==false;}
  toString(){return this.expression.toString();}
}
class SolutionSet{
  constructor(variable,type,values,options){options=options||{};this.variable=variable;this.type=type;this.values=values||[];this.restrictions=options.restrictions||[];this.partial=!!options.partial;}
  toString(){
    if(this.type==="empty")return "∅";
    if(this.type==="all")return this.variable+" ∈ ℝ";
    if(this.type==="finite"){
      if(this.values.length===1)return this.variable+" = "+this.values[0].toString();
      return this.variable+" ∈ {"+this.values.map(v=>v.toString()).join(", ")+"}";
    }
    return String(this.type);
  }
}

function makeQuadraticRoot(a,b,disc,sign){
  var num=bin(sign>0?"+":"-",lit(b.neg()),call("sqrt",[lit(disc)])),den=lit(a.mul(rat(2)));
  return new SymbolicExpression(simplifyAst(bin("/",num,den)));
}
function candidateApprox(sol){
  if(sol.expression.ast.type==="literal")return sol.expression.ast.value;
  try{return M.evaluateAst(sol.expression.ast,{}, {complex:true},0);}catch(e){return sol.approximate;}
}
function verifyEquationCandidate(eq,variable,candidate){
  var value=candidate instanceof SolutionValue?candidateApprox(candidate):candidate,env={};env[variable]=value;
  try{var l=M.evaluateAst(eq.left.ast,env,{complex:true},0),r=M.evaluateAst(eq.right.ast,env,{complex:true},0),d=M.sub(l,r);return M.isZero(d)||Math.abs(M.toNumber(d))<1e-9;}catch(e){return false;}
}
function restrictionAccepts(restrictions,variable,value){return restrictions.every(r=>r.accepts(variable,value));}
function solvePolynomial(p,domain){
  var d=p.degree,solutions=[];domain=domain||"real";
  if(d===-Infinity)return {type:"all",solutions:[]};
  if(d===0)return {type:"empty",solutions:[]};
  if(d===1){var root=p.get(0).neg().div(p.get(1));return {type:"finite",solutions:[new SolutionValue(new SymbolicExpression(lit(root)),root,true)]};}
  if(d===2){
    var a=p.get(2),b=p.get(1),c=p.get(0),disc=b.mul(b).sub(a.mul(c).mul(rat(4))),den=a.mul(rat(2));
    if(disc.n<0n&&domain!=="complex")return {type:"empty",solutions:[]};
    var sd=perfectRationalSqrt(disc);
    if(sd){
      var r1=b.neg().add(sd).div(den),r2=b.neg().sub(sd).div(den);solutions.push(new SolutionValue(new SymbolicExpression(lit(r1)),r1,true));if(!r2.equals(r1))solutions.push(new SolutionValue(new SymbolicExpression(lit(r2)),r2,true));
      return {type:"finite",solutions:solutions};
    }
    if(disc.n>=0n){
      var s1=makeQuadraticRoot(a,b,disc,1),s2=makeQuadraticRoot(a,b,disc,-1),discNum=disc.toNumber(),aa=a.toNumber(),bb=b.toNumber();
      solutions.push(new SolutionValue(s1,(-bb+Math.sqrt(discNum))/(2*aa),true));solutions.push(new SolutionValue(s2,(-bb-Math.sqrt(discNum))/(2*aa),true));return {type:"finite",solutions:solutions};
    }
    var pos=disc.neg(),sqrtPos=perfectRationalSqrt(pos),sqrtAst=sqrtPos?lit(sqrtPos):call("sqrt",[lit(pos)]),imag=bin("*",id("i"),sqrtAst);
    var e1=new SymbolicExpression(bin("/",bin("+",lit(b.neg()),imag),lit(den))),e2=new SymbolicExpression(bin("/",bin("-",lit(b.neg()),imag),lit(den)));
    return {type:"finite",solutions:[new SolutionValue(e1,null,true),new SolutionValue(e2,null,true)]};
  }
  var fact=factorPolynomial(p),values=fact.roots.map(r=>new SolutionValue(new SymbolicExpression(lit(r)),r,true));
  if(fact.residual.degree<=0)return {type:"finite",solutions:dedupeSolutions(values)};
  throw new UnsupportedSymbolicError("Polynomial solving is certified for linear, quadratic, and higher-degree polynomials reducible by exact rational roots",{degree:d,knownRoots:values.map(v=>v.toString())});
}
function dedupeSolutions(values){
  var seen=new Set(),out=[];values.forEach(v=>{var k=v.toString();if(!seen.has(k)){seen.add(k);out.push(v);}});return out;
}
function solveAbsPattern(eq,variable,options){
  var l=simplifyAst(eq.left.ast),r=simplifyAst(eq.right.ast),absNode=null,constNode=null;
  if(l.type==="call"&&l.name==="abs"&&l.args.length===1&&isLit(r)&&isRat(r.value)){absNode=l;constNode=r;}
  else if(r.type==="call"&&r.name==="abs"&&r.args.length===1&&isLit(l)&&isRat(l.value)){absNode=r;constNode=l;}
  if(!absNode)return null;if(constNode.value.n<0n)return new SolutionSet(variable,"empty",[],{restrictions:eq.restrictions});
  var c=constNode.value,eq1=new Equation(new SymbolicExpression(absNode.args[0]),new SymbolicExpression(lit(c))),eq2=new Equation(new SymbolicExpression(absNode.args[0]),new SymbolicExpression(lit(c.neg())));
  var a=solveEquation(eq1,variable,Object.assign({},options,{patterns:false})),b=c.isZero()?new SolutionSet(variable,"empty",[]):solveEquation(eq2,variable,Object.assign({},options,{patterns:false}));
  return new SolutionSet(variable,"finite",dedupeSolutions((a.values||[]).concat(b.values||[])),{restrictions:eq.restrictions});
}
function solveSqrtPattern(eq,variable,options){
  var l=simplifyAst(eq.left.ast),r=simplifyAst(eq.right.ast),sq=null,c=null;
  if(l.type==="call"&&l.name==="sqrt"&&l.args.length===1&&isLit(r)&&isRat(r.value)){sq=l;c=r.value;}
  else if(r.type==="call"&&r.name==="sqrt"&&r.args.length===1&&isLit(l)&&isRat(l.value)){sq=r;c=l.value;}
  if(!sq)return null;if(c.n<0n)return new SolutionSet(variable,"empty",[],{restrictions:eq.restrictions});
  var squared=c.mul(c),candidateEq=new Equation(new SymbolicExpression(sq.args[0]),new SymbolicExpression(lit(squared)));
  var result=solveEquation(candidateEq,variable,Object.assign({},options,{patterns:false}));
  if(result.type==="finite")result.values=result.values.filter(v=>verifyEquationCandidate(eq,variable,v));
  result.restrictions=eq.restrictions;return result;
}
function solveEquation(eqOrSource,variable,options){
  options=options||{};var eq=eqOrSource instanceof Equation?eqOrSource:Equation.parse(eqOrSource,{realDomain:options.domain!=="complex"}),vars=eq.variables();
  variable=variable||singleVariable(bin("-",eq.left.ast,eq.right.ast));if(!variable)throw new EquationError("No variable found to solve for");
  if(vars.some(v=>v!==variable))throw new UnsupportedSymbolicError("Equation contains additional symbolic variables",{variables:vars});
  if(options.patterns!==false){
    var abs=solveAbsPattern(eq,variable,options);if(abs)return abs;
    var sq=solveSqrtPattern(eq,variable,options);if(sq)return sq;
  }
  var left=RationalFunction.fromAst(eq.left.ast,variable),right=RationalFunction.fromAst(eq.right.ast,variable);
  var numerator=left.numerator.mul(right.denominator).sub(right.numerator.mul(left.denominator));
  var solved=solvePolynomial(numerator,options.domain||"real"),values=solved.solutions||[];
  values=values.filter(v=>{
    var candidate=candidateApprox(v);return restrictionAccepts(eq.restrictions,variable,candidate)&&verifyEquationCandidate(eq,variable,v);
  });
  return new SolutionSet(variable,solved.type==="finite"?(values.length?"finite":"empty"):solved.type,values,{restrictions:eq.restrictions});
}

function linearForm(ast,variables){
  var varSet=new Set(variables);
  function empty(){return {constant:rat(0),coeff:new Map()};}
  function addForms(a,b,sgn){
    var out={constant:sgn===1?a.constant.add(b.constant):a.constant.sub(b.constant),coeff:new Map(a.coeff)};
    b.coeff.forEach((v,k)=>out.coeff.set(k,(out.coeff.get(k)||rat(0))[sgn===1?"add":"sub"](v)));
    return out;
  }
  function scaleForm(a,c){var out={constant:a.constant.mul(c),coeff:new Map()};a.coeff.forEach((v,k)=>out.coeff.set(k,v.mul(c)));return out;}
  function constantOnly(a){return a.coeff.size===0;}
  function walk(n){
    n=simplifyAst(n);
    if(n.type==="literal"){if(!isRat(n.value))throw new UnsupportedSymbolicError("Linear systems require exact rational coefficients");return {constant:n.value,coeff:new Map()};}
    if(n.type==="identifier"){
      if(!varSet.has(n.name))throw new UnsupportedSymbolicError("Unknown symbolic parameter '"+n.name+"' in linear system");
      var f=empty();f.coeff.set(n.name,rat(1));return f;
    }
    if(n.type==="unary"){var u=walk(n.arg);return n.op==="-"?scaleForm(u,rat(-1)):u;}
    if(n.type==="binary"){
      var a=walk(n.left),b=walk(n.right);
      if(n.op==="+")return addForms(a,b,1);if(n.op==="-")return addForms(a,b,-1);
      if(n.op==="*"){
        if(constantOnly(a))return scaleForm(b,a.constant);if(constantOnly(b))return scaleForm(a,b.constant);
        throw new UnsupportedSymbolicError("System is nonlinear");
      }
      if(n.op==="/"){
        if(!constantOnly(b)||b.constant.isZero())throw new UnsupportedSymbolicError("Linear-system denominator must be a nonzero constant");
        return scaleForm(a,b.constant.inv());
      }
      if(n.op==="^"&&isIntegerLiteral(n.right)){
        if(n.right.value.n===1n)return a;if(n.right.value.n===0n)return {constant:rat(1),coeff:new Map()};
      }
    }
    throw new UnsupportedSymbolicError("System contains a nonlinear or unsupported expression");
  }
  return walk(ast);
}

class LinearSystemSolution{
  constructor(type,variables,values,freeVariables){this.type=type;this.variables=variables;this.values=values||{};this.freeVariables=freeVariables||[];}
  toString(){
    if(this.type==="inconsistent")return "No solution";
    if(this.type==="unique")return this.variables.map(v=>v+" = "+this.values[v].toString()).join(", ");
    return this.variables.map(v=>v+" = "+(this.values[v]?this.values[v].toString():"free")).join(", ")+"; free: "+this.freeVariables.join(", ");
  }
}
function solveLinearSystem(equations,variables){
  var eqs=equations.map(e=>e instanceof Equation?e:Equation.parse(e)),allVars=new Set();eqs.forEach(e=>e.variables().forEach(v=>allVars.add(v)));
  variables=(variables&&variables.length?variables.slice():Array.from(allVars).sort());if(!variables.length)throw new EquationError("No system variables found");
  var rows=eqs.map(eq=>{
    var diff=bin("-",eq.left.ast,eq.right.ast),f=linearForm(diff,variables),row=variables.map(v=>f.coeff.get(v)||rat(0));row.push(f.constant.neg());return row;
  });
  var reduced=M.rref(rows),R=reduced.matrix,n=variables.length;
  for(var i=0;i<R.length;i++){var allZero=true;for(var j=0;j<n;j++)if(!M.isZero(R[i][j])){allZero=false;break;}if(allZero&&!M.isZero(R[i][n]))return new LinearSystemSolution("inconsistent",variables,{},[]);}
  var pivotRows={},pivotCols=[];
  for(var r=0;r<R.length;r++){for(var c=0;c<n;c++)if(!M.isZero(R[r][c])){pivotRows[c]=r;pivotCols.push(c);break;}}
  var free=[];for(var c=0;c<n;c++)if(pivotCols.indexOf(c)<0)free.push(c);
  var values={};
  if(!free.length){
    pivotCols.forEach(c=>{values[variables[c]]=new SymbolicExpression(lit(R[pivotRows[c]][n]));});
    return new LinearSystemSolution("unique",variables,values,[]);
  }
  pivotCols.forEach(c=>{
    var row=R[pivotRows[c]],expr=lit(row[n]);free.forEach(fc=>{if(!M.isZero(row[fc]))expr=bin("-",expr,bin("*",lit(row[fc]),id(variables[fc])));});
    values[variables[c]]=new SymbolicExpression(simplifyAst(expr));
  });
  free.forEach(fc=>{values[variables[fc]]=new SymbolicExpression(id(variables[fc]));});
  return new LinearSystemSolution("parametric",variables,values,free.map(i=>variables[i]));
}

class IntervalUnion{
  constructor(variable,intervals){this.variable=variable;this.intervals=intervals||[];}
  toString(){
    if(!this.intervals.length)return "∅";
    return this.intervals.map(iv=>{
      var l=iv.lo===null?"−∞":endpointString(iv.lo),h=iv.hi===null?"∞":endpointString(iv.hi);
      return (iv.loClosed?"[":"(")+l+", "+h+(iv.hiClosed?"]":")");
    }).join(" ∪ ");
  }
}
function endpointString(x){return x instanceof SymbolicExpression?x.toString():M.formatValue(x);}
function endpointApprox(x){if(x===null)return null;if(x instanceof SymbolicExpression){try{return M.toNumber(M.evaluateAst(x.ast,{}, {complex:false},0));}catch(e){return NaN;}}return M.toNumber(x);}
function parseInequality(source){
  var rel=splitRelation(source,["<=",">=","<",">"]);if(!rel)throw new EquationError("Expected an inequality containing <, ≤, >, or ≥");
  return {left:new SymbolicExpression(rel.left),right:new SymbolicExpression(rel.right),op:rel.op};
}
function relationTrue(v,op){if(op==="<")return v<0;if(op==="<=")return v<=0;if(op===">")return v>0;if(op===">=")return v>=0;return false;}
function solveInequality(source,variable){
  var ineq=parseInequality(source),combined=bin("-",ineq.left.ast,ineq.right.ast);variable=variable||singleVariable(combined);if(!variable)throw new EquationError("No variable found");
  var p=Polynomial.fromAst(combined,variable);if(p.degree>2)throw new UnsupportedSymbolicError("Inequality solving is currently certified for linear and quadratic polynomials");
  if(p.degree===-Infinity||p.degree===0)return new IntervalUnion(variable,relationTrue(p.get(0).toNumber(),ineq.op)?[{lo:null,hi:null,loClosed:false,hiClosed:false}]:[]);
  var rootsData=solvePolynomial(p,"real"),roots=(rootsData.solutions||[]).map(v=>({endpoint:v.expression,approx:M.toNumber(candidateApprox(v))})).filter(x=>Number.isFinite(x.approx)).sort((a,b)=>a.approx-b.approx);
  if(!roots.length){
    var val=p.evaluate(rat(0)).toNumber();return new IntervalUnion(variable,relationTrue(val,ineq.op)?[{lo:null,hi:null,loClosed:false,hiClosed:false}]:[]);
  }
  var uniq=[];roots.forEach(r=>{if(!uniq.length||Math.abs(uniq[uniq.length-1].approx-r.approx)>1e-10)uniq.push(r);});roots=uniq;
  var boundaries=[null].concat(roots).concat([null]),segments=[];
  for(var i=0;i<boundaries.length-1;i++){
    var left=boundaries[i],right=boundaries[i+1],test;
    if(left===null)test=right.approx-1-Math.abs(right.approx);else if(right===null)test=left.approx+1+Math.abs(left.approx);else test=(left.approx+right.approx)/2;
    var val=0;for(var d=p.degree;d>=0;d--)val=val*test+p.get(d).toNumber();
    if(relationTrue(val,ineq.op))segments.push({lo:left?left.endpoint:null,hi:right?right.endpoint:null,loClosed:false,hiClosed:false});
  }
  var includeRoots=ineq.op==="<="||ineq.op===">=";
  if(includeRoots)roots.forEach(root=>{
    var merged=false;for(var s=0;s<segments.length;s++){var iv=segments[s];if(iv.hi&&endpointString(iv.hi)===root.endpoint.toString()){iv.hiClosed=true;merged=true;}if(iv.lo&&endpointString(iv.lo)===root.endpoint.toString()){iv.loClosed=true;merged=true;}}
    if(!merged)segments.push({lo:root.endpoint,hi:root.endpoint,loClosed:true,hiClosed:true});
  });
  segments.sort((a,b)=>(a.lo===null?-Infinity:endpointApprox(a.lo))-(b.lo===null?-Infinity:endpointApprox(b.lo)));
  return new IntervalUnion(variable,segments);
}

function simplify(source,variable){return new SymbolicExpression(source).simplify(variable);}
function expand(source,variable){return new SymbolicExpression(source).expand(variable);}
function factor(source,variable){return new SymbolicExpression(source).factor(variable);}
function substitute(source,mapping){return new SymbolicExpression(source).substitute(mapping);}

function splitArgs(text){
  var out=[],depth=0,start=0;
  for(var i=0;i<text.length;i++){if(text[i]==="(")depth++;else if(text[i]===")")depth--;else if(text[i]===","&&depth===0){out.push(text.slice(start,i).trim());start=i+1;}}
  out.push(text.slice(start).trim());return out;
}
function commandResult(display,kind,details){
  return {value:details&&details.value!==undefined?details.value:null,display:display,approx:details&&details.approx||"",exact:details&&details.exact!==undefined?details.exact:true,kind:kind||"symbolic",symbolic:true,metadata:Object.assign({numericKind:kind||"symbolic",exact:true},details&&details.metadata||{})};
}
function runCommand(raw,options){
  raw=String(raw).trim();options=options||{};
  var m=raw.match(/^(simplify|expand|factor|solve|inequality|substitute)\s*\((.*)\)$/s);if(!m)return null;
  var cmd=m[1],args=splitArgs(m[2]);
  if(cmd==="simplify"){if(args.length<1||args.length>2)throw new M.ArityError("simplify",1,args.length);var se=simplify(args[0],args[1]);return commandResult(se.toString(),"symbolic",{value:se,metadata:{operation:"simplify",restrictions:se.restrictions.map(r=>r.toString())}});}
  if(cmd==="expand"){var ex=expand(args[0],args[1]);return commandResult(ex.toString(),"symbolic",{value:ex,metadata:{operation:"expand",restrictions:ex.restrictions.map(r=>r.toString())}});}
  if(cmd==="factor"){var fa=factor(args[0],args[1]);return commandResult(fa.toString(),"symbolic",{value:fa,metadata:{operation:"factor",restrictions:fa.restrictions.map(r=>r.toString())}});}
  if(cmd==="solve"){
    if(args.length<1||args.length>3)throw new EquationError("solve expects solve(equation, variable?)");
    var ss=solveEquation(args[0],args[1]||undefined,{domain:args[2]||"real"}),display=ss.toString();
    if(ss.restrictions.length)display+="   where "+ss.restrictions.map(r=>r.toString()).join(", ");
    return commandResult(display,"solution-set",{value:ss,metadata:{operation:"solve",variable:ss.variable,restrictions:ss.restrictions.map(r=>r.toString())}});
  }
  if(cmd==="inequality"){
    var iu=solveInequality(args[0],args[1]||undefined);return commandResult(iu.variable+" ∈ "+iu.toString(),"interval-union",{value:iu,metadata:{operation:"inequality"}});
  }
  if(cmd==="substitute"){
    if(args.length!==3)throw new EquationError("substitute expects substitute(expression, variable, value)");
    var su=substitute(args[0],{[args[1]]:args[2]});return commandResult(su.toString(),"symbolic",{value:su,metadata:{operation:"substitute"}});
  }
  return null;
}

global.CalcAlgebra={
  VERSION:"1.0.0-symbolic",
  AlgebraError:AlgebraError,UnsupportedSymbolicError:UnsupportedSymbolicError,EquationError:EquationError,InconsistentSystemError:InconsistentSystemError,
  SymbolicExpression:SymbolicExpression,Restriction:Restriction,Polynomial:Polynomial,RationalFunction:RationalFunction,Equation:Equation,SolutionValue:SolutionValue,SolutionSet:SolutionSet,LinearSystemSolution:LinearSystemSolution,IntervalUnion:IntervalUnion,
  printAst:printAst,simplifyAst:simplifyAst,expandAst:expandAst,collectVariables:collectVariables,collectRestrictions:collectRestrictions,substituteAst:substituteAst,
  simplify:simplify,expand:expand,factor:factor,substitute:substitute,
  solveEquation:solveEquation,solveLinearSystem:solveLinearSystem,solveInequality:solveInequality,
  runCommand:runCommand
};
})(window);