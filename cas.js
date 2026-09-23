(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
if(!M||!A||!C)throw new Error("CalcMath, CalcAlgebra, and CalcCalculus must load before CalcCAS");

class CASError extends M.CalcError{
  constructor(code,message,details){super(code||"CAS_ERROR",message,undefined,undefined,details);}
}
class UnsupportedCASError extends CASError{
  constructor(message,details){super("UNSUPPORTED_CAS",message,details);}
}
class ConditionalSolution{
  constructor(variable,branches,metadata){
    this.variable=variable;this.branches=branches||[];this.metadata=metadata||{};
  }
  toString(){return this.branches.map(function(b){return b.result+"  if "+b.condition;}).join("; ");}
}
class ParametricFamily{
  constructor(variable,expression,parameter,parameterSet){
    this.variable=variable;this.expression=expression;this.parameter=parameter||"k";this.parameterSet=parameterSet||"ℤ";
  }
  toString(){return this.variable+" = "+this.expression.toString()+", "+this.parameter+" ∈ "+this.parameterSet;}
}
class NonlinearSystemSolution{
  constructor(variables,solutions){this.variables=variables;this.solutions=solutions||[];}
  toString(){
    if(!this.solutions.length)return "No solution";
    return this.solutions.map(function(sol){
      return "{"+Object.keys(sol).map(function(v){return v+" = "+sol[v].toString();}).join(", ")+"}";
    }).join(" or ");
  }
}
class ParameterSystemSolution{
  constructor(variables,generic,determinant,parameters,branches,restrictions){
    this.variables=variables;this.generic=generic||{};this.determinant=determinant;this.parameters=parameters||[];
    this.branches=branches||[];this.restrictions=restrictions||[];
  }
  toString(){
    var detText=this.determinant.toString(),parts=[];
    if(Object.keys(this.generic).length){
      parts.push("if "+detText+" ≠ 0: "+this.variables.map(v=>v+" = "+this.generic[v].toString()).join(", "));
    }else parts.push("det = 0 identically; no generic unique branch");
    this.branches.forEach(function(b){parts.push(b.condition+": "+b.result);});
    if(this.restrictions.length)parts.push("domain: "+this.restrictions.join(", "));
    return parts.join("; ");
  }
}

function rat(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function lit(v){return {type:"literal",value:v,start:0,end:0};}
function id(name){return {type:"identifier",name:name,start:0,end:0};}
function unary(op,arg){return {type:"unary",op:op,arg:arg,start:0,end:0};}
function bin(op,left,right){return {type:"binary",op:op,left:left,right:right,start:0,end:0};}
function call(name,args){return {type:"call",name:name,args:args,start:0,end:0};}
function cloneAst(ast){
  if(!ast||typeof ast!=="object")return ast;
  if(ast.type==="literal")return lit(ast.value);
  if(ast.type==="identifier")return id(ast.name);
  if(ast.type==="unary")return unary(ast.op,cloneAst(ast.arg));
  if(ast.type==="postfix")return {type:"postfix",op:ast.op,arg:cloneAst(ast.arg),start:0,end:0};
  if(ast.type==="binary")return bin(ast.op,cloneAst(ast.left),cloneAst(ast.right));
  if(ast.type==="call")return call(ast.name,ast.args.map(cloneAst));
  return M.deserializeAst(M.serializeAst(ast));
}
function exactInt(node){
  return node&&node.type==="literal"&&node.value instanceof M.Rational&&node.value.d===1n?Number(node.value.n):null;
}
function isZeroAst(ast){
  ast=A.simplifyAst(ast);
  return ast.type==="literal"&&M.isZero(ast.value);
}
function isOneAst(ast){
  ast=A.simplifyAst(ast);
  return ast.type==="literal"&&ast.value instanceof M.Rational&&ast.value.equals(rat(1));
}
function astText(ast){return A.printAst(A.simplifyAst(ast));}
function varsOf(ast){return Array.from(A.collectVariables(ast)).sort();}
function hasVar(ast,name){return A.collectVariables(ast).has(name);}
function commandResult(display,kind,details){
  details=details||{};
  return {
    value:details.value===undefined?null:details.value,
    display:String(display),
    approx:details.approx||"",
    exact:details.exact===undefined?true:!!details.exact,
    kind:kind||"cas",
    symbolic:details.symbolic===undefined?true:!!details.symbolic,
    metadata:Object.assign({numericKind:kind||"cas",exact:details.exact===undefined?true:!!details.exact,cas:true},details.metadata||{})
  };
}
function splitTopLevel(source,delimiter){
  source=String(source);var out=[],start=0,depth=0;
  for(var i=0;i<source.length;i++){
    var ch=source[i];
    if(ch==="("||ch==="["||ch==="{")depth++;
    else if(ch===")"||ch==="]"||ch==="}")depth--;
    else if(ch===delimiter&&depth===0){out.push(source.slice(start,i).trim());start=i+1;}
  }
  out.push(source.slice(start).trim());
  return out.filter(function(x){return x.length>0;});
}
function splitArgs(source){return splitTopLevel(source,",");}
function splitRelation(source,ops){
  source=String(source);ops=ops||["<=",">=","!=","=","<",">"];var depth=0;
  for(var i=0;i<source.length;i++){
    var ch=source[i];
    if(ch==="("||ch==="["||ch==="{"){depth++;continue;}
    if(ch===")"||ch==="]"||ch==="}"){depth--;continue;}
    if(depth!==0)continue;
    for(var j=0;j<ops.length;j++){
      var op=ops[j];
      if(source.slice(i,i+op.length)===op)return {left:source.slice(0,i).trim(),op:op,right:source.slice(i+op.length).trim()};
    }
  }
  return null;
}
function flipRelation(op){
  return {">":"<","<":">",">=":"<=","<=":">=","=":"=","!=":"!="}[op]||op;
}
function displayRelation(op){return op===">="?">="===op?"≥":op:op==="<= "?"≤":op;}
function uniqueStrings(values){
  var seen=new Set(),out=[];values.forEach(function(v){v=String(v);if(!seen.has(v)){seen.add(v);out.push(v);}});return out;
}

function constantValue(ast){
  if(A.collectVariables(ast).size)return null;
  try{return M.evaluateAst(ast,{}, {complex:false,angle:"RAD"},0);}catch(e){return null;}
}
function compareZero(value){
  if(value instanceof M.Rational)return value.n<0n?-1:value.n>0n?1:0;
  var n=M.toNumber(value);return Number.isFinite(n)?(n<0?-1:n>0?1:0):null;
}

/* Assumptions ------------------------------------------------------------ */
function parseAssumption(source){
  var rel=splitRelation(source,["<=",">=","!=","=","<",">"]);
  if(!rel)throw new CASError("INVALID_ASSUMPTION","Assumption must use <, <=, >, >=, =, or !=",{assumption:source});
  var l=M.parseExpression(rel.left),r=M.parseExpression(rel.right),variable=null,op=rel.op,bound=null;
  if(l.type==="identifier"&&!Object.prototype.hasOwnProperty.call(M.CONSTANT_REGISTRY,l.name)){
    variable=l.name;bound=constantValue(r);
  }else if(r.type==="identifier"&&!Object.prototype.hasOwnProperty.call(M.CONSTANT_REGISTRY,r.name)){
    variable=r.name;bound=constantValue(l);op=flipRelation(op);
  }
  return {source:String(source).trim(),left:l,right:r,op:op,variable:variable,bound:bound};
}
function parseAssumptions(parts){return parts.map(parseAssumption);}
function zeroBound(assumption){
  return assumption.variable&&assumption.bound!==null&&compareZero(assumption.bound)===0;
}
function directSignMask(name,assumptions){
  var mask=7;
  assumptions.forEach(function(a){
    if(a.variable!==name||!zeroBound(a))return;
    var m=7;
    if(a.op===">")m=4;
    else if(a.op===">=")m=6;
    else if(a.op==="<")m=1;
    else if(a.op==="<=")m=3;
    else if(a.op==="=")m=2;
    else if(a.op==="!=")m=5;
    mask&=m;
  });
  return mask||7;
}
function maskSigns(mask){
  var out=[];if(mask&1)out.push(-1);if(mask&2)out.push(0);if(mask&4)out.push(1);return out;
}
function signsMask(signs){
  var m=0;signs.forEach(function(s){m|=s<0?1:s>0?4:2;});return m||7;
}
function multiplyMasks(a,b,division){
  var out=[];
  maskSigns(a).forEach(function(x){maskSigns(b).forEach(function(y){
    if(division&&y===0)return;
    if(x===0)out.push(0);else if(y===0)out.push(0);else out.push(x*y);
  });});
  return signsMask(out);
}
function signMask(ast,assumptions){
  ast=A.simplifyAst(ast);
  if(ast.type==="literal"){
    var s=compareZero(ast.value);return s===null?7:(s<0?1:s>0?4:2);
  }
  if(ast.type==="identifier")return directSignMask(ast.name,assumptions);
  if(ast.type==="unary"){
    var um=signMask(ast.arg,assumptions);
    if(ast.op!== "-")return um;
    var mapped=[];maskSigns(um).forEach(function(s){mapped.push(-s);});return signsMask(mapped);
  }
  if(ast.type==="call"){
    if(ast.name==="exp")return 4;
    if(ast.name==="abs"){var am=signMask(ast.args[0],assumptions);return (am&2)?6:4;}
    if(ast.name==="sqrt"){var sm=signMask(ast.args[0],assumptions);return sm===4?4:6;}
    return 7;
  }
  if(ast.type==="binary"){
    if(ast.op==="*")return multiplyMasks(signMask(ast.left,assumptions),signMask(ast.right,assumptions),false);
    if(ast.op==="/")return multiplyMasks(signMask(ast.left,assumptions),signMask(ast.right,assumptions),true);
    if(ast.op==="^"){
      var e=exactInt(ast.right),bm=signMask(ast.left,assumptions);
      if(e!==null){
        if(e===0)return 4;
        if(e%2===0)return (bm&2)?6:4;
        return bm;
      }
    }
  }
  return 7;
}
function exponentIsTwo(ast){return exactInt(ast)===2;}
function simplifyAssumedAst(ast,assumptions){
  if(ast.type==="literal"||ast.type==="identifier")return cloneAst(ast);
  if(ast.type==="unary")return A.simplifyAst(unary(ast.op,simplifyAssumedAst(ast.arg,assumptions)));
  if(ast.type==="postfix"){
    var pc=cloneAst(ast);pc.arg=simplifyAssumedAst(ast.arg,assumptions);return A.simplifyAst(pc);
  }
  if(ast.type==="binary"){
    return A.simplifyAst(bin(ast.op,simplifyAssumedAst(ast.left,assumptions),simplifyAssumedAst(ast.right,assumptions)));
  }
  if(ast.type==="call"){
    var args=ast.args.map(function(x){return simplifyAssumedAst(x,assumptions);}),node=call(ast.name,args);
    if(ast.name==="abs"&&args.length===1){
      var m=signMask(args[0],assumptions);
      if((m&~(4|2))===0&&!(m&1))return args[0];
      if((m&~(1|2))===0&&!(m&4))return A.simplifyAst(unary("-",args[0]));
    }
    if(ast.name==="sqrt"&&args.length===1&&args[0].type==="binary"&&args[0].op==="^"&&exponentIsTwo(args[0].right)){
      var base=args[0].left,bm=signMask(base,assumptions);
      if((bm&1)===0)return base;
      if((bm&4)===0)return A.simplifyAst(unary("-",base));
      return call("abs",[base]);
    }
    if(ast.name==="ln"&&args.length===1&&args[0].type==="call"&&args[0].name==="exp"&&args[0].args.length===1){
      return args[0].args[0];
    }
    if(ast.name==="exp"&&args.length===1&&args[0].type==="call"&&args[0].name==="ln"&&args[0].args.length===1){
      if(signMask(args[0].args[0],assumptions)===4)return args[0].args[0];
    }
    return A.simplifyAst(node);
  }
  return cloneAst(ast);
}
function simplifyWithAssumptions(source,variable,assumptions){
  var original=source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source);
  var ast=simplifyAssumedAst(original.ast,assumptions||[]);
  var expr=new A.SymbolicExpression(ast,{restrictions:original.restrictions});
  try{return expr.simplify(variable);}catch(e){return expr;}
}
function assumptionText(assumptions){return assumptions.map(function(a){return a.source;}).join(", ");}
function assumptionAcceptsNumber(a,name,value){
  if(a.variable!==name||a.bound===null)return true;
  var b=M.toNumber(a.bound);if(!Number.isFinite(b)||!Number.isFinite(value))return true;
  if(a.op===">")return value>b;if(a.op===">=")return value>=b;if(a.op==="<")return value<b;if(a.op==="<=")return value<=b;
  if(a.op==="=")return Math.abs(value-b)<1e-10;if(a.op==="!=")return Math.abs(value-b)>=1e-10;return true;
}
function approximateSolutionValue(sol){
  if(sol&&sol.approximate!==null&&sol.approximate!==undefined){
    try{return M.toNumber(sol.approximate);}catch(e){}
  }
  try{return M.toNumber(M.evaluateAst(sol.expression.ast,{}, {complex:false,angle:"RAD"},0));}catch(e){return NaN;}
}

/* Symbolic polynomials with parameter coefficients ----------------------- */
function polyTrim(p){
  p=p.map(function(x){return A.simplifyAst(x);});
  while(p.length>1&&isZeroAst(p[p.length-1]))p.pop();
  return p;
}
function polyZero(){return [lit(rat(0))];}
function polyAdd(a,b,sign){
  var n=Math.max(a.length,b.length),out=[];
  for(var i=0;i<n;i++){
    var av=a[i]||lit(rat(0)),bv=b[i]||lit(rat(0));
    out.push(A.simplifyAst(bin(sign<0?"-":"+",av,bv)));
  }
  return polyTrim(out);
}
function polyScale(a,s,divide){
  return polyTrim(a.map(function(c){return A.simplifyAst(bin(divide?"/":"*",c,cloneAst(s)));}));
}
function polyMul(a,b,maxDegree){
  var out=Array(Math.min(maxDegree+1,a.length+b.length-1)).fill(null).map(function(){return lit(rat(0));});
  for(var i=0;i<a.length;i++)for(var j=0;j<b.length;j++){
    if(i+j>maxDegree)throw new UnsupportedCASError("Symbolic polynomial degree exceeds the U1 limit",{maxDegree:maxDegree});
    out[i+j]=A.simplifyAst(bin("+",out[i+j],bin("*",cloneAst(a[i]),cloneAst(b[j]))));
  }
  return polyTrim(out);
}
function symbolicPolynomial(ast,variable,maxDegree){
  maxDegree=maxDegree||4;
  function walk(n){
    n=A.simplifyAst(n);
    if(!hasVar(n,variable))return [cloneAst(n)];
    if(n.type==="identifier"&&n.name===variable)return [lit(rat(0)),lit(rat(1))];
    if(n.type==="unary"){
      var up=walk(n.arg);return n.op==="-"?polyScale(up,lit(rat(-1)),false):up;
    }
    if(n.type==="binary"){
      if(n.op==="+")return polyAdd(walk(n.left),walk(n.right),1);
      if(n.op==="-")return polyAdd(walk(n.left),walk(n.right),-1);
      if(n.op==="*")return polyMul(walk(n.left),walk(n.right),maxDegree);
      if(n.op==="/"){
        if(hasVar(n.right,variable))throw new UnsupportedCASError("Parameterized polynomial denominator depends on "+variable);
        return polyScale(walk(n.left),n.right,true);
      }
      if(n.op==="^"){
        var e=exactInt(n.right);
        if(e===null||e<0||e>maxDegree)throw new UnsupportedCASError("Parameterized polynomial powers must be non-negative integers up to "+maxDegree);
        var base=walk(n.left),res=[lit(rat(1))];
        for(var k=0;k<e;k++)res=polyMul(res,base,maxDegree);
        return res;
      }
    }
    throw new UnsupportedCASError("Expression is not polynomial in "+variable,{expression:A.printAst(n)});
  }
  return polyTrim(walk(ast));
}
function equationDifference(source){
  var rel=splitRelation(source,["="]);
  if(!rel)throw new CASError("EQUATION_ERROR","Expected an equation containing '='");
  return {left:M.parseExpression(rel.left),right:M.parseExpression(rel.right),ast:A.simplifyAst(bin("-",M.parseExpression(rel.left),M.parseExpression(rel.right)))};
}
function makeRestriction(ast,relation){
  return new A.Restriction(new A.SymbolicExpression(ast),relation||"!=",rat(0));
}
function joinRestrictions(restrictions){
  return uniqueStrings((restrictions||[]).map(function(r){return typeof r==="string"?r:r.toString();}));
}
function parameterizedEquation(source,variable,domain){
  var eq=equationDifference(source),all=varsOf(eq.ast);
  if(!variable){
    if(all.length===1)variable=all[0];
    else throw new CASError("VARIABLE_REQUIRED","Parameterized solve requires an explicit solve variable",{variables:all});
  }
  var parameters=all.filter(function(v){return v!==variable;});
  if(!parameters.length)return null;
  var p=symbolicPolynomial(eq.ast,variable,2),degree=p.length-1;
  var original=new A.SymbolicExpression(eq.ast),domainRestrictions=original.restrictions.slice();
  if(degree===0){
    var constant=new A.SymbolicExpression(p[0]).toString();
    return new ConditionalSolution(variable,[
      {condition:constant+" = 0",result:variable+" ∈ ℝ"},
      {condition:constant+" ≠ 0",result:"∅"}
    ],{parameters:parameters,degree:0});
  }
  if(degree===1){
    var b=p[1],c=p[0],root=A.simplifyAst(bin("/",unary("-",cloneAst(c)),cloneAst(b))),re=new A.SymbolicExpression(root);
    return new ConditionalSolution(variable,[
      {condition:astText(b)+" ≠ 0",result:variable+" = "+re.toString()},
      {condition:astText(b)+" = 0 and "+astText(c)+" = 0",result:variable+" ∈ ℝ"},
      {condition:astText(b)+" = 0 and "+astText(c)+" ≠ 0",result:"∅"}
    ],{parameters:parameters,degree:1,restrictions:joinRestrictions(domainRestrictions)});
  }
  if(degree===2){
    var qa=p[2],qb=p[1],qc=p[0],disc=A.simplifyAst(bin("-",bin("^",cloneAst(qb),lit(rat(2))),bin("*",lit(rat(4)),bin("*",cloneAst(qa),cloneAst(qc))))),
      den=A.simplifyAst(bin("*",lit(rat(2)),cloneAst(qa))),sd=call("sqrt",[cloneAst(disc)]),
      r1=new A.SymbolicExpression(A.simplifyAst(bin("/",bin("+",unary("-",cloneAst(qb)),cloneAst(sd)),cloneAst(den)))),
      r2=new A.SymbolicExpression(A.simplifyAst(bin("/",bin("-",unary("-",cloneAst(qb)),cloneAst(sd)),cloneAst(den)))),
      linearRoot=new A.SymbolicExpression(A.simplifyAst(bin("/",unary("-",cloneAst(qc)),cloneAst(qb))));
    var branches=[];
    if((domain||"real")==="complex"){
      branches.push({condition:astText(qa)+" ≠ 0",result:variable+" ∈ {"+r1.toString()+", "+r2.toString()+"}"});
    }else{
      branches.push({condition:astText(qa)+" ≠ 0 and "+astText(disc)+" > 0",result:variable+" ∈ {"+r1.toString()+", "+r2.toString()+"}"});
      branches.push({condition:astText(qa)+" ≠ 0 and "+astText(disc)+" = 0",result:variable+" = "+new A.SymbolicExpression(A.simplifyAst(bin("/",unary("-",cloneAst(qb)),cloneAst(den)))).toString()});
      branches.push({condition:astText(qa)+" ≠ 0 and "+astText(disc)+" < 0",result:"∅"});
    }
    branches.push({condition:astText(qa)+" = 0 and "+astText(qb)+" ≠ 0",result:variable+" = "+linearRoot.toString()});
    branches.push({condition:astText(qa)+" = 0 and "+astText(qb)+" = 0 and "+astText(qc)+" = 0",result:variable+" ∈ ℝ"});
    branches.push({condition:astText(qa)+" = 0 and "+astText(qb)+" = 0 and "+astText(qc)+" ≠ 0",result:"∅"});
    return new ConditionalSolution(variable,branches,{parameters:parameters,degree:2,discriminant:new A.SymbolicExpression(disc),restrictions:joinRestrictions(domainRestrictions)});
  }
  throw new UnsupportedCASError("Parameterized exact solving is certified for degree 0, 1, and 2 equations",{degree:degree,parameters:parameters});
}
function solveEvenPolynomial(source,variable,domain){
  var eq=equationDifference(source),p;
  try{p=A.Polynomial.fromAst(eq.ast,variable);}catch(e){return null;}
  if(!Number.isFinite(p.degree)||p.degree<=2||p.degree>8||p.degree%2!==0)return null;
  for(var odd=1;odd<=p.degree;odd+=2)if(!p.get(odd).isZero())return null;
  var coeff=[];for(var d=0;d<=p.degree;d+=2)coeff.push(p.get(d));
  var q=new A.Polynomial("__u",coeff),uSolutions=A.solveEquation(q.toString()+" = 0","__u",{domain:domain||"real"});
  if(uSolutions.type!=="finite")return new A.SolutionSet(variable,uSolutions.type,[],{});
  var values=[];
  uSolutions.values.forEach(function(us){
    var uApprox=approximateSolutionValue(us);
    if((domain||"real")!=="complex"&&(!Number.isFinite(uApprox)||uApprox<-1e-10))return;
    var uAst=cloneAst(us.expression.ast);
    if(Math.abs(uApprox)<1e-12){
      values.push(new A.SolutionValue(new A.SymbolicExpression(lit(rat(0))),rat(0),true));return;
    }
    var rootExpr=new A.SymbolicExpression(A.simplifyAst(call("sqrt",[uAst])));
    values.push(new A.SolutionValue(rootExpr,Math.sqrt(Math.max(0,uApprox)),true));
    values.push(new A.SolutionValue(new A.SymbolicExpression(A.simplifyAst(unary("-",cloneAst(rootExpr.ast)))),-Math.sqrt(Math.max(0,uApprox)),true));
  });
  var seen=new Set(),dedup=[];
  values.forEach(function(v){var k=v.toString();if(!seen.has(k)){seen.add(k);dedup.push(v);}});
  return new A.SolutionSet(variable,dedup.length?"finite":"empty",dedup,{});
}
function exactLinearInner(ast,variable){
  try{
    var p=A.Polynomial.fromAst(ast,variable);
    if(p.degree===1&&!p.get(1).isZero())return {a:p.get(1),b:p.get(0)};
  }catch(e){}
  return null;
}
function constantRational(ast){
  ast=A.simplifyAst(ast);return ast.type==="literal"&&ast.value instanceof M.Rational?ast.value:null;
}
function solveSimpleTranscendental(source,variable){
  var rel=splitRelation(source,["="]);if(!rel)return null;
  var left=M.parseExpression(rel.left),right=M.parseExpression(rel.right);
  function trySide(fnNode,rhs){
    if(!fnNode||fnNode.type!=="call"||fnNode.args.length!==1||hasVar(rhs,variable))return null;
    var lin=exactLinearInner(fnNode.args[0],variable);if(!lin)return null;
    var a=lit(lin.a),b=lit(lin.b),target=constantRational(rhs),expr;
    if(fnNode.name==="exp"){
      if(target&&target.n<=0n)return new A.SolutionSet(variable,"empty",[],{});
      expr=A.simplifyAst(bin("/",bin("-",call("ln",[cloneAst(rhs)]),b),a));
      var cond=target?null:astText(rhs)+" > 0";
      return cond?new ConditionalSolution(variable,[{condition:cond,result:variable+" = "+new A.SymbolicExpression(expr).toString()}],{}):
        new A.SolutionSet(variable,"finite",[new A.SolutionValue(new A.SymbolicExpression(expr),null,true)],{});
    }
    if(fnNode.name==="ln"){
      expr=A.simplifyAst(bin("/",bin("-",call("exp",[cloneAst(rhs)]),b),a));
      return new A.SolutionSet(variable,"finite",[new A.SolutionValue(new A.SymbolicExpression(expr),null,true)],{});
    }
    var k=id("k"),pi=id("pi"),phase=null,twoPiK=bin("*",lit(rat(2)),bin("*",k,pi));
    if(fnNode.name==="sin"&&target){
      if(target.equals(rat(0)))phase=bin("*",k,pi);
      else if(target.equals(rat(1)))phase=bin("+",bin("/",pi,lit(rat(2))),twoPiK);
      else if(target.equals(rat(-1)))phase=bin("+",unary("-",bin("/",pi,lit(rat(2)))),twoPiK);
    }else if(fnNode.name==="cos"&&target){
      if(target.equals(rat(0)))phase=bin("+",bin("/",pi,lit(rat(2))),bin("*",k,pi));
      else if(target.equals(rat(1)))phase=twoPiK;
      else if(target.equals(rat(-1)))phase=bin("+",pi,twoPiK);
    }else if(fnNode.name==="tan"&&target&&target.equals(rat(0)))phase=bin("*",k,pi);
    if(phase){
      expr=A.simplifyAst(bin("/",bin("-",phase,b),a));
      return new ParametricFamily(variable,new A.SymbolicExpression(expr),"k","ℤ");
    }
    return null;
  }
  return trySide(left,right)||trySide(right,left);
}
function solveAdvancedEquation(source,variable,domain){
  var eq=equationDifference(source),all=varsOf(eq.ast);
  variable=variable||((all.length===1)?all[0]:null);
  if(!variable)throw new CASError("VARIABLE_REQUIRED","Solve variable is ambiguous; pass it explicitly",{variables:all});
  var parameterized=parameterizedEquation(source,variable,domain);if(parameterized)return parameterized;
  var even=solveEvenPolynomial(source,variable,domain);if(even)return even;
  var trans=solveSimpleTranscendental(source,variable);if(trans)return trans;
  throw new UnsupportedCASError("No certified U1 exact solver matches this equation",{equation:source,variable:variable});
}

/* Advanced systems ------------------------------------------------------- */
function symbolicLinearForm(ast,unknowns){
  var set=new Set(unknowns);
  function empty(){return {constant:lit(rat(0)),coeff:new Map()};}
  function dependsUnknown(n){
    var vs=A.collectVariables(n);for(const v of vs)if(set.has(v))return true;return false;
  }
  function addForms(a,b,sign){
    var out={constant:A.simplifyAst(bin(sign<0?"-":"+",a.constant,b.constant)),coeff:new Map()};
    unknowns.forEach(function(v){
      var av=a.coeff.get(v)||lit(rat(0)),bv=b.coeff.get(v)||lit(rat(0));
      out.coeff.set(v,A.simplifyAst(bin(sign<0?"-":"+",av,bv)));
    });
    return out;
  }
  function scaleForm(f,s,divide){
    var out={constant:A.simplifyAst(bin(divide?"/":"*",f.constant,cloneAst(s))),coeff:new Map()};
    unknowns.forEach(function(v){
      out.coeff.set(v,A.simplifyAst(bin(divide?"/":"*",f.coeff.get(v)||lit(rat(0)),cloneAst(s))));
    });
    return out;
  }
  function walk(n){
    n=A.simplifyAst(n);
    if(!dependsUnknown(n))return {constant:cloneAst(n),coeff:new Map()};
    if(n.type==="identifier"&&set.has(n.name)){var f=empty();f.coeff.set(n.name,lit(rat(1)));return f;}
    if(n.type==="unary"){var uf=walk(n.arg);return n.op==="-"?scaleForm(uf,lit(rat(-1)),false):uf;}
    if(n.type==="binary"){
      if(n.op==="+")return addForms(walk(n.left),walk(n.right),1);
      if(n.op==="-")return addForms(walk(n.left),walk(n.right),-1);
      if(n.op==="*"){
        var ld=dependsUnknown(n.left),rd=dependsUnknown(n.right);
        if(ld&&rd)throw new UnsupportedCASError("Parameterized system is nonlinear in the requested unknowns");
        return ld?scaleForm(walk(n.left),n.right,false):scaleForm(walk(n.right),n.left,false);
      }
      if(n.op==="/"){
        if(dependsUnknown(n.right))throw new UnsupportedCASError("System denominator depends on an unknown");
        return scaleForm(walk(n.left),n.right,true);
      }
      if(n.op==="^"&&exactInt(n.right)===1)return walk(n.left);
    }
    throw new UnsupportedCASError("System contains a nonlinear or unsupported term in the requested unknowns",{expression:A.printAst(n)});
  }
  return walk(ast);
}
function detAst(matrix){
  var n=matrix.length;
  if(n===1)return cloneAst(matrix[0][0]);
  if(n===2)return A.simplifyAst(bin("-",bin("*",cloneAst(matrix[0][0]),cloneAst(matrix[1][1])),bin("*",cloneAst(matrix[0][1]),cloneAst(matrix[1][0]))));
  var sum=lit(rat(0));
  for(var c=0;c<n;c++){
    var minor=[];
    for(var r=1;r<n;r++)minor.push(matrix[r].filter(function(_,j){return j!==c;}));
    var term=bin("*",cloneAst(matrix[0][c]),detAst(minor));
    sum=A.simplifyAst(bin(c%2===0?"+":"-",sum,term));
  }
  return A.simplifyAst(sum);
}
function replaceColumn(matrix,column,vector){
  return matrix.map(function(row,r){return row.map(function(v,c){return c===column?cloneAst(vector[r]):cloneAst(v);});});
}
function parameterSystem(variableText,equationTexts){
  var unknowns=variableText.split(",").map(function(x){return x.trim();}).filter(Boolean);
  if(!unknowns.length||unknowns.length>3||equationTexts.length!==unknowns.length)throw new CASError("SYSTEM_SHAPE","psystem supports square systems of 1–3 explicitly named unknowns");
  unknowns.forEach(function(v){if(!/^[A-Za-z_]\w*$/.test(v))throw new CASError("INVALID_IDENTIFIER","Invalid system variable '"+v+"'");});
  var diffs=[],allVars=new Set(),restrictions=[];
  equationTexts.forEach(function(source){
    var eq=equationDifference(source),se=new A.SymbolicExpression(eq.ast);
    diffs.push(eq.ast);se.variables().forEach(function(v){allVars.add(v);});se.restrictions.forEach(function(r){restrictions.push(r.toString());});
  });
  var params=Array.from(allVars).filter(function(v){return unknowns.indexOf(v)<0;}).sort();
  var matrix=[],rhs=[];
  diffs.forEach(function(diff){
    var form=symbolicLinearForm(diff,unknowns);
    matrix.push(unknowns.map(function(v){return form.coeff.get(v)||lit(rat(0));}));
    rhs.push(A.simplifyAst(unary("-",form.constant)));
  });
  var determinant=new A.SymbolicExpression(detAst(matrix)),generic={};
  if(!isZeroAst(determinant.ast)){
    unknowns.forEach(function(v,i){
      var num=detAst(replaceColumn(matrix,i,rhs)),expr=A.simplifyAst(bin("/",num,cloneAst(determinant.ast))),se=new A.SymbolicExpression(expr);
      if(params.length===1){try{se=se.simplify(params[0]);}catch(e){}}
      generic[v]=se;
    });
  }
  var branches=[];
  if(params.length===1&&!isZeroAst(determinant.ast)){
    try{
      var roots=A.solveEquation(determinant.toString()+" = 0",params[0]);
      if(roots.type==="finite"){
        roots.values.forEach(function(root){
          var label=params[0]+" = "+root.toString(),rv=root.expression.ast;
          if(rv.type==="literal"&&rv.value instanceof M.Rational){
            try{
              var equations=diffs.map(function(diff){return A.printAst(A.simplifyAst(A.substituteAst(diff,{[params[0]]:rv})))+" = 0";});
              var solved=A.solveLinearSystem(equations,unknowns);
              branches.push({condition:label,result:solved.toString()});
            }catch(e){branches.push({condition:label,result:"singular branch requires separate analysis"});}
          }else branches.push({condition:label,result:"singular branch requires separate analysis"});
        });
      }
    }catch(e){}
  }
  return new ParameterSystemSolution(unknowns,generic,determinant,params,branches,uniqueStrings(restrictions));
}
function nonlinearTwoSystem(equationTexts){
  if(equationTexts.length!==2)return null;
  var diffs=equationTexts.map(function(s){return equationDifference(s).ast;}),set=new Set();
  diffs.forEach(function(d){A.collectVariables(d).forEach(function(v){set.add(v);});});
  var variables=Array.from(set).sort();if(variables.length!==2)return null;
  for(var ei=0;ei<2;ei++)for(var vi=0;vi<2;vi++){
    var pivot=variables[vi],other=variables[1-vi],poly;
    try{poly=symbolicPolynomial(diffs[ei],pivot,2);}catch(e){continue;}
    if(poly.length!==2)continue;
    var coeff=A.simplifyAst(poly[1]),coeffVars=A.collectVariables(coeff);
    if(coeffVars.has(other)||coeffVars.has(pivot))continue;
    var cv=constantValue(coeff);if(cv===null||compareZero(cv)===0)continue;
    var pivotExpr=A.simplifyAst(bin("/",unary("-",poly[0]),coeff));
    var residual=A.simplifyAst(A.substituteAst(diffs[1-ei],{[pivot]:pivotExpr})),otherSolutions;
    try{otherSolutions=A.solveEquation(A.printAst(residual)+" = 0",other);}catch(e){continue;}
    if(otherSolutions.type==="empty")return new NonlinearSystemSolution(variables,[]);
    if(otherSolutions.type!=="finite")continue;
    var solutions=[];
    otherSolutions.values.forEach(function(sol){
      var pExpr=new A.SymbolicExpression(A.simplifyAst(A.substituteAst(pivotExpr,{[other]:sol.expression.ast})));
      var row={};row[pivot]=pExpr;row[other]=sol.expression;solutions.push(row);
    });
    return new NonlinearSystemSolution(variables,solutions);
  }
  return null;
}

/* Polynomial/rational inequalities -------------------------------------- */
function relationHolds(value,op){
  if(!Number.isFinite(value))return false;
  if(op===">")return value>0;if(op===">=")return value>=0;if(op==="<")return value<0;if(op==="<=")return value<=0;return false;
}
function rootEntries(poly,variable,kind){
  if(poly.degree===-Infinity)return [];
  var solved=A.solveEquation(poly.toString()+" = 0",variable),out=[];
  if(solved.type!=="finite")return out;
  solved.values.forEach(function(v){
    var n=approximateSolutionValue(v);if(Number.isFinite(n)&&Math.abs((n===0?0:n)-n)<1e-8)out.push({expr:v.expression,approx:n,kinds:new Set([kind])});
  });
  return out;
}
function mergeCritical(entries){
  entries.sort(function(a,b){return a.approx-b.approx;});var out=[];
  entries.forEach(function(e){
    var last=out[out.length-1];
    if(last&&Math.abs(last.approx-e.approx)<1e-9){e.kinds.forEach(function(k){last.kinds.add(k);});}
    else out.push(e);
  });
  return out;
}
function advancedInequality(source,variable){
  var rel=splitRelation(source,["<=",">=","<",">"]);if(!rel)throw new CASError("INEQUALITY_ERROR","Expected <, <=, >, or >=");
  var left=M.parseExpression(rel.left),right=M.parseExpression(rel.right),diff=A.simplifyAst(bin("-",left,right)),all=varsOf(diff);
  variable=variable||((all.length===1)?all[0]:null);if(!variable)throw new CASError("VARIABLE_REQUIRED","Inequality variable is ambiguous");
  if(all.some(function(v){return v!==variable;}))throw new UnsupportedCASError("U1 inequality solving does not branch on symbolic parameters",{variables:all});
  var rf=A.RationalFunction.fromAst(diff,variable),entries=[];
  entries=entries.concat(rootEntries(rf.numerator,variable,"zero"),rootEntries(rf.denominator,variable,"pole"));
  var original=new A.SymbolicExpression(diff);
  original.restrictions.forEach(function(r){
    if(r.relation!=="!="||r.expression.variables().some(function(v){return v!==variable;}))return;
    try{
      var hole=A.solveEquation(r.expression.toString()+" = "+M.formatValue(r.value),variable);
      if(hole.type==="finite")hole.values.forEach(function(v){
        var n=approximateSolutionValue(v);if(Number.isFinite(n))entries.push({expr:v.expression,approx:n,kinds:new Set(["hole"])});
      });
    }catch(e){}
  });
  var crit=mergeCritical(entries),bounds=[null].concat(crit).concat([null]),intervals=[];
  for(var i=0;i<bounds.length-1;i++){
    var l=bounds[i],r=bounds[i+1],x;
    if(l===null)x=r.approx-1-Math.abs(r.approx);
    else if(r===null)x=l.approx+1+Math.abs(l.approx);
    else x=(l.approx+r.approx)/2;
    var val;
    try{val=M.toNumber(M.evaluateAst(diff,{[variable]:x},{complex:false,angle:"RAD"},0));}catch(e){continue;}
    if(relationHolds(val,rel.op))intervals.push({lo:l?l.expr:null,hi:r?r.expr:null,loClosed:false,hiClosed:false});
  }
  var includeZero=rel.op===">="||rel.op==="<=";
  if(includeZero)crit.forEach(function(c){
    if(!c.kinds.has("zero")||c.kinds.has("pole")||c.kinds.has("hole"))return;
    var attached=false,key=c.expr.toString();
    intervals.forEach(function(iv){
      if(iv.hi&&iv.hi.toString()===key){iv.hiClosed=true;attached=true;}
      if(iv.lo&&iv.lo.toString()===key){iv.loClosed=true;attached=true;}
    });
    if(!attached)intervals.push({lo:c.expr,hi:c.expr,loClosed:true,hiClosed:true});
  });
  intervals.sort(function(a,b){
    var av=a.lo===null?-Infinity:crit.find(function(c){return c.expr.toString()===a.lo.toString();})?.approx||0;
    var bv=b.lo===null?-Infinity:crit.find(function(c){return c.expr.toString()===b.lo.toString();})?.approx||0;
    return av-bv;
  });
  return new A.IntervalUnion(variable,intervals);
}

/* Integration ------------------------------------------------------------ */
function polynomialIntegralAst(poly){
  var out=lit(rat(0));
  if(poly.degree===-Infinity)return out;
  for(var d=0;d<=poly.degree;d++){
    var c=poly.get(d);if(c.isZero())continue;
    var next=d+1,coef=c.div(rat(next)),term=next===1?id(poly.variable):bin("^",id(poly.variable),lit(rat(next)));
    if(!coef.equals(rat(1)))term=bin("*",lit(coef),term);
    out=A.simplifyAst(bin("+",out,term));
  }
  return out;
}
function linearCallInfo(node,variable){
  if(!node||node.type!=="call"||node.args.length!==1||["exp","sin","cos"].indexOf(node.name)<0)return null;
  var lin=exactLinearInner(node.args[0],variable);return lin?{kind:node.name,inner:node.args[0],a:lin.a}:null;
}
function splitFunctionProduct(ast,variable){
  if(ast.type!=="binary"||ast.op!=="*")return null;
  var li=linearCallInfo(ast.left,variable),ri=linearCallInfo(ast.right,variable);
  if(li){try{return {fn:ast.left,info:li,poly:A.Polynomial.fromAst(ast.right,variable)};}catch(e){}}
  if(ri){try{return {fn:ast.right,info:ri,poly:A.Polynomial.fromAst(ast.left,variable)};}catch(e){}}
  return null;
}
function integratePolyFunction(poly,info){
  var a=lit(info.a),inner=cloneAst(info.inner);
  function rec(p,kind){
    if(p.degree===-Infinity)return lit(rat(0));
    var P=p.toAst(),pd=p.derivative(),head,tail;
    if(kind==="exp"){
      head=bin("/",bin("*",P,call("exp",[cloneAst(inner)])),cloneAst(a));
      tail=rec(pd,"exp");
      return A.simplifyAst(bin("-",head,bin("/",tail,cloneAst(a))));
    }
    if(kind==="sin"){
      head=unary("-",bin("/",bin("*",P,call("cos",[cloneAst(inner)])),cloneAst(a)));
      tail=rec(pd,"cos");
      return A.simplifyAst(bin("+",head,bin("/",tail,cloneAst(a))));
    }
    head=bin("/",bin("*",P,call("sin",[cloneAst(inner)])),cloneAst(a));
    tail=rec(pd,"sin");
    return A.simplifyAst(bin("-",head,bin("/",tail,cloneAst(a))));
  }
  return rec(poly,info.kind);
}
function reciprocalQuadraticIntegral(den,variable){
  var a=den.get(2),b=den.get(1),c=den.get(0),u=A.simplifyAst(bin("+",bin("*",lit(a.mul(rat(2))),id(variable)),lit(b))),
    delta=a.mul(c).mul(rat(4)).sub(b.mul(b));
  if(delta.n>0n){
    var sd=call("sqrt",[lit(delta)]);
    return A.simplifyAst(bin("*",bin("/",lit(rat(2)),cloneAst(sd)),call("atan",[bin("/",u,cloneAst(sd))])));
  }
  if(delta.n===0n)return A.simplifyAst(bin("/",lit(rat(-2)),u));
  var D=delta.neg(),sD=call("sqrt",[lit(D)]),ratio=bin("/",bin("-",cloneAst(u),cloneAst(sD)),bin("+",cloneAst(u),cloneAst(sD)));
  return A.simplifyAst(bin("*",bin("/",lit(rat(1)),cloneAst(sD)),call("ln",[call("abs",[ratio])])));
}
function integrateRationalLowDegree(ast,variable){
  var rf;
  try{rf=A.RationalFunction.fromAst(ast,variable);}catch(e){return null;}
  var den=rf.denominator,num=rf.numerator;
  if(den.degree<=0||den.degree>2)return null;
  var dm=num.divmod(den),out=polynomialIntegralAst(dm.quotient),rem=dm.remainder;
  if(rem.degree===-Infinity)return out;
  if(den.degree===1){
    if(rem.degree>0)return null;
    var term=A.simplifyAst(bin("*",lit(rem.get(0).div(den.get(1))),call("ln",[call("abs",[den.toAst()])])));
    return A.simplifyAst(bin("+",out,term));
  }
  if(rem.degree>1)return null;
  var a=den.get(2),b=den.get(1),m=rem.get(1),n=rem.get(0),alpha=m.div(a.mul(rat(2))),beta=n.sub(alpha.mul(b)),
    proper=lit(rat(0));
  if(!alpha.isZero())proper=A.simplifyAst(bin("+",proper,bin("*",lit(alpha),call("ln",[call("abs",[den.toAst()])]))));
  if(!beta.isZero())proper=A.simplifyAst(bin("+",proper,bin("*",lit(beta),reciprocalQuadraticIntegral(den,variable))));
  return A.simplifyAst(bin("+",out,proper));
}
function integrateAdvanced(source,variable){
  var expr=source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source),vars=expr.variables();
  variable=variable||((vars.length===1)?vars[0]:null);
  if(!variable)throw new CASError("VARIABLE_REQUIRED","Advanced integration requires an explicit variable");
  if(vars.some(function(v){return v!==variable;}))throw new UnsupportedCASError("U1 advanced integration is univariate");
  var ast=expr.ast,candidate=null,product=splitFunctionProduct(ast,variable);
  if(product&&product.poly.degree<=12)candidate=integratePolyFunction(product.poly,product.info);
  if(!candidate)candidate=integrateRationalLowDegree(ast,variable);
  if(!candidate)throw new UnsupportedCASError("No certified U1 advanced antiderivative rule matches this expression",{expression:expr.toString(),variable:variable});
  var anti=new A.SymbolicExpression(candidate),verification=C.verifyAntiderivative(expr,anti,variable);
  if(!verification.verified)throw new UnsupportedCASError("Advanced antiderivative candidate failed verification",{candidate:anti.toString(),verification:verification});
  return new C.AntiderivativeResult(anti,variable,verification,"u1-cas");
}

