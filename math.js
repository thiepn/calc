(function(global){
"use strict";

function absBig(n){return n<0n?-n:n;}
function gcdBig(a,b){a=absBig(a);b=absBig(b);while(b){var t=a%b;a=b;b=t;}return a;}
function lcmBig(a,b){if(a===0n||b===0n)return 0n;return absBig((a/gcdBig(a,b))*b);}
function pow10Big(n){var r=1n;for(var i=0;i<n;i++)r*=10n;return r;}

class Rational{
  constructor(n,d){
    if(d===undefined)d=1n;
    n=BigInt(n);d=BigInt(d);
    if(d===0n)throw new Error("Division by zero");
    if(d<0n){n=-n;d=-d;}
    var g=gcdBig(n,d);
    this.n=n/g;this.d=d/g;
    Object.freeze(this);
  }
  static fromDecimal(s){
    s=String(s).trim().toLowerCase();
    var sign=1n;
    if(s[0]==="-"){sign=-1n;s=s.slice(1);}
    else if(s[0]==="+")s=s.slice(1);
    var parts=s.split("e"), base=parts[0], exp=parts[1]?parseInt(parts[1],10):0;
    var dot=base.indexOf("."), digits, frac=0;
    if(dot>=0){frac=base.length-dot-1;digits=base.slice(0,dot)+base.slice(dot+1);}
    else digits=base;
    digits=digits||"0";
    var n=BigInt(digits)*sign;
    var scale=frac-exp;
    if(scale>=0)return new Rational(n,pow10Big(scale));
    return new Rational(n*pow10Big(-scale),1n);
  }
  add(o){o=asRational(o);return new Rational(this.n*o.d+o.n*this.d,this.d*o.d);}
  sub(o){o=asRational(o);return new Rational(this.n*o.d-o.n*this.d,this.d*o.d);}
  mul(o){o=asRational(o);return new Rational(this.n*o.n,this.d*o.d);}
  div(o){o=asRational(o);if(o.n===0n)throw new Error("Division by zero");return new Rational(this.n*o.d,this.d*o.n);}
  neg(){return new Rational(-this.n,this.d);}
  abs(){return new Rational(absBig(this.n),this.d);}
  inv(){if(this.n===0n)throw new Error("Division by zero");return new Rational(this.d,this.n);}
  powInt(k){
    k=Number(k);
    if(!Number.isSafeInteger(k))throw new Error("Exponent is too large");
    if(k===0)return new Rational(1n);
    if(k<0)return this.inv().powInt(-k);
    var bn=this.n,bd=this.d,rn=1n,rd=1n,e=k;
    while(e>0){if(e&1){rn*=bn;rd*=bd;}e=Math.floor(e/2);if(e){bn*=bn;bd*=bd;}}
    return new Rational(rn,rd);
  }
  isInteger(){return this.d===1n;}
  isZero(){return this.n===0n;}
  toNumber(){return Number(this.n)/Number(this.d);}
  toString(){return this.d===1n?String(this.n):String(this.n)+"/"+String(this.d);}
}
function asRational(v){if(v instanceof Rational)return v;if(typeof v==="bigint")return new Rational(v);if(Number.isInteger(v)&&Number.isSafeInteger(v))return new Rational(BigInt(v));throw new Error("Expected exact rational");}

class Complex{
  constructor(re,im){this.re=Number(re);this.im=Number(im);}
  add(o){o=toComplex(o);return new Complex(this.re+o.re,this.im+o.im);}
  sub(o){o=toComplex(o);return new Complex(this.re-o.re,this.im-o.im);}
  mul(o){o=toComplex(o);return new Complex(this.re*o.re-this.im*o.im,this.re*o.im+this.im*o.re);}
  div(o){o=toComplex(o);var q=o.re*o.re+o.im*o.im;if(q===0)throw new Error("Division by zero");return new Complex((this.re*o.re+this.im*o.im)/q,(this.im*o.re-this.re*o.im)/q);}
  abs(){return Math.hypot(this.re,this.im);}
  neg(){return new Complex(-this.re,-this.im);}
}
function toComplex(v){if(v instanceof Complex)return v;return new Complex(toNumber(v),0);}
function isComplex(v){return v instanceof Complex;}
function isRational(v){return v instanceof Rational;}
function toNumber(v){if(v instanceof Rational)return v.toNumber();if(v instanceof Complex){if(Math.abs(v.im)<1e-14)return v.re;return NaN;}return Number(v);}
function isZero(v){if(v instanceof Rational)return v.isZero();if(v instanceof Complex)return Math.abs(v.re)<1e-14&&Math.abs(v.im)<1e-14;return Math.abs(Number(v))<1e-14;}

function add(a,b){if(isComplex(a)||isComplex(b))return toComplex(a).add(b);if(isRational(a)&&isRational(b))return a.add(b);return toNumber(a)+toNumber(b);}
function sub(a,b){if(isComplex(a)||isComplex(b))return toComplex(a).sub(b);if(isRational(a)&&isRational(b))return a.sub(b);return toNumber(a)-toNumber(b);}
function mul(a,b){if(isComplex(a)||isComplex(b))return toComplex(a).mul(b);if(isRational(a)&&isRational(b))return a.mul(b);return toNumber(a)*toNumber(b);}
function div(a,b){if(isComplex(a)||isComplex(b))return toComplex(a).div(b);if(isRational(a)&&isRational(b))return a.div(b);var n=toNumber(b);if(n===0)throw new Error("Division by zero");return toNumber(a)/n;}
function neg(a){if(isComplex(a))return a.neg();if(isRational(a))return a.neg();return -a;}
function power(a,b){
  if(isRational(b)&&b.isInteger()&&isRational(a))return a.powInt(Number(b.n));
  var av=toNumber(a),bv=toNumber(b);
  if(av<0&&!Number.isInteger(bv)){
    var r=Math.pow(-av,bv),ang=Math.PI*bv;
    return new Complex(r*Math.cos(ang),r*Math.sin(ang));
  }
  return Math.pow(av,bv);
}
function factorialBig(n){
  n=BigInt(n);if(n<0n)throw new Error("Factorial requires a non-negative integer");
  if(n>10000n)throw new Error("Factorial exceeds safety limit");
  var r=1n;for(var i=2n;i<=n;i++)r*=i;return r;
}
function exactInteger(v,name){
  if(v instanceof Rational&&v.isInteger())return v.n;
  if(typeof v==="number"&&Number.isSafeInteger(v))return BigInt(v);
  throw new Error((name||"Value")+" must be an integer");
}
function bigIntSqrt(n){
  if(n<0n)return null;if(n<2n)return n;
  var x0=1n<<(BigInt(n.toString(2).length)>>1n),x1=(x0+n/x0)>>1n;
  while(x1<x0){x0=x1;x1=(x0+n/x0)>>1n;}return x0;
}
function sqrtValue(v,complexAllowed){
  if(v instanceof Rational){
    if(v.n<0n){
      if(!complexAllowed)throw new Error("Square root is not real for a negative value");
      return new Complex(0,Math.sqrt(-v.toNumber()));
    }
    var sn=bigIntSqrt(v.n),sd=bigIntSqrt(v.d);
    if(sn*sn===v.n&&sd*sd===v.d)return new Rational(sn,sd);
    return Math.sqrt(v.toNumber());
  }
  var n=toNumber(v);
  if(n<0){if(complexAllowed)return new Complex(0,Math.sqrt(-n));throw new Error("Square root is not real for a negative value");}
  return Math.sqrt(n);
}

function cleanNumber(n){
  if(!Number.isFinite(n))return n;
  if(Math.abs(n)<1e-14)return 0;
  var rounded=Math.round(n);
  if(Math.abs(n-rounded)<=1e-13*Math.max(1,Math.abs(n)))return rounded;
  return n;
}
function formatNumber(n,precision){
  n=cleanNumber(n);precision=precision||12;
  if(Number.isNaN(n))return "Undefined";
  if(n===Infinity)return "∞";if(n===-Infinity)return "−∞";
  var a=Math.abs(n);
  if(a!==0&&(a>=1e12||a<1e-8))return n.toExponential(Math.min(precision-1,10)).replace(/\.0+e/,"e").replace(/(\.\d*?)0+e/,"$1e");
  return Number(n.toPrecision(precision)).toString();
}
function formatValue(v,precision){
  if(v instanceof Rational)return v.toString();
  if(v instanceof Complex){
    var re=cleanNumber(v.re),im=cleanNumber(v.im);
    if(Math.abs(im)<1e-14)return formatNumber(re,precision);
    if(Math.abs(re)<1e-14)return (im===1?"":im===-1?"−":formatNumber(im,precision))+"i";
    return formatNumber(re,precision)+(im>=0?" + ":" − ")+(Math.abs(im)===1?"":formatNumber(Math.abs(im),precision))+"i";
  }
  return formatNumber(Number(v),precision);
}
function approxString(v,precision){
  if(v instanceof Rational&&v.d!==1n)return "≈ "+formatNumber(v.toNumber(),precision||12);
  return "";
}

function normalizeInput(s){
  return String(s)
    .replace(/[−–—]/g,"-").replace(/[×·]/g,"*").replace(/÷/g,"/")
    .replace(/π/g,"pi").replace(/√/g,"sqrt")
    .replace(/²/g,"^2").replace(/³/g,"^3")
    .replace(/\u00a0/g," ");
}

class Tokenizer{
  constructor(source){this.s=normalizeInput(source);this.i=0;this.current=null;this.next();}
  next(){
    var s=this.s,n=s.length;
    while(this.i<n&&/\s/.test(s[this.i]))this.i++;
    if(this.i>=n){this.current={type:"eof",value:"",pos:this.i};return this.current;}
    var p=this.i,c=s[this.i];
    if(/[0-9.]/.test(c)){
      var m=s.slice(this.i).match(/^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?/i);
      if(!m)throw new Error("Invalid number at position "+p);
      this.i+=m[0].length;this.current={type:"num",value:m[0],pos:p};return this.current;
    }
    if(/[A-Za-z_Α-ω]/u.test(c)){
      var j=this.i+1;while(j<n&&/[A-Za-z0-9_Α-ω]/u.test(s[j]))j++;
      var id=s.slice(this.i,j);this.i=j;this.current={type:"id",value:id,pos:p};return this.current;
    }
    var two=s.slice(this.i,this.i+2);
    if(["<=",">=","!=","=="].indexOf(two)>=0){this.i+=2;this.current={type:"op",value:two,pos:p};return this.current;}
    if("+-*/^!%(),=<>".indexOf(c)>=0){this.i++;this.current={type:"op",value:c,pos:p};return this.current;}
    throw new Error("Unexpected character '"+c+"' at position "+p);
  }
  take(v){if(this.current.value===v){var t=this.current;this.next();return t;}return null;}
  expect(v){if(!this.take(v))throw new Error("Expected '"+v+"' at position "+this.current.pos);}
}

function startsAtom(t){return t.type==="num"||t.type==="id"||t.value==="(";}

class Parser{
  constructor(source){this.t=new Tokenizer(source);this.nodes=0;}
  node(o){this.nodes++;if(this.nodes>5000)throw new Error("Expression is too complex");return o;}
  parse(){
    var n=this.expr(0);
    if(this.t.current.type!=="eof")throw new Error("Unexpected '"+this.t.current.value+"' at position "+this.t.current.pos);
    return n;
  }
  expr(minBp){
    var tok=this.t.current,left;
    if(tok.type==="num"){this.t.next();left=this.node({type:"literal",value:Rational.fromDecimal(tok.value)});}
    else if(tok.type==="id"){
      this.t.next();
      if(this.t.current.value==="("){
        this.t.next();var args=[];
        if(this.t.current.value!==")"){while(true){args.push(this.expr(0));if(this.t.take(","))continue;break;}}
        this.t.expect(")");
        left=this.node({type:"call",name:tok.value,args:args});
      }else left=this.node({type:"identifier",name:tok.value});
    }else if(tok.value==="("){
      this.t.next();left=this.expr(0);this.t.expect(")");
    }else if(tok.value==="+"||tok.value==="-"){
      this.t.next();left=this.node({type:"unary",op:tok.value,arg:this.expr(29)});
    }else throw new Error("Expected a value at position "+tok.pos);

    while(true){
      if(this.t.current.value==="!"){if(40<minBp)break;this.t.next();left=this.node({type:"postfix",op:"!",arg:left});continue;}
      if(this.t.current.value==="%"){if(40<minBp)break;this.t.next();left=this.node({type:"postfix",op:"%",arg:left});continue;}
      var op=this.t.current.value,lbp,rbp,implicit=false;
      if(op==="+"||op==="-"){lbp=10;rbp=11;}
      else if(op==="*"||op==="/"){lbp=20;rbp=21;}
      else if(op==="^"){lbp=30;rbp=30;}
      else if(startsAtom(this.t.current)){op="*";lbp=20;rbp=21;implicit=true;}
      else break;
      if(lbp<minBp)break;
      if(!implicit)this.t.next();
      var right=this.expr(rbp);
      left=this.node({type:"binary",op:op,left:left,right:right,implicit:implicit});
    }
    return left;
  }
}

function evalAst(node,env,options,depth){
  options=options||{};env=env||{};depth=depth||0;
  if(depth>100)throw new Error("Evaluation recursion limit reached");
  switch(node.type){
    case "literal": return node.value;
    case "identifier":
      if(Object.prototype.hasOwnProperty.call(env,node.name)){
        var ev=env[node.name];
        if(ev&&ev.__function)throw new Error(node.name+" is a function");
        return ev;
      }
      if(node.name==="pi")return Math.PI;
      if(node.name==="e")return Math.E;
      if(node.name==="i"){if(options.complex===false)throw new Error("Complex numbers are disabled");return new Complex(0,1);}
      if(node.name==="ans"&&Object.prototype.hasOwnProperty.call(env,"ans"))return env.ans;
      throw new Error("Unknown identifier '"+node.name+"'");
    case "unary":{
      var ua=evalAst(node.arg,env,options,depth+1);
      return node.op==="-"?neg(ua):ua;
    }
    case "postfix":{
      var pv=evalAst(node.arg,env,options,depth+1);
      if(node.op==="%")return div(pv,new Rational(100n));
      var fi=exactInteger(pv,"Factorial input");return new Rational(factorialBig(fi));
    }
    case "binary":{
      var a=evalAst(node.left,env,options,depth+1),b=evalAst(node.right,env,options,depth+1);
      if(node.op==="+")return add(a,b);
      if(node.op==="-")return sub(a,b);
      if(node.op==="*")return mul(a,b);
      if(node.op==="/")return div(a,b);
      if(node.op==="^")return power(a,b);
      throw new Error("Unsupported operator "+node.op);
    }
    case "call":{
      var args=node.args.map(function(x){return evalAst(x,env,options,depth+1);});
      if(Object.prototype.hasOwnProperty.call(env,node.name)&&env[node.name]&&env[node.name].__function){
        var f=env[node.name];
        if(args.length!==1)throw new Error(f.name+" expects 1 argument");
        var local=Object.create(env);local[f.param]=args[0];
        return evalAst(f.ast,local,options,depth+1);
      }
      return callBuiltin(node.name,args,options);
    }
  }
  throw new Error("Unknown AST node");
}

function angleIn(n,options){var mode=(options&&options.angle)||"RAD";if(mode==="DEG")return n*Math.PI/180;if(mode==="GRAD")return n*Math.PI/200;return n;}
function angleOut(n,options){var mode=(options&&options.angle)||"RAD";if(mode==="DEG")return n*180/Math.PI;if(mode==="GRAD")return n*200/Math.PI;return n;}

function callBuiltin(name,args,options){
  name=name.toLowerCase();
  function arity(n){if(args.length!==n)throw new Error(name+" expects "+n+" argument"+(n===1?"":"s"));}
  if(name==="sqrt"){arity(1);return sqrtValue(args[0],options.complex!==false);}
  if(name==="abs"){arity(1);if(isComplex(args[0]))return args[0].abs();return isRational(args[0])?args[0].abs():Math.abs(args[0]);}
  if(name==="sin"){arity(1);return cleanNumber(Math.sin(angleIn(toNumber(args[0]),options)));}
  if(name==="cos"){arity(1);return cleanNumber(Math.cos(angleIn(toNumber(args[0]),options)));}
  if(name==="tan"){arity(1);return cleanNumber(Math.tan(angleIn(toNumber(args[0]),options)));}
  if(name==="asin"){arity(1);return angleOut(Math.asin(toNumber(args[0])),options);}
  if(name==="acos"){arity(1);return angleOut(Math.acos(toNumber(args[0])),options);}
  if(name==="atan"){arity(1);return angleOut(Math.atan(toNumber(args[0])),options);}
  if(name==="sinh"){arity(1);return Math.sinh(toNumber(args[0]));}
  if(name==="cosh"){arity(1);return Math.cosh(toNumber(args[0]));}
  if(name==="tanh"){arity(1);return Math.tanh(toNumber(args[0]));}
  if(name==="ln"){arity(1);var lv=toNumber(args[0]);if(lv<=0)throw new Error("ln requires a positive real value");return Math.log(lv);}
  if(name==="log"||name==="log10"){arity(1);var logv=toNumber(args[0]);if(logv<=0)throw new Error("log requires a positive real value");return Math.log10(logv);}
  if(name==="exp"){arity(1);return Math.exp(toNumber(args[0]));}
  if(name==="floor"){arity(1);return new Rational(BigInt(Math.floor(toNumber(args[0]))));}
  if(name==="ceil"){arity(1);return new Rational(BigInt(Math.ceil(toNumber(args[0]))));}
  if(name==="round"){arity(1);return new Rational(BigInt(Math.round(toNumber(args[0]))));}
  if(name==="gcd"){arity(2);return new Rational(gcdBig(exactInteger(args[0]),exactInteger(args[1])));}
  if(name==="lcm"){arity(2);return new Rational(lcmBig(exactInteger(args[0]),exactInteger(args[1])));}
  if(name==="mod"){arity(2);var aa=exactInteger(args[0]),mm=exactInteger(args[1]);if(mm===0n)throw new Error("Modulus cannot be zero");var rr=aa%mm;if(rr<0n)rr+=absBig(mm);return new Rational(rr);}
  if(name==="ncr"){arity(2);var n=exactInteger(args[0],"n"),r=exactInteger(args[1],"r");if(n<0n||r<0n||r>n)throw new Error("nCr requires 0 ≤ r ≤ n");if(r>n-r)r=n-r;var c=1n;for(var i=1n;i<=r;i++)c=c*(n-r+i)/i;return new Rational(c);}
  if(name==="npr"){arity(2);var np=exactInteger(args[0],"n"),rp=exactInteger(args[1],"r");if(np<0n||rp<0n||rp>np)throw new Error("nPr requires 0 ≤ r ≤ n");var p=1n;for(var j=0n;j<rp;j++)p*=np-j;return new Rational(p);}
  if(name==="min"){if(!args.length)throw new Error("min expects at least one argument");return Math.min.apply(null,args.map(toNumber));}
  if(name==="max"){if(!args.length)throw new Error("max expects at least one argument");return Math.max.apply(null,args.map(toNumber));}
  throw new Error("Unknown function '"+name+"'");
}

function parseExpression(source){if(String(source).length>10000)throw new Error("Expression is too long");return new Parser(source).parse();}

function evaluate(source,env,options){
  env=env||{};options=options||{};
  var raw=String(source).trim();
  if(!raw)throw new Error("Enter an expression");
  var fm=raw.match(/^([A-Za-z_Α-ω][A-Za-z0-9_Α-ω]*)\s*\(\s*([A-Za-z_Α-ω][A-Za-z0-9_Α-ω]*)\s*\)\s*=\s*(.+)$/u);
  if(fm){
    var fast=parseExpression(fm[3]);
    var def={__function:true,name:fm[1],param:fm[2],ast:fast,source:fm[3]};
    if(options.commit!==false)env[fm[1]]=def;
    return {value:def,display:fm[1]+"("+fm[2]+") = "+fm[3],approx:"",exact:true,ast:fast,assignment:fm[1],functionDefinition:true};
  }
  var am=raw.match(/^([A-Za-z_Α-ω][A-Za-z0-9_Α-ω]*)\s*=\s*(?!=)(.+)$/u);
  if(am){
    var aast=parseExpression(am[2]),av=evalAst(aast,env,options,0);
    if(options.commit!==false)env[am[1]]=av;
    return {value:av,display:am[1]+" = "+formatValue(av,options.precision),approx:approxString(av,options.precision),exact:isRational(av),ast:aast,assignment:am[1]};
  }
  var ast=parseExpression(raw),value=evalAst(ast,env,options,0);
  return {value:value,display:formatValue(value,options.precision),approx:approxString(value,options.precision),exact:isRational(value),ast:ast};
}

function evaluateNumber(source,env,options){
  var r=evaluate(source,env,Object.assign({},options,{commit:false}));
  var n=toNumber(r.value);
  if(!Number.isFinite(n))throw new Error("Expression is not a finite real number");
  return n;
}

function parseMatrixString(s){
  var rows=String(s).trim().split(/\n+/).map(function(row){return row.trim();}).filter(Boolean);
  return rows.map(function(row){return row.split(/[\t, ]+/).filter(Boolean);});
}
function matrixFromStrings(rows,env,options){
  if(!rows.length)throw new Error("Matrix is empty");
  var width=rows[0].length;if(!width)throw new Error("Matrix is empty");
  return rows.map(function(row,r){
    if(row.length!==width)throw new Error("Row "+(r+1)+" has "+row.length+" entries; expected "+width);
    return row.map(function(cell){return evaluate(String(cell),env||{},Object.assign({},options,{commit:false})).value;});
  });
}
function cloneMatrix(A){return A.map(function(r){return r.slice();});}
function matrixShape(A){return [A.length,A.length?A[0].length:0];}
function transpose(A){var sh=matrixShape(A),m=sh[0],n=sh[1],R=Array.from({length:n},function(){return Array(m);});for(var i=0;i<m;i++)for(var j=0;j<n;j++)R[j][i]=A[i][j];return R;}
function matMul(A,B){
  var sa=matrixShape(A),sb=matrixShape(B);if(sa[1]!==sb[0])throw new Error("Matrix inner dimensions do not match");
  var R=Array.from({length:sa[0]},function(){return Array(sb[1]);});
  for(var i=0;i<sa[0];i++)for(var j=0;j<sb[1];j++){var s=new Rational(0n);for(var k=0;k<sa[1];k++)s=add(s,mul(A[i][k],B[k][j]));R[i][j]=s;}return R;
}
function rref(A){
  var M=cloneMatrix(A),rows=M.length,cols=rows?M[0].length:0,lead=0,pivots=[];
  for(var r=0;r<rows&&lead<cols;r++){
    var i=r;while(i<rows&&isZero(M[i][lead]))i++;
    if(i===rows){lead++;r--;continue;}
    if(i!==r){var tmp=M[i];M[i]=M[r];M[r]=tmp;}
    var lv=M[r][lead];for(var j=0;j<cols;j++)M[r][j]=div(M[r][j],lv);
    for(var k=0;k<rows;k++)if(k!==r&&!isZero(M[k][lead])){
      var f=M[k][lead];for(var c=0;c<cols;c++)M[k][c]=sub(M[k][c],mul(f,M[r][c]));
    }
    pivots.push(lead);lead++;
  }
  return {matrix:M,pivots:pivots};
}
function determinant(A){
  var sh=matrixShape(A),n=sh[0];if(n!==sh[1])throw new Error("Determinant requires a square matrix");
  if(n===0)return new Rational(1n);
  var M=cloneMatrix(A),sign=1,det=new Rational(1n);
  for(var c=0;c<n;c++){
    var p=c;while(p<n&&isZero(M[p][c]))p++;
    if(p===n)return new Rational(0n);
    if(p!==c){var t=M[p];M[p]=M[c];M[c]=t;sign*=-1;}
    var pivot=M[c][c];det=mul(det,pivot);
    for(var r=c+1;r<n;r++){
      if(isZero(M[r][c]))continue;
      var f=div(M[r][c],pivot);
      for(var j=c+1;j<n;j++)M[r][j]=sub(M[r][j],mul(f,M[c][j]));
      M[r][c]=new Rational(0n);
    }
  }
  return sign<0?neg(det):det;
}
function inverse(A){
  var sh=matrixShape(A),n=sh[0];if(n!==sh[1])throw new Error("Inverse requires a square matrix");
  var aug=A.map(function(row,i){return row.concat(Array.from({length:n},function(_,j){return new Rational(i===j?1n:0n);}));});
  var rr=rref(aug).matrix;
  for(var i=0;i<n;i++)for(var j=0;j<n;j++){
    var expected=i===j?1:0;if(Math.abs(toNumber(rr[i][j])-expected)>1e-10)throw new Error("Matrix is singular");
  }
  return rr.map(function(row){return row.slice(n);});
}
function rank(A){return rref(A).pivots.length;}
function matrixToStrings(A,precision){return A.map(function(row){return row.map(function(v){return formatValue(v,precision);});});}

function sumNums(a){var s=0,c=0;for(var i=0;i<a.length;i++){var y=a[i]-c,t=s+y;c=(t-s)-y;s=t;}return s;}
function stats(values){
  var x=values.map(Number).filter(Number.isFinite),n=x.length;if(!n)throw new Error("No numeric values");
  var mean=sumNums(x)/n,m2=0;
  for(var i=0;i<n;i++){var d=x[i]-mean;m2+=d*d;}
  var sorted=x.slice().sort(function(a,b){return a-b;});
  var med=n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
  return {count:n,sum:sumNums(x),mean:mean,median:med,min:sorted[0],max:sorted[n-1],variancePopulation:m2/n,varianceSample:n>1?m2/(n-1):NaN,sdPopulation:Math.sqrt(m2/n),sdSample:n>1?Math.sqrt(m2/(n-1)):NaN};
}
function covariance(x,y,sample){
  if(x.length!==y.length)throw new Error("Paired columns must have the same length");
  var pairs=[];for(var i=0;i<x.length;i++){var a=Number(x[i]),b=Number(y[i]);if(Number.isFinite(a)&&Number.isFinite(b))pairs.push([a,b]);}
  var n=pairs.length;if(n<(sample?2:1))throw new Error("Not enough paired observations");
  var mx=sumNums(pairs.map(function(p){return p[0];}))/n,my=sumNums(pairs.map(function(p){return p[1];}))/n,s=0;
  for(var j=0;j<n;j++)s+=(pairs[j][0]-mx)*(pairs[j][1]-my);
  return s/(sample?n-1:n);
}
function correlation(x,y){
  var pairs=[];for(var i=0;i<Math.min(x.length,y.length);i++){var a=Number(x[i]),b=Number(y[i]);if(Number.isFinite(a)&&Number.isFinite(b))pairs.push([a,b]);}
  if(pairs.length<2)throw new Error("Not enough paired observations");
  var xs=pairs.map(function(p){return p[0];}),ys=pairs.map(function(p){return p[1];});
  var sx=stats(xs).sdSample,sy=stats(ys).sdSample;if(sx===0||sy===0)throw new Error("Correlation is undefined for a constant column");
  var r=covariance(xs,ys,true)/(sx*sy);return Math.max(-1,Math.min(1,r));
}
function linearRegression(x,y){
  var pairs=[];for(var i=0;i<Math.min(x.length,y.length);i++){var a=Number(x[i]),b=Number(y[i]);if(Number.isFinite(a)&&Number.isFinite(b))pairs.push([a,b]);}
  if(pairs.length<2)throw new Error("Need at least two paired observations");
  var xs=pairs.map(function(p){return p[0];}),ys=pairs.map(function(p){return p[1];}),mx=stats(xs).mean,my=stats(ys).mean,sxx=0,sxy=0;
  for(var j=0;j<xs.length;j++){sxx+=(xs[j]-mx)*(xs[j]-mx);sxy+=(xs[j]-mx)*(ys[j]-my);}
  if(sxx===0)throw new Error("Regression requires variation in x");
  var slope=sxy/sxx,intercept=my-slope*mx,sse=0,sst=0;
  for(var k=0;k<xs.length;k++){var fit=intercept+slope*xs[k];sse+=(ys[k]-fit)*(ys[k]-fit);sst+=(ys[k]-my)*(ys[k]-my);}
  return {n:xs.length,slope:slope,intercept:intercept,r2:sst===0?1:1-sse/sst,correlation:correlation(xs,ys)};
}

function parseDelimited(text){
  text=String(text).replace(/\r\n?/g,"\n").trim();if(!text)return {headers:[],rows:[]};
  var delim=text.indexOf("\t")>=0?"\t":(text.split("\n")[0].split(";").length>text.split("\n")[0].split(",").length?";":",");
  var rows=[],row=[],field="",quoted=false;
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(quoted){
      if(c==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(c==='"')quoted=false;
      else field+=c;
    }else{
      if(c==='"')quoted=true;
      else if(c===delim){row.push(field.trim());field="";}
      else if(c==="\n"){row.push(field.trim());rows.push(row);row=[];field="";}
      else field+=c;
    }
  }
  row.push(field.trim());rows.push(row);
  if(rows.length&&rows[0].length===1&&/\s+/.test(rows[0][0])){
    rows=text.split("\n").map(function(r){return r.trim().split(/\s+/);});delim=" ";
  }
  var width=Math.max.apply(null,rows.map(function(r){return r.length;}));rows=rows.filter(function(r){return r.some(function(v){return v!=="";});});
  var first=rows[0]||[],numericFirst=first.every(function(v){return v===""||Number.isFinite(Number(v.replace(",",".")));});
  var headers=numericFirst?Array.from({length:width},function(_,i){return "Column "+(i+1);}):first.map(function(v,i){return v||"Column "+(i+1);});
  var body=numericFirst?rows:rows.slice(1);
  return {headers:headers,rows:body,delimiter:delim};
}

const UNIT_GROUPS={
  length:{m:1,km:1000,cm:.01,mm:.001,um:1e-6,nm:1e-9,in:.0254,ft:.3048,yd:.9144,mi:1609.344},
  area:{"m²":1,"km²":1e6,"cm²":1e-4,"mm²":1e-6,"ft²":.09290304,"in²":.00064516,ha:10000,acre:4046.8564224},
  mass:{kg:1,g:.001,mg:1e-6,lb:.45359237,oz:.028349523125},
  time:{s:1,min:60,h:3600,day:86400,week:604800},
  speed:{"m/s":1,"km/h":1/3.6,mph:.44704,"ft/s":.3048},
  volume:{L:1,mL:.001,"m³":1000,"cm³":.001,"gal (US)":3.785411784,"fl oz (US)":.0295735295625},
  energy:{J:1,kJ:1000,kWh:3600000,cal:4.184,kcal:4184},
  pressure:{Pa:1,kPa:1000,bar:100000,psi:6894.757293168},
  data:{B:1,kB:1000,MB:1e6,GB:1e9,KiB:1024,MiB:1048576,GiB:1073741824}
};
function convertUnit(value,from,to,group){
  value=Number(value);
  if(group==="temperature"){
    var k;
    if(from==="C")k=value+273.15;else if(from==="F")k=(value-32)*5/9+273.15;else if(from==="K")k=value;else throw new Error("Unknown temperature unit");
    if(to==="C")return k-273.15;if(to==="F")return (k-273.15)*9/5+32;if(to==="K")return k;throw new Error("Unknown temperature unit");
  }
  var g=UNIT_GROUPS[group];if(!g||g[from]===undefined||g[to]===undefined)throw new Error("Incompatible or unknown units");
  return value*g[from]/g[to];
}

function loan(principal,annualRate,years,paymentsPerYear){
  principal=Number(principal);annualRate=Number(annualRate);years=Number(years);paymentsPerYear=Number(paymentsPerYear||12);
  if(!(principal>=0)||!(years>0)||!(paymentsPerYear>0))throw new Error("Enter a valid principal, term and payment frequency");
  var n=Math.round(years*paymentsPerYear),i=annualRate/paymentsPerYear,payment;
  if(Math.abs(i)<1e-15)payment=principal/n;else payment=principal*i/(1-Math.pow(1+i,-n));
  var balance=principal,totalInterest=0,schedule=[];
  for(var p=1;p<=n;p++){
    var interest=balance*i,principalPaid=payment-interest;
    if(p===n||principalPaid>balance){principalPaid=balance;payment=principalPaid+interest;}
    balance=Math.max(0,balance-principalPaid);totalInterest+=interest;
    schedule.push({period:p,payment:payment,interest:interest,principal:principalPaid,balance:balance});
  }
  return {payment:schedule[0]?schedule[0].payment:0,totalInterest:totalInterest,totalPaid:principal+totalInterest,schedule:schedule};
}

function triangleSSS(a,b,c){
  a=Number(a);b=Number(b);c=Number(c);
  if(!(a>0&&b>0&&c>0)||a+b<=c||a+c<=b||b+c<=a)throw new Error("These sides cannot form a triangle");
  function acosd(x){return Math.acos(Math.max(-1,Math.min(1,x)))*180/Math.PI;}
  var A=acosd((b*b+c*c-a*a)/(2*b*c)),B=acosd((a*a+c*c-b*b)/(2*a*c)),C=180-A-B,s=(a+b+c)/2,area=Math.sqrt(s*(s-a)*(s-b)*(s-c));
  return {a:a,b:b,c:c,A:A,B:B,C:C,perimeter:a+b+c,area:area};
}

function dateDiffDays(a,b){
  var pa=String(a).split("-").map(Number),pb=String(b).split("-").map(Number);
  if(pa.length!==3||pb.length!==3)throw new Error("Use YYYY-MM-DD dates");
  var da=Date.UTC(pa[0],pa[1]-1,pa[2]),db=Date.UTC(pb[0],pb[1]-1,pb[2]);
  var ca=new Date(da),cb=new Date(db);
  if(ca.getUTCFullYear()!==pa[0]||ca.getUTCMonth()!==pa[1]-1||ca.getUTCDate()!==pa[2]||cb.getUTCFullYear()!==pb[0]||cb.getUTCMonth()!==pb[1]-1||cb.getUTCDate()!==pb[2])throw new Error("Invalid calendar date");
  return Math.round((db-da)/86400000);
}

function parseBigIntBase(text,base){
  text=String(text).trim().replace(/_/g,"");base=Number(base);
  var neg=false;if(text[0]==="-"){neg=true;text=text.slice(1);}
  if(!text)throw new Error("Enter an integer");
  var digits="0123456789abcdefghijklmnopqrstuvwxyz",v=0n,b=BigInt(base);
  for(var i=0;i<text.length;i++){var d=digits.indexOf(text[i].toLowerCase());if(d<0||d>=base)throw new Error("Invalid digit for base "+base);v=v*b+BigInt(d);}
  return neg?-v:v;
}
function bitInterpret(value,width,signed){
  width=Number(width);var mod=1n<<BigInt(width),raw=((BigInt(value)%mod)+mod)%mod;
  if(signed&&raw>=(1n<<BigInt(width-1)))return raw-mod;
  return raw;
}
function formatBase(value,base,width){
  value=BigInt(value);var s=value.toString(Number(base)).toUpperCase();
  if(Number(base)===2&&width)s=s.padStart(Number(width),"0");
  return s;
}

global.CalcMath={
  Rational:Rational,Complex:Complex,
  parseExpression:parseExpression,evaluate:evaluate,evaluateAst:evalAst,evaluateNumber:evaluateNumber,
  formatValue:formatValue,formatNumber:formatNumber,approxString:approxString,toNumber:toNumber,
  add:add,sub:sub,mul:mul,div:div,power:power,isZero:isZero,
  matrixFromStrings:matrixFromStrings,parseMatrixString:parseMatrixString,transpose:transpose,determinant:determinant,inverse:inverse,rref:rref,rank:rank,matrixToStrings:matrixToStrings,matMul:matMul,
  stats:stats,covariance:covariance,correlation:correlation,linearRegression:linearRegression,parseDelimited:parseDelimited,
  UNIT_GROUPS:UNIT_GROUPS,convertUnit:convertUnit,loan:loan,triangleSSS:triangleSSS,dateDiffDays:dateDiffDays,
  gcdBig:gcdBig,lcmBig:lcmBig,factorialBig:factorialBig,parseBigIntBase:parseBigIntBase,bitInterpret:bitInterpret,formatBase:formatBase
};
})(window);