/* Router ---------------------------------------------------------------- */
function parseCall(raw,name){
  var re=new RegExp("^"+name+"\\s*\\((.*)\\)$","s"),m=String(raw).trim().match(re);return m?m[1]:null;
}
function solveCommand(raw,options){
  var body=parseCall(raw,"solve");if(body===null)return null;
  var args=splitArgs(body);if(args.length<1||args.length>3)throw new CASError("ARITY_ERROR","solve expects equation, optional variable, optional domain");
  try{
    var basic=A.runCommand(raw,options);if(basic)return basic;
  }catch(e){
    if(!(e instanceof A.UnsupportedSymbolicError))throw e;
  }
  var solved=solveAdvancedEquation(args[0],args[1]||undefined,args[2]||"real"),display=solved.toString();
  if(solved instanceof ConditionalSolution&&solved.metadata&&solved.metadata.restrictions&&solved.metadata.restrictions.length)display+="; domain: "+solved.metadata.restrictions.join(", ");
  return commandResult(display,solved instanceof ParametricFamily?"parametric-family":solved instanceof ConditionalSolution?"conditional-solution":"solution-set",{value:solved,metadata:{operation:"solve",advanced:true}});
}
function systemCommand(raw,options){
  var body=parseCall(raw,"system");if(body===null)return null;
  try{
    var basic=A.runCommand(raw,options);if(basic)return basic;
  }catch(e){
    if(!(e instanceof A.UnsupportedSymbolicError))throw e;
  }
  var parts=splitTopLevel(body,";"),solved=nonlinearTwoSystem(parts);
  if(!solved)throw new UnsupportedCASError("Advanced nonlinear system solving currently requires two equations where one can be solved linearly for one unknown");
  return commandResult(solved.toString(),"nonlinear-system",{value:solved,metadata:{operation:"system",advanced:true,variables:solved.variables}});
}
function pSystemCommand(raw){
  var body=parseCall(raw,"psystem");if(body===null)return null;
  var parts=splitTopLevel(body,";");if(parts.length<2)throw new CASError("ARITY_ERROR","psystem expects psystem(x,y; equation; equation)");
  var solved=parameterSystem(parts[0],parts.slice(1));
  return commandResult(solved.toString(),"parameter-system",{value:solved,metadata:{operation:"psystem",variables:solved.variables,parameters:solved.parameters,determinant:solved.determinant.toString()}});
}
function inequalityCommand(raw,options){
  var body=parseCall(raw,"inequality");if(body===null)return null;
  try{
    var basic=A.runCommand(raw,options);if(basic)return basic;
  }catch(e){
    if(!(e instanceof A.UnsupportedSymbolicError))throw e;
  }
  var args=splitArgs(body);if(args.length<1||args.length>2)throw new CASError("ARITY_ERROR","inequality expects expression and optional variable");
  var solved=advancedInequality(args[0],args[1]||undefined);
  return commandResult(solved.variable+" ∈ "+solved.toString(),"interval-union",{value:solved,metadata:{operation:"inequality",advanced:true}});
}
function integrateCommand(raw,options){
  var body=parseCall(raw,"integrate");if(body===null)return null;
  try{
    var basic=C.runCommand(raw,options);if(basic)return basic;
  }catch(e){
    if(!(e instanceof C.UnsupportedIntegralError))throw e;
  }
  var args=splitArgs(body);if(args.length<1||args.length>2)throw new CASError("ARITY_ERROR","integrate expects expression and optional variable");
  var anti=integrateAdvanced(args[0],args[1]||undefined);
  return commandResult(anti.toString(),"antiderivative",{value:anti.expression,exact:true,symbolic:true,metadata:{operation:"integrate",advanced:true,variable:anti.variable,verified:anti.verification.verified,method:anti.method}});
}
function simplifyAssumptionCommand(inner,assumptions){
  var body=parseCall(inner,"simplify"),source,variable;
  if(body!==null){
    var args=splitArgs(body);if(args.length<1||args.length>2)throw new CASError("ARITY_ERROR","simplify under assumptions expects expression and optional variable");
    source=args[0];variable=args[1]||undefined;
  }else source=inner;
  var expr=simplifyWithAssumptions(source,variable,assumptions),display=expr.toString();
  if(expr.restrictions.length)display+="   where "+joinRestrictions(expr.restrictions).join(", ");
  return commandResult(display,"assumption-simplify",{value:expr,approx:"assuming "+assumptionText(assumptions),metadata:{operation:"assume",assumptions:assumptions.map(function(a){return a.source;})}});
}
function assumeCommand(raw,options){
  var body=parseCall(raw,"assume");if(body===null)body=parseCall(raw,"assuming");if(body===null)return null;
  var parts=splitTopLevel(body,";");if(parts.length<2)throw new CASError("ARITY_ERROR","assume expects one or more assumptions followed by an expression or solve/simplify command");
  var inner=parts.pop(),assumptions=parseAssumptions(parts);
  if(parseCall(inner,"solve")!==null){
    var res=solveCommand(inner,options),value=res.value;
    if(value instanceof A.SolutionSet&&value.type==="finite"){
      var kept=value.values.filter(function(v){
        var n=approximateSolutionValue(v);return assumptions.every(function(a){return assumptionAcceptsNumber(a,value.variable,n);});
      });
      value=new A.SolutionSet(value.variable,kept.length?"finite":"empty",kept,{restrictions:value.restrictions});
      res=commandResult(value.toString(),"solution-set",{value:value,approx:"assuming "+assumptionText(assumptions),metadata:{operation:"solve",advanced:true,assumptions:assumptions.map(function(a){return a.source;})}});
    }else res.approx=(res.approx?res.approx+" · ":"")+"assuming "+assumptionText(assumptions);
    return res;
  }
  if(parseCall(inner,"simplify")!==null||!/^([A-Za-z_]\w*)\s*\(/.test(inner))return simplifyAssumptionCommand(inner,assumptions);
  throw new UnsupportedCASError("Assumption contexts currently apply to simplification, bare expressions, and root filtering");
}
function helpCommand(raw){
  if(!/^cashelp\s*\(\s*\)\s*$/i.test(String(raw).trim()))return null;
  return commandResult("U1 CAS: assume(x>0; simplify(sqrt(x^2))) · solve(a*x+b=0, x) · psystem(x,y; a*x+y=1; x+a*y=2) · inequality((x+1)/(x-2)>=0, x) · integrate(x*exp(x), x)","cas-help",{value:null,exact:true,symbolic:true,metadata:{operation:"cashelp"}});
}
function runCommand(raw,options){
  raw=String(raw).trim();options=options||{};
  return helpCommand(raw)||
    assumeCommand(raw,options)||
    pSystemCommand(raw)||
    solveCommand(raw,options)||
    systemCommand(raw,options)||
    inequalityCommand(raw,options)||
    integrateCommand(raw,options)||
    null;
}

global.CalcCAS={
  VERSION:"2.0.0-u1",
  CASError:CASError,UnsupportedCASError:UnsupportedCASError,
  ConditionalSolution:ConditionalSolution,ParametricFamily:ParametricFamily,NonlinearSystemSolution:NonlinearSystemSolution,ParameterSystemSolution:ParameterSystemSolution,
  parseAssumption:parseAssumption,parseAssumptions:parseAssumptions,signMask:signMask,simplifyWithAssumptions:simplifyWithAssumptions,
  symbolicPolynomial:symbolicPolynomial,solveAdvancedEquation:solveAdvancedEquation,parameterSystem:parameterSystem,advancedInequality:advancedInequality,integrateAdvanced:integrateAdvanced,
  runCommand:runCommand
};
})(window);
