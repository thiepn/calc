(function(global){
"use strict";

const LIMITS=Object.freeze({
  expressionLength:10000,
  tokens:4096,
  astNodes:5000,
  evaluationDepth:120,
  decimalExponent:10000,
  factorial:10000n
});

class CalcError extends Error{
  constructor(code,message,start,end,details){
    super(message);
    this.name=this.constructor.name;
    this.code=code||"CALC_ERROR";
    if(Number.isInteger(start))this.start=start;
    if(Number.isInteger(end))this.end=end;
    if(details!==undefined)this.details=details;
  }
}
class ParseError extends CalcError{constructor(message,start,end,details){super("PARSE_ERROR",message,start,end,details);}}
class DomainError extends CalcError{constructor(message,start,end,details){super("DOMAIN_ERROR",message,start,end,details);}}
class DivisionByZeroError extends CalcError{constructor(message){super("DIVISION_BY_ZERO",message||"Division by zero");}}
class UnknownIdentifierError extends CalcError{constructor(name,start,end){super("UNKNOWN_IDENTIFIER","Unknown identifier '"+name+"'",start,end,{identifier:name});}}
class ArityError extends CalcError{constructor(name,expected,actual){super("ARITY_ERROR",name+" expects "+expected+" argument"+(expected===1?"":"s")+"; received "+actual,undefined,undefined,{function:name,expected:expected,actual:actual});}}
class ComplexityError extends CalcError{constructor(message){super("COMPLEXITY_LIMIT",message);}}
class NonFiniteError extends CalcError{constructor(message){super("NON_FINITE_RESULT",message||"The result is not finite");}}
class ShapeError extends CalcError{constructor(message){super("SHAPE_ERROR",message);}}
class InvalidIdentifierError extends CalcError{constructor(name){super("INVALID_IDENTIFIER","'"+name+"' cannot be used as a user identifier",undefined,undefined,{identifier:name});}}

function absBig(n){return n<0n?-n:n;}
function gcdBig(a,b){a=absBig(BigInt(a));b=absBig(BigInt(b));while(b){var t=a%b;a=b;b=t;}return a;}
function lcmBig(a,b){a=BigInt(a);b=BigInt(b);if(a===0n||b===0n)return 0n;return absBig((a/gcdBig(a,b))*b);}
function pow10Big(n){
  n=Number(n);
  if(!Number.isInteger(n)||n<0||n>LIMITS.decimalExponent)throw new ComplexityError("Decimal exponent exceeds the exact-arithmetic safety limit");
  var r=1n,b=10n,e=n;
  while(e>0){if(e&1)r*=b;e=Math.floor(e/2);if(e)b*=b;}
  return r;
}

class Rational{
  constructor(n,d){
    if(d===undefined)d=1n;
    try{n=BigInt(n);d=BigInt(d);}catch(e){throw new DomainError("Invalid rational value");}
    if(d===0n)throw new DivisionByZeroError();
    if(d<0n){n=-n;d=-d;}
    var g=gcdBig(n,d);
    this.n=n/g;this.d=d/g;
    Object.freeze(this);
  }
  static fromDecimal(source){
    var s=String(source).trim();
    if(!/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(s))throw new ParseError("Invalid numeric literal '"+s+"'");
    var sign=1n;
    if(s[0]==="-"){sign=-1n;s=s.slice(1);}
    else if(s[0]==="+")s=s.slice(1);
    var parts=s.toLowerCase().split("e"),base=parts[0],exp=parts[1]===undefined?0:Number(parts[1]);
    if(!Number.isInteger(exp)||Math.abs(exp)>LIMITS.decimalExponent)throw new ComplexityError("Decimal exponent exceeds the exact-arithmetic safety limit");
    var dot=base.indexOf("."),digits,frac=0;
    if(dot>=0){frac=base.length-dot-1;digits=base.slice(0,dot)+base.slice(dot+1);}else digits=base;
    digits=digits||"0";
    var n=BigInt(digits)*sign,scale=frac-exp;
    return scale>=0?new Rational(n,pow10Big(scale)):new Rational(n*pow10Big(-scale),1n);
  }
  add(o){o=asRational(o);return new Rational(this.n*o.d+o.n*this.d,this.d*o.d);}
  sub(o){o=asRational(o);return new Rational(this.n*o.d-o.n*this.d,this.d*o.d);}
  mul(o){o=asRational(o);return new Rational(this.n*o.n,this.d*o.d);}
  div(o){o=asRational(o);if(o.n===0n)throw new DivisionByZeroError();return new Rational(this.n*o.d,this.d*o.n);}
  neg(){return new Rational(-this.n,this.d);}
  abs(){return new Rational(absBig(this.n),this.d);}
  inv(){if(this.n===0n)throw new DivisionByZeroError();return new Rational(this.d,this.n);}
  powInt(k){
    if(typeof k==="bigint"){
      if(k>BigInt(Number.MAX_SAFE_INTEGER)||k<BigInt(Number.MIN_SAFE_INTEGER))throw new ComplexityError("Exponent is too large");
      k=Number(k);
    }else k=Number(k);
    if(!Number.isSafeInteger(k))throw new ComplexityError("Exponent is too large");
    if(k===0)return new Rational(1n);
    if(k<0)return this.inv().powInt(-k);
    var bn=this.n,bd=this.d,rn=1n,rd=1n,e=k;
    while(e>0){if(e&1){rn*=bn;rd*=bd;}e=Math.floor(e/2);if(e){bn*=bn;bd*=bd;}}
    return new Rational(rn,rd);
  }
  compare(o){o=asRational(o);var d=this.n*o.d-o.n*this.d;return d<0n?-1:d>0n?1:0;}
  equals(o){try{return this.compare(o)===0;}catch(e){return false;}}
  isInteger(){return this.d===1n;}
  isZero(){return this.n===0n;}
  toNumber(){return Number(this.n)/Number(this.d);}
  toString(){return this.d===1n?String(this.n):String(this.n)+"/"+String(this.d);}
}

function asRational(v){
  if(v instanceof Rational)return v;
  if(typeof v==="bigint")return new Rational(v);
  if(typeof v==="number"&&Number.isSafeInteger(v))return new Rational(BigInt(v));
  throw new DomainError("Expected an exact rational value");
}
function normalizeReal(v){
  if(v instanceof Rational)return v;
  if(typeof v==="bigint")return new Rational(v);
  var n=Number(v);if(!Number.isFinite(n))throw new NonFiniteError();return n;
}
function realToNumber(v){return v instanceof Rational?v.toNumber():Number(v);}
function realIsZero(v){return v instanceof Rational?v.n===0n:Math.abs(Number(v))<1e-14;}
function realNeg(v){return v instanceof Rational?v.neg():ensureFinite(-Number(v));}
function realAbs(v){return v instanceof Rational?v.abs():Math.abs(Number(v));}
function realAdd(a,b){if(a instanceof Rational&&b instanceof Rational)return a.add(b);return ensureFinite(realToNumber(a)+realToNumber(b));}
function realSub(a,b){if(a instanceof Rational&&b instanceof Rational)return a.sub(b);return ensureFinite(realToNumber(a)-realToNumber(b));}
function realMul(a,b){if(a instanceof Rational&&b instanceof Rational)return a.mul(b);return ensureFinite(realToNumber(a)*realToNumber(b));}
function realDiv(a,b){
  if(realIsZero(b))throw new DivisionByZeroError();
  if(a instanceof Rational&&b instanceof Rational)return a.div(b);
  return ensureFinite(realToNumber(a)/realToNumber(b));
}

class Complex{
  constructor(re,im){
    this.re=normalizeReal(re===undefined?0:re);
    this.im=normalizeReal(im===undefined?0:im);
    Object.freeze(this);
  }
  add(o){o=toComplex(o);return new Complex(realAdd(this.re,o.re),realAdd(this.im,o.im));}
  sub(o){o=toComplex(o);return new Complex(realSub(this.re,o.re),realSub(this.im,o.im));}
  mul(o){o=toComplex(o);return new Complex(realSub(realMul(this.re,o.re),realMul(this.im,o.im)),realAdd(realMul(this.re,o.im),realMul(this.im,o.re)));}
  div(o){
    o=toComplex(o);var q=realAdd(realMul(o.re,o.re),realMul(o.im,o.im));if(realIsZero(q))throw new DivisionByZeroError();
    return new Complex(realDiv(realAdd(realMul(this.re,o.re),realMul(this.im,o.im)),q),realDiv(realSub(realMul(this.im,o.re),realMul(this.re,o.im)),q));
  }
  neg(){return new Complex(realNeg(this.re),realNeg(this.im));}
  conjugate(){return new Complex(this.re,realNeg(this.im));}
  abs(){return Math.hypot(realToNumber(this.re),realToNumber(this.im));}
  isReal(){return realIsZero(this.im);}
}

function isRational(v){return v instanceof Rational;}
function isComplex(v){return v instanceof Complex;}
function isExactValue(v){return v instanceof Rational||(v instanceof Complex&&v.re instanceof Rational&&v.im instanceof Rational);}
function numericKind(v){
  if(v instanceof Rational)return v.isInteger()?"integer":"rational";
  if(v instanceof Complex)return "complex";
  if(typeof v==="number")return "real";
  if(v&&v.__function)return "function";
  return typeof v;
}
function toComplex(v){return v instanceof Complex?v:new Complex(normalizeReal(v),new Rational(0n));}
function toNumber(v){
  if(v instanceof Rational)return v.toNumber();
  if(v instanceof Complex){if(realIsZero(v.im))return realToNumber(v.re);return NaN;}
  return Number(v);
}
function ensureFinite(n,message){n=Number(n);if(!Number.isFinite(n))throw new NonFiniteError(message||"The result is outside the supported finite numeric range");return n;}
function isZero(v){if(v instanceof Rational)return v.isZero();if(v instanceof Complex)return realIsZero(v.re)&&realIsZero(v.im);return Math.abs(Number(v))<1e-14;}
function coerceScalar(v){return typeof v==="bigint"?new Rational(v):v;}

function add(a,b){a=coerceScalar(a);b=coerceScalar(b);if(isComplex(a)||isComplex(b))return toComplex(a).add(b);if(isRational(a)&&isRational(b))return a.add(b);return ensureFinite(toNumber(a)+toNumber(b));}
function sub(a,b){a=coerceScalar(a);b=coerceScalar(b);if(isComplex(a)||isComplex(b))return toComplex(a).sub(b);if(isRational(a)&&isRational(b))return a.sub(b);return ensureFinite(toNumber(a)-toNumber(b));}
function mul(a,b){a=coerceScalar(a);b=coerceScalar(b);if(isComplex(a)||isComplex(b))return toComplex(a).mul(b);if(isRational(a)&&isRational(b))return a.mul(b);return ensureFinite(toNumber(a)*toNumber(b));}
function div(a,b){a=coerceScalar(a);b=coerceScalar(b);if(isZero(b))throw new DivisionByZeroError();if(isComplex(a)||isComplex(b))return toComplex(a).div(b);if(isRational(a)&&isRational(b))return a.div(b);return ensureFinite(toNumber(a)/toNumber(b));}
function neg(a){a=coerceScalar(a);if(isComplex(a))return a.neg();if(isRational(a))return a.neg();return ensureFinite(-Number(a));}

function complexPowInt(z,k){
  z=toComplex(z);
  if(typeof k==="bigint"){if(k>BigInt(Number.MAX_SAFE_INTEGER)||k<BigInt(Number.MIN_SAFE_INTEGER))throw new ComplexityError("Exponent is too large");k=Number(k);}
  if(!Number.isSafeInteger(k))throw new ComplexityError("Exponent is too large");
  if(k===0)return new Complex(new Rational(1n),new Rational(0n));
  if(k<0)return new Complex(new Rational(1n),new Rational(0n)).div(complexPowInt(z,-k));
  var result=new Complex(new Rational(1n),new Rational(0n)),base=z,e=k;
  while(e>0){if(e&1)result=result.mul(base);e=Math.floor(e/2);if(e)base=base.mul(base);}
  return result;
}
function complexExp(z){z=toComplex(z);var a=realToNumber(z.re),b=realToNumber(z.im),ea=Math.exp(a);return new Complex(ensureFinite(ea*Math.cos(b)),ensureFinite(ea*Math.sin(b)));}
function complexLog(z){z=toComplex(z);var r=z.abs();if(r===0)throw new DomainError("log(0) is undefined");return new Complex(Math.log(r),Math.atan2(realToNumber(z.im),realToNumber(z.re)));}
function complexPow(a,b){var z=toComplex(a),w=toComplex(b);if(w.isReal()&&w.re instanceof Rational&&w.re.isInteger())return complexPowInt(z,w.re.n);return complexExp(toComplex(w).mul(complexLog(z)));}
function power(a,b,options){
  a=coerceScalar(a);b=coerceScalar(b);options=options||{};
  if(isZero(a)&&isZero(b))throw new DomainError("0^0 is undefined in Calc");
  if(isZero(a)&&toNumber(b)<0)throw new DivisionByZeroError("Zero cannot be raised to a negative power");
  if(isComplex(a)||isComplex(b))return complexPow(a,b);
  if(isRational(b)&&b.isInteger()&&isRational(a))return a.powInt(b.n);
  var av=toNumber(a),bv=toNumber(b);
  if(av<0&&!Number.isInteger(bv)){
    if(options.complex===false)throw new DomainError("A negative real base with a non-integer exponent has no real value");
    return complexPow(new Complex(a,new Rational(0n)),new Complex(b,new Rational(0n)));
  }
  return ensureFinite(Math.pow(av,bv),"Power result is outside the supported finite numeric range");
}

function factorialBig(n){
  n=BigInt(n);if(n<0n)throw new DomainError("Factorial requires a non-negative integer");
  if(n>LIMITS.factorial)throw new ComplexityError("Factorial exceeds the safety limit of "+LIMITS.factorial.toString());
  var r=1n;for(var i=2n;i<=n;i++)r*=i;return r;
}
function exactInteger(v,name){
  if(v instanceof Rational&&v.isInteger())return v.n;
  if(typeof v==="bigint")return v;
  if(typeof v==="number"&&Number.isSafeInteger(v))return BigInt(v);
  throw new DomainError((name||"Value")+" must be an integer");
}
function bigIntSqrt(n){
  n=BigInt(n);if(n<0n)return null;if(n<2n)return n;
  var x0=1n<<(BigInt(n.toString(2).length)>>1n),x1=(x0+n/x0)>>1n;
  while(x1<x0){x0=x1;x1=(x0+n/x0)>>1n;}return x0;
}
function sqrtValue(v,complexAllowed){
  if(v instanceof Complex){
    if(v.isReal())return sqrtValue(v.re,complexAllowed);
    var a=realToNumber(v.re),b=realToNumber(v.im),r=Math.hypot(a,b),re=Math.sqrt(Math.max(0,(r+a)/2)),im=(b<0?-1:1)*Math.sqrt(Math.max(0,(r-a)/2));
    return new Complex(cleanNumber(re),cleanNumber(im));
  }
  if(v instanceof Rational){
    if(v.n<0n){if(!complexAllowed)throw new DomainError("Square root is not real for a negative value");var sv=sqrtValue(v.neg(),false);return new Complex(new Rational(0n),sv);}
    var sn=bigIntSqrt(v.n),sd=bigIntSqrt(v.d);if(sn*sn===v.n&&sd*sd===v.d)return new Rational(sn,sd);
    return ensureFinite(Math.sqrt(v.toNumber()));
  }
  var n=toNumber(v);if(n<0){if(complexAllowed)return new Complex(new Rational(0n),Math.sqrt(-n));throw new DomainError("Square root is not real for a negative value");}
  return ensureFinite(Math.sqrt(n));
}

function cleanNumber(n){
  if(!Number.isFinite(n))return n;if(Math.abs(n)<1e-14)return 0;
  var rounded=Math.round(n);if(Math.abs(n-rounded)<=1e-13*Math.max(1,Math.abs(n)))return rounded;return n;
}
function formatNumber(n,precision){
  n=cleanNumber(n);precision=Math.max(2,Math.min(17,Number(precision)||12));
  if(Number.isNaN(n))return "Undefined";if(n===Infinity)return "∞";if(n===-Infinity)return "−∞";
  var a=Math.abs(n);if(a!==0&&(a>=1e12||a<1e-8))return n.toExponential(Math.min(precision-1,15)).replace(/\.0+e/,"e").replace(/(\.\d*?)0+e/,"$1e");
  return Number(n.toPrecision(precision)).toString();
}
function realSign(v){if(v instanceof Rational)return v.n<0n?-1:v.n>0n?1:0;var n=Number(v);return n<0?-1:n>0?1:0;}
function formatReal(v,precision){return v instanceof Rational?v.toString():formatNumber(Number(v),precision);}
function formatValue(v,precision){
  if(v instanceof Rational)return v.toString();
  if(v instanceof Complex){
    var re=v.re,im=v.im,rs=realSign(re),is=realSign(im);if(is===0)return formatReal(re,precision);
    var absIm=realAbs(im),imText=(absIm instanceof Rational&&absIm.equals(new Rational(1n)))?"":formatReal(absIm,precision);
    if(rs===0)return (is<0?"−":"")+imText+"i";
    return formatReal(re,precision)+(is<0?" − ":" + ")+imText+"i";
  }
  if(typeof v==="number")return formatNumber(v,precision);
  if(v&&v.__function)return v.name+"("+v.params.join(", ")+")";
  return String(v);
}
function approxString(v,precision){
  if(v instanceof Rational&&v.d!==1n)return "≈ "+formatNumber(v.toNumber(),precision||12);
  if(v instanceof Complex&&isExactValue(v)){
    var needs=(v.re instanceof Rational&&v.re.d!==1n)||(v.im instanceof Rational&&v.im.d!==1n);
    if(needs)return "≈ "+formatValue(new Complex(realToNumber(v.re),realToNumber(v.im)),precision||12);
  }
  return "";
}

function serializeValue(v){
  if(v instanceof Rational)return {type:"rational",n:v.n.toString(),d:v.d.toString()};
  if(v instanceof Complex)return {type:"complex",re:serializeValue(v.re),im:serializeValue(v.im)};
  if(typeof v==="number"){if(!Number.isFinite(v))throw new NonFiniteError("Non-finite values cannot be serialized");return {type:"real",value:v};}
  if(v&&v.__function)return {type:"function",name:v.name,params:v.params.slice(),ast:serializeAst(v.ast),source:v.source};
  throw new DomainError("Unsupported value type for serialization");
}
function deserializeValue(data){
  if(!data||typeof data!=="object")throw new DomainError("Invalid serialized value");
  if(data.type==="rational")return new Rational(BigInt(data.n),BigInt(data.d));
  if(data.type==="real")return ensureFinite(data.value);
  if(data.type==="complex")return new Complex(deserializeValue(data.re),deserializeValue(data.im));
  if(data.type==="function")return {__function:true,name:data.name,params:data.params.slice(),ast:deserializeAst(data.ast),source:data.source};
  throw new DomainError("Unknown serialized value type '"+String(data.type)+"'");
}
function serializeAst(node){
  if(!node||typeof node!=="object")throw new DomainError("Invalid AST");
  var o={type:node.type,start:node.start,end:node.end};
  if(node.type==="literal")o.value=serializeValue(node.value);
  else if(node.type==="identifier")o.name=node.name;
  else if(node.type==="unary"||node.type==="postfix"){o.op=node.op;o.arg=serializeAst(node.arg);}
  else if(node.type==="binary"){o.op=node.op;o.implicit=!!node.implicit;o.left=serializeAst(node.left);o.right=serializeAst(node.right);}
  else if(node.type==="call"){o.name=node.name;o.args=node.args.map(serializeAst);}
  else throw new DomainError("Unsupported AST node '"+node.type+"'");
  return o;
}
function deserializeAst(o){
  if(!o||typeof o!=="object")throw new DomainError("Invalid serialized AST");
  var node={type:o.type,start:o.start,end:o.end};
  if(o.type==="literal")node.value=deserializeValue(o.value);
  else if(o.type==="identifier")node.name=o.name;
  else if(o.type==="unary"||o.type==="postfix"){node.op=o.op;node.arg=deserializeAst(o.arg);}
  else if(o.type==="binary"){node.op=o.op;node.implicit=!!o.implicit;node.left=deserializeAst(o.left);node.right=deserializeAst(o.right);}
  else if(o.type==="call"){node.name=o.name;node.args=(o.args||[]).map(deserializeAst);}
  else throw new DomainError("Unsupported AST node '"+String(o.type)+"'");
  return node;
}

function normalizeInput(s){
  return String(s).replace(/[−–—]/g,"-").replace(/[×·⋅]/g,"*").replace(/÷/g,"/").replace(/π/g,"pi").replace(/√/g,"sqrt").replace(/²/g,"^2").replace(/³/g,"^3").replace(/\*\*/g,"^").replace(/\u00a0/g," ").normalize("NFKC");
}
function isIdentifierStart(c){return /[\p{L}_]/u.test(c);}
function isIdentifierPart(c){return /[\p{L}\p{N}_]/u.test(c);}

class Tokenizer{
  constructor(source){this.original=String(source);this.s=normalizeInput(source);this.i=0;this.current=null;this.count=0;this.next();}
  next(){
    var s=this.s,n=s.length;while(this.i<n&&/\s/.test(s[this.i]))this.i++;
    if(this.i>=n){this.current={type:"eof",value:"",start:this.i,end:this.i};return this.current;}
    this.count++;if(this.count>LIMITS.tokens)throw new ComplexityError("Expression contains too many tokens");
    var p=this.i,c=s[this.i];
    if(/[0-9.]/.test(c)){
      var m=s.slice(this.i).match(/^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?/i);if(!m)throw new ParseError("Invalid number at position "+p,p,p+1);
      this.i+=m[0].length;this.current={type:"num",value:m[0],start:p,end:this.i};return this.current;
    }
    if(isIdentifierStart(c)){var j=this.i+1;while(j<n&&isIdentifierPart(s[j]))j++;var id=s.slice(this.i,j);this.i=j;this.current={type:"id",value:id,start:p,end:j};return this.current;}
    var two=s.slice(this.i,this.i+2);if(["<=",">=","!=","=="].indexOf(two)>=0){this.i+=2;this.current={type:"op",value:two,start:p,end:this.i};return this.current;}
    if("+-*/^!%(),=<>".indexOf(c)>=0){this.i++;this.current={type:"op",value:c,start:p,end:this.i};return this.current;}
    throw new ParseError("Unexpected character '"+c+"' at position "+p,p,p+1);
  }
  take(v){if(this.current.value===v){var t=this.current;this.next();return t;}return null;}
  expect(v){if(this.current.value!==v)throw new ParseError("Expected '"+v+"' at position "+this.current.start,this.current.start,this.current.end);var t=this.current;this.next();return t;}
}
function startsAtom(t){return t.type==="id"||t.value==="(";}

class Parser{
  constructor(source){this.t=new Tokenizer(source);this.nodes=0;}
  node(o){this.nodes++;if(this.nodes>LIMITS.astNodes)throw new ComplexityError("Expression contains too many AST nodes");return o;}
  parse(){var n=this.expr(0);if(this.t.current.type!=="eof")throw new ParseError("Unexpected '"+this.t.current.value+"' at position "+this.t.current.start,this.t.current.start,this.t.current.end);return n;}
  expr(minBp){
    var tok=this.t.current,left;
    if(tok.type==="num"){this.t.next();left=this.node({type:"literal",value:Rational.fromDecimal(tok.value),start:tok.start,end:tok.end});}
    else if(tok.type==="id"){
      this.t.next();
      if(this.t.current.value==="("){
        this.t.next();var args=[];if(this.t.current.value!==")"){while(true){args.push(this.expr(0));if(this.t.take(","))continue;break;}}
        var close=this.t.expect(")");left=this.node({type:"call",name:tok.value,args:args,start:tok.start,end:close.end});
      }else left=this.node({type:"identifier",name:tok.value,start:tok.start,end:tok.end});
    }else if(tok.value==="("){
      var open=tok;this.t.next();left=this.expr(0);var close2=this.t.expect(")");left=Object.assign({},left,{start:open.start,end:close2.end});
    }else if(tok.value==="+"||tok.value==="-"){
      this.t.next();var ua=this.expr(29);left=this.node({type:"unary",op:tok.value,arg:ua,start:tok.start,end:ua.end});
    }else throw new ParseError("Expected a value at position "+tok.start,tok.start,tok.end);

    while(true){
      if(this.t.current.value==="!"){if(40<minBp)break;var pt=this.t.current;this.t.next();left=this.node({type:"postfix",op:"!",arg:left,start:left.start,end:pt.end});continue;}
      if(this.t.current.value==="%"){if(40<minBp)break;var pct=this.t.current;this.t.next();left=this.node({type:"postfix",op:"%",arg:left,start:left.start,end:pct.end});continue;}
      var op=this.t.current.value,lbp,rbp,implicit=false,opToken=this.t.current;
      if(op==="+"||op==="-"){lbp=10;rbp=11;}else if(op==="*"||op==="/"){lbp=20;rbp=21;}else if(op==="^"){lbp=30;rbp=30;}else if(startsAtom(this.t.current)){op="*";lbp=20;rbp=21;implicit=true;}else break;
      if(lbp<minBp)break;if(!implicit)this.t.next();var right=this.expr(rbp);
      left=this.node({type:"binary",op:op,left:left,right:right,implicit:implicit,start:left.start,end:right.end,operatorStart:implicit?right.start:opToken.start});
    }
    return left;
  }
}

const DANGEROUS_IDENTIFIERS=new Set(["__proto__","prototype","constructor"]);
const CONSTANT_REGISTRY=Object.freeze({
  pi:Object.freeze({name:"pi",value:Math.PI,exact:false,description:"Archimedes' constant"}),
  e:Object.freeze({name:"e",value:Math.E,exact:false,description:"Euler's number"}),
  i:Object.freeze({name:"i",value:new Complex(new Rational(0n),new Rational(1n)),exact:true,description:"Imaginary unit"})
});
const BUILTIN_NAMES=new Set(["sqrt","abs","sin","cos","tan","asin","acos","atan","atan2","sinh","cosh","tanh","ln","log","log10","exp","floor","ceil","round","sign","gcd","lcm","mod","ncr","npr","min","max"]);
const FUNCTION_REGISTRY=Object.freeze({
  sqrt:Object.freeze({min:1,max:1}),abs:Object.freeze({min:1,max:1}),sin:Object.freeze({min:1,max:1}),cos:Object.freeze({min:1,max:1}),tan:Object.freeze({min:1,max:1}),
  asin:Object.freeze({min:1,max:1}),acos:Object.freeze({min:1,max:1}),atan:Object.freeze({min:1,max:1}),atan2:Object.freeze({min:2,max:2}),
  sinh:Object.freeze({min:1,max:1}),cosh:Object.freeze({min:1,max:1}),tanh:Object.freeze({min:1,max:1}),
  ln:Object.freeze({min:1,max:1}),log:Object.freeze({min:1,max:2}),log10:Object.freeze({min:1,max:1}),exp:Object.freeze({min:1,max:1}),
  floor:Object.freeze({min:1,max:1}),ceil:Object.freeze({min:1,max:1}),round:Object.freeze({min:1,max:1}),sign:Object.freeze({min:1,max:1}),
  gcd:Object.freeze({min:2,max:2}),lcm:Object.freeze({min:2,max:2}),mod:Object.freeze({min:2,max:2}),ncr:Object.freeze({min:2,max:2}),npr:Object.freeze({min:2,max:2}),
  min:Object.freeze({min:1,max:Infinity}),max:Object.freeze({min:1,max:Infinity})
});

function validateUserIdentifier(name){
  if(!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)||DANGEROUS_IDENTIFIERS.has(name)||hasOwn(CONSTANT_REGISTRY,name)||BUILTIN_NAMES.has(name)||name==="ans")throw new InvalidIdentifierError(name);
  return name;
}
function defineEnvValue(env,name,value){validateUserIdentifier(name);Object.defineProperty(env,name,{value:value,writable:true,configurable:true,enumerable:true});}
function hasOwn(obj,key){return Object.prototype.hasOwnProperty.call(obj,key);}
function lookupEnv(env,name){
  var cur=env;
  while(cur&&cur!==Object.prototype){
    if(hasOwn(cur,name))return {found:true,value:cur[name]};
    cur=Object.getPrototypeOf(cur);
  }
  return {found:false,value:undefined};
}

function exactDegreeKey(v){if(!(v instanceof Rational)||!v.isInteger())return null;var d=v.n%360n;if(d<0n)d+=360n;return Number(d);}
function rationalPair(n,d){return new Rational(BigInt(n),BigInt(d||1));}
const SIN_DEG_EXACT=Object.freeze({0:rationalPair(0),30:rationalPair(1,2),90:rationalPair(1),150:rationalPair(1,2),180:rationalPair(0),210:rationalPair(-1,2),270:rationalPair(-1),330:rationalPair(-1,2)});
const COS_DEG_EXACT=Object.freeze({0:rationalPair(1),60:rationalPair(1,2),90:rationalPair(0),120:rationalPair(-1,2),180:rationalPair(-1),240:rationalPair(-1,2),270:rationalPair(0),300:rationalPair(1,2)});
const TAN_DEG_EXACT=Object.freeze({0:rationalPair(0),45:rationalPair(1),135:rationalPair(-1),180:rationalPair(0),225:rationalPair(1),315:rationalPair(-1)});
function angleIn(n,options){var mode=(options&&options.angle)||"RAD";if(mode==="DEG")return n*Math.PI/180;if(mode==="GRAD")return n*Math.PI/200;return n;}
function angleOut(n,options){var mode=(options&&options.angle)||"RAD";if(mode==="DEG")return n*180/Math.PI;if(mode==="GRAD")return n*200/Math.PI;return n;}
function complexSin(z){z=toComplex(z);var a=realToNumber(z.re),b=realToNumber(z.im);return new Complex(Math.sin(a)*Math.cosh(b),Math.cos(a)*Math.sinh(b));}
function complexCos(z){z=toComplex(z);var a=realToNumber(z.re),b=realToNumber(z.im);return new Complex(Math.cos(a)*Math.cosh(b),-Math.sin(a)*Math.sinh(b));}
function complexTan(z){return complexSin(z).div(complexCos(z));}

function assertArity(name,args){
  var spec=FUNCTION_REGISTRY[name];if(!spec)throw new UnknownIdentifierError(name);
  if(args.length<spec.min||args.length>spec.max){
    var expected=spec.min===spec.max?spec.min:(spec.max===Infinity?("at least "+spec.min):(spec.min+"–"+spec.max));
    if(typeof expected==="number")throw new ArityError(name,expected,args.length);
    throw new CalcError("ARITY_ERROR",name+" expects "+expected+" arguments; received "+args.length);
  }
}
function callBuiltin(name,args,options){
  name=name.toLowerCase();assertArity(name,args);options=options||{};
  if(name==="sqrt")return sqrtValue(args[0],options.complex!==false);
  if(name==="abs")return isComplex(args[0])?args[0].abs():(isRational(args[0])?args[0].abs():Math.abs(toNumber(args[0])));
  if(name==="sin"){
    if(isComplex(args[0]))return complexSin(args[0]);
    if(options.angle==="DEG"){var sk=exactDegreeKey(args[0]);if(sk!==null&&hasOwn(SIN_DEG_EXACT,sk))return SIN_DEG_EXACT[sk];}
    if(isRational(args[0])&&args[0].isZero())return new Rational(0n);return cleanNumber(Math.sin(angleIn(toNumber(args[0]),options)));
  }
  if(name==="cos"){
    if(isComplex(args[0]))return complexCos(args[0]);
    if(options.angle==="DEG"){var ck=exactDegreeKey(args[0]);if(ck!==null&&hasOwn(COS_DEG_EXACT,ck))return COS_DEG_EXACT[ck];}
    if(isRational(args[0])&&args[0].isZero())return new Rational(1n);return cleanNumber(Math.cos(angleIn(toNumber(args[0]),options)));
  }
  if(name==="tan"){
    if(isComplex(args[0]))return complexTan(args[0]);
    if(options.angle==="DEG"){var tk=exactDegreeKey(args[0]);if(tk===90||tk===270)throw new DomainError("tan is undefined at this angle");if(tk!==null&&hasOwn(TAN_DEG_EXACT,tk))return TAN_DEG_EXACT[tk];}
    if(isRational(args[0])&&args[0].isZero())return new Rational(0n);return cleanNumber(Math.tan(angleIn(toNumber(args[0]),options)));
  }
  if(name==="asin"){
    var av=toNumber(args[0]);if(av<-1||av>1)throw new DomainError("asin requires a real input between -1 and 1");
    if(options.angle==="DEG"&&args[0] instanceof Rational){var amap={"-1":"-90","-1/2":"-30","0":"0","1/2":"30","1":"90"},as=args[0].toString();if(hasOwn(amap,as))return new Rational(BigInt(amap[as]));}
    return cleanNumber(angleOut(Math.asin(av),options));
  }
  if(name==="acos"){
    var cv=toNumber(args[0]);if(cv<-1||cv>1)throw new DomainError("acos requires a real input between -1 and 1");
    if(options.angle==="DEG"&&args[0] instanceof Rational){var cmap={"-1":"180","-1/2":"120","0":"90","1/2":"60","1":"0"},cs=args[0].toString();if(hasOwn(cmap,cs))return new Rational(BigInt(cmap[cs]));}
    return cleanNumber(angleOut(Math.acos(cv),options));
  }
  if(name==="atan"){
    if(options.angle==="DEG"&&args[0] instanceof Rational){var atmap={"-1":"-45","0":"0","1":"45"},ats=args[0].toString();if(hasOwn(atmap,ats))return new Rational(BigInt(atmap[ats]));}
    return cleanNumber(angleOut(Math.atan(toNumber(args[0])),options));
  }
  if(name==="atan2")return cleanNumber(angleOut(Math.atan2(toNumber(args[0]),toNumber(args[1])),options));
  if(name==="sinh")return ensureFinite(Math.sinh(toNumber(args[0])));
  if(name==="cosh")return ensureFinite(Math.cosh(toNumber(args[0])));
  if(name==="tanh")return ensureFinite(Math.tanh(toNumber(args[0])));
  if(name==="ln"){
    if(isComplex(args[0]))return complexLog(args[0]);var lv=toNumber(args[0]);
    if(lv<0){if(options.complex===false)throw new DomainError("ln requires a positive real value in real mode");return complexLog(new Complex(args[0],new Rational(0n)));}
    if(lv===0)throw new DomainError("ln(0) is undefined");return ensureFinite(Math.log(lv));
  }
  if(name==="log10")return callBuiltin("log",[args[0],new Rational(10n)],options);
  if(name==="log"){var x=toNumber(args[0]),base=args.length===2?toNumber(args[1]):10;if(x<=0||base<=0||base===1)throw new DomainError("log requires x > 0, base > 0, and base ≠ 1");return ensureFinite(Math.log(x)/Math.log(base));}
  if(name==="exp"){if(isComplex(args[0]))return complexExp(args[0]);return ensureFinite(Math.exp(toNumber(args[0])),"exp result is outside the supported finite numeric range");}
  if(name==="floor")return new Rational(BigInt(Math.floor(toNumber(args[0]))));
  if(name==="ceil")return new Rational(BigInt(Math.ceil(toNumber(args[0]))));
  if(name==="round")return new Rational(BigInt(Math.round(toNumber(args[0]))));
  if(name==="sign"){if(isComplex(args[0])&&!args[0].isReal())throw new DomainError("sign is not defined for non-real complex values");var sv=toNumber(args[0]);return new Rational(BigInt(sv<0?-1:sv>0?1:0));}
  if(name==="gcd")return new Rational(gcdBig(exactInteger(args[0]),exactInteger(args[1])));
  if(name==="lcm")return new Rational(lcmBig(exactInteger(args[0]),exactInteger(args[1])));
  if(name==="mod"){var aa=exactInteger(args[0]),mm=exactInteger(args[1]);if(mm===0n)throw new DivisionByZeroError("Modulus cannot be zero");var rr=aa%mm;if(rr<0n)rr+=absBig(mm);return new Rational(rr);}
  if(name==="ncr"){var n=exactInteger(args[0],"n"),r=exactInteger(args[1],"r");if(n<0n||r<0n||r>n)throw new DomainError("nCr requires 0 ≤ r ≤ n");if(r>n-r)r=n-r;var c=1n;for(var i=1n;i<=r;i++)c=c*(n-r+i)/i;return new Rational(c);}
  if(name==="npr"){var np=exactInteger(args[0],"n"),rp=exactInteger(args[1],"r");if(np<0n||rp<0n||rp>np)throw new DomainError("nPr requires 0 ≤ r ≤ n");var p=1n;for(var j=0n;j<rp;j++)p*=np-j;return new Rational(p);}
  if(name==="min"||name==="max"){if(args.some(isComplex))throw new DomainError(name+" is defined only for real values");var nums=args.map(toNumber),mv=name==="min"?Math.min.apply(null,nums):Math.max.apply(null,nums);return ensureFinite(mv);}
  throw new UnknownIdentifierError(name);
}

function evalAst(node,env,options,depth){
  options=options||{};env=env||{};depth=depth||0;if(depth>LIMITS.evaluationDepth)throw new ComplexityError("Evaluation recursion limit reached");
  switch(node.type){
    case "literal":return node.value;
    case "identifier":{
      var found=lookupEnv(env,node.name);if(found.found){if(found.value&&found.value.__function)throw new DomainError(node.name+" is a function and must be called");return found.value;}
      if(hasOwn(CONSTANT_REGISTRY,node.name)){if(node.name==="i"&&options.complex===false)throw new DomainError("Complex numbers are disabled");return CONSTANT_REGISTRY[node.name].value;}
      throw new UnknownIdentifierError(node.name,node.start,node.end);
    }
    case "unary":{var ua=evalAst(node.arg,env,options,depth+1);return node.op==="-"?neg(ua):ua;}
    case "postfix":{var pv=evalAst(node.arg,env,options,depth+1);if(node.op==="%")return div(pv,new Rational(100n));return new Rational(factorialBig(exactInteger(pv,"Factorial input")));}
    case "binary":{
      var a=evalAst(node.left,env,options,depth+1),b=evalAst(node.right,env,options,depth+1);
      if(node.op==="+")return add(a,b);if(node.op==="-")return sub(a,b);if(node.op==="*")return mul(a,b);if(node.op==="/")return div(a,b);if(node.op==="^")return power(a,b,options);
      throw new ParseError("Unsupported operator '"+node.op+"'",node.operatorStart,node.operatorStart+1);
    }
    case "call":{
      var args=node.args.map(function(x){return evalAst(x,env,options,depth+1);}),lookup=lookupEnv(env,node.name);
      if(lookup.found&&lookup.value&&lookup.value.__function){
        var f=lookup.value;if(args.length!==f.params.length)throw new ArityError(f.name,f.params.length,args.length);
        var local=Object.create(env);f.params.forEach(function(param,i){Object.defineProperty(local,param,{value:args[i],writable:true,configurable:true,enumerable:true});});
        return evalAst(f.ast,local,options,depth+1);
      }
      return callBuiltin(node.name,args,options);
    }
  }
  throw new ParseError("Unknown AST node '"+String(node.type)+"'",node.start,node.end);
}

function parseExpression(source){source=String(source);if(source.length>LIMITS.expressionLength)throw new ComplexityError("Expression exceeds the "+LIMITS.expressionLength+" character safety limit");return new Parser(source).parse();}
function parseDefinition(raw){
  var fm=raw.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(([^()]*)\)\s*=\s*(.+)$/u);
  if(fm){
    var name=fm[1];validateUserIdentifier(name);var params=fm[2].trim()?fm[2].split(",").map(function(p){return p.trim();}):[];
    if(!params.length)throw new DomainError("User-defined functions require at least one parameter");
    var seen=new Set();params.forEach(function(p){if(!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(p)||DANGEROUS_IDENTIFIERS.has(p)||hasOwn(CONSTANT_REGISTRY,p)||BUILTIN_NAMES.has(p)||p==="ans")throw new InvalidIdentifierError(p);if(seen.has(p))throw new DomainError("Duplicate function parameter '"+p+"'");seen.add(p);});
    return {type:"function",name:name,params:params,body:fm[3]};
  }
  var am=raw.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(?!=)(.+)$/u);if(am){validateUserIdentifier(am[1]);return {type:"assignment",name:am[1],body:am[2]};}
  return null;
}
function makeResult(value,ast,source,options,extra){
  var exact=isExactValue(value),kind=numericKind(value),result={value:value,display:formatValue(value,options.precision),approx:approxString(value,options.precision),exact:exact,kind:kind,ast:ast,metadata:{source:String(source),normalizedSource:normalizeInput(source),numericKind:kind,exact:exact,angleMode:options.angle||"RAD",precision:options.precision||12}};
  if(extra)Object.assign(result,extra);return result;
}
function evaluate(source,env,options){
  env=env||{};options=options||{};var raw=String(source).trim();if(!raw)throw new ParseError("Enter an expression",0,0);var def=parseDefinition(raw);
  if(def&&def.type==="function"){
    var fast=parseExpression(def.body),fn={__function:true,name:def.name,params:def.params.slice(),ast:fast,source:def.body};if(options.commit!==false)defineEnvValue(env,def.name,fn);
    return {value:fn,display:def.name+"("+def.params.join(", ")+") = "+def.body,approx:"",exact:true,kind:"function",ast:fast,assignment:def.name,functionDefinition:true,metadata:{source:raw,normalizedSource:normalizeInput(raw),numericKind:"function",exact:true,angleMode:options.angle||"RAD",precision:options.precision||12}};
  }
  if(def&&def.type==="assignment"){
    var aast=parseExpression(def.body),av=evalAst(aast,env,options,0);if(options.commit!==false)defineEnvValue(env,def.name,av);
    var ar=makeResult(av,aast,raw,options,{assignment:def.name});ar.display=def.name+" = "+formatValue(av,options.precision);return ar;
  }
  var ast=parseExpression(raw),value=evalAst(ast,env,options,0);return makeResult(value,ast,raw,options);
}
function evaluateNumber(source,env,options){var r=evaluate(source,env,Object.assign({},options,{commit:false})),n=toNumber(r.value);if(!Number.isFinite(n))throw new NonFiniteError("Expression is not a finite real number");return n;}

function cloneMatrix(A){return A.map(function(r){return r.slice();});}
function validateMatrix(A){if(!Array.isArray(A))throw new ShapeError("Matrix must be an array of rows");var width=A.length&&Array.isArray(A[0])?A[0].length:0;for(var i=0;i<A.length;i++)if(!Array.isArray(A[i])||A[i].length!==width)throw new ShapeError("Matrix rows must all have the same length");return [A.length,width];}
function parseMatrixString(s){var rows=String(s).trim().split(/\n+/).map(function(row){return row.trim();}).filter(Boolean);return rows.map(function(row){return row.split(/[\t, ]+/).filter(Boolean);});}
function matrixFromStrings(rows,env,options){
  if(!rows.length)throw new ShapeError("Matrix is empty");var width=rows[0].length;if(!width)throw new ShapeError("Matrix is empty");
  return rows.map(function(row,r){if(row.length!==width)throw new ShapeError("Row "+(r+1)+" has "+row.length+" entries; expected "+width);return row.map(function(cell){var val=evaluate(String(cell),env||{},Object.assign({},options,{commit:false})).value;if(!(val instanceof Rational)&&!(val instanceof Complex)&&typeof val!=="number")throw new DomainError("Matrix cells must evaluate to scalar numbers");return val;});});
}
function transpose(A){var sh=validateMatrix(A),m=sh[0],n=sh[1],R=Array.from({length:n},function(){return Array(m);});for(var i=0;i<m;i++)for(var j=0;j<n;j++)R[j][i]=A[i][j];return R;}
function matMul(A,B){var sa=validateMatrix(A),sb=validateMatrix(B);if(sa[1]!==sb[0])throw new ShapeError("Matrix inner dimensions do not match");var R=Array.from({length:sa[0]},function(){return Array(sb[1]);});for(var i=0;i<sa[0];i++)for(var j=0;j<sb[1];j++){var s=new Rational(0n);for(var k=0;k<sa[1];k++)s=add(s,mul(A[i][k],B[k][j]));R[i][j]=s;}return R;}
function rref(A){
  validateMatrix(A);var R=cloneMatrix(A),rows=R.length,cols=rows?R[0].length:0,lead=0,pivots=[];
  for(var r=0;r<rows&&lead<cols;r++){
    var i=r;while(i<rows&&isZero(R[i][lead]))i++;if(i===rows){lead++;r--;continue;}
    if(i!==r){var tmp=R[i];R[i]=R[r];R[r]=tmp;}var lv=R[r][lead];for(var j=0;j<cols;j++)R[r][j]=div(R[r][j],lv);
    for(var k=0;k<rows;k++)if(k!==r&&!isZero(R[k][lead])){var f=R[k][lead];for(var c=0;c<cols;c++)R[k][c]=sub(R[k][c],mul(f,R[r][c]));}
    pivots.push(lead);lead++;
  }
  return {matrix:R,pivots:pivots};
}
function determinant(A){
  var sh=validateMatrix(A),n=sh[0];if(n!==sh[1])throw new ShapeError("Determinant requires a square matrix");if(n===0)return new Rational(1n);
  var R=cloneMatrix(A),sign=1,det=new Rational(1n);
  for(var c=0;c<n;c++){
    var p=c;while(p<n&&isZero(R[p][c]))p++;if(p===n)return new Rational(0n);if(p!==c){var t=R[p];R[p]=R[c];R[c]=t;sign*=-1;}
    var pivot=R[c][c];det=mul(det,pivot);for(var r=c+1;r<n;r++){if(isZero(R[r][c]))continue;var f=div(R[r][c],pivot);for(var j=c+1;j<n;j++)R[r][j]=sub(R[r][j],mul(f,R[c][j]));R[r][c]=new Rational(0n);}
  }
  return sign<0?neg(det):det;
}
function inverse(A){
  var sh=validateMatrix(A),n=sh[0];if(n!==sh[1])throw new ShapeError("Inverse requires a square matrix");
  var aug=A.map(function(row,i){return row.concat(Array.from({length:n},function(_,j){return new Rational(i===j?1n:0n);}));}),rr=rref(aug).matrix;
  for(var i=0;i<n;i++)for(var j=0;j<n;j++){var expected=i===j?1:0;if(Math.abs(toNumber(rr[i][j])-expected)>1e-10)throw new DomainError("Matrix is singular");}
  return rr.map(function(row){return row.slice(n);});
}
function rank(A){return rref(A).pivots.length;}
function matrixToStrings(A,precision){validateMatrix(A);return A.map(function(row){return row.map(function(v){return formatValue(v,precision);});});}

function sumNums(a){var s=0,c=0;for(var i=0;i<a.length;i++){var y=a[i]-c,t=s+y;c=(t-s)-y;s=t;}return s;}
function stats(values){
  var x=values.map(Number).filter(Number.isFinite),n=x.length;if(!n)throw new DomainError("No numeric values");var mean=sumNums(x)/n,m2=0;
  for(var i=0;i<n;i++){var d=x[i]-mean;m2+=d*d;}var sorted=x.slice().sort(function(a,b){return a-b;}),med=n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
  return {count:n,sum:sumNums(x),mean:mean,median:med,min:sorted[0],max:sorted[n-1],variancePopulation:m2/n,varianceSample:n>1?m2/(n-1):NaN,sdPopulation:Math.sqrt(m2/n),sdSample:n>1?Math.sqrt(m2/(n-1)):NaN};
}
function covariance(x,y,sample){
  if(x.length!==y.length)throw new ShapeError("Paired columns must have the same length");var pairs=[];for(var i=0;i<x.length;i++){var a=Number(x[i]),b=Number(y[i]);if(Number.isFinite(a)&&Number.isFinite(b))pairs.push([a,b]);}
  var n=pairs.length;if(n<(sample?2:1))throw new DomainError("Not enough paired observations");var mx=sumNums(pairs.map(function(p){return p[0];}))/n,my=sumNums(pairs.map(function(p){return p[1];}))/n,s=0;
  for(var j=0;j<n;j++)s+=(pairs[j][0]-mx)*(pairs[j][1]-my);return s/(sample?n-1:n);
}
function correlation(x,y){
  var pairs=[];for(var i=0;i<Math.min(x.length,y.length);i++){var a=Number(x[i]),b=Number(y[i]);if(Number.isFinite(a)&&Number.isFinite(b))pairs.push([a,b]);}
  if(pairs.length<2)throw new DomainError("Not enough paired observations");var xs=pairs.map(function(p){return p[0];}),ys=pairs.map(function(p){return p[1];}),sx=stats(xs).sdSample,sy=stats(ys).sdSample;
  if(sx===0||sy===0)throw new DomainError("Correlation is undefined for a constant column");var cr=covariance(xs,ys,true)/(sx*sy);return Math.max(-1,Math.min(1,cr));
}
function linearRegression(x,y){
  var pairs=[];for(var i=0;i<Math.min(x.length,y.length);i++){var a=Number(x[i]),b=Number(y[i]);if(Number.isFinite(a)&&Number.isFinite(b))pairs.push([a,b]);}
  if(pairs.length<2)throw new DomainError("Need at least two paired observations");var xs=pairs.map(function(p){return p[0];}),ys=pairs.map(function(p){return p[1];}),mx=stats(xs).mean,my=stats(ys).mean,sxx=0,sxy=0;
  for(var j=0;j<xs.length;j++){sxx+=(xs[j]-mx)*(xs[j]-mx);sxy+=(xs[j]-mx)*(ys[j]-my);}if(sxx===0)throw new DomainError("Regression requires variation in x");
  var slope=sxy/sxx,intercept=my-slope*mx,sse=0,sst=0;for(var k=0;k<xs.length;k++){var fit=intercept+slope*xs[k];sse+=(ys[k]-fit)*(ys[k]-fit);sst+=(ys[k]-my)*(ys[k]-my);}
  return {n:xs.length,slope:slope,intercept:intercept,r2:sst===0?1:1-sse/sst,correlation:correlation(xs,ys)};
}
function parseDelimited(text){
  text=String(text).replace(/\r\n?/g,"\n").trim();if(!text)return {headers:[],rows:[]};var firstLine=text.split("\n")[0],delim=text.indexOf("\t")>=0?"\t":(firstLine.split(";").length>firstLine.split(",").length?";":",");
  var rows=[],row=[],field="",quoted=false;
  for(var i=0;i<text.length;i++){var c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else{if(c==='"')quoted=true;else if(c===delim){row.push(field.trim());field="";}else if(c==="\n"){row.push(field.trim());rows.push(row);row=[];field="";}else field+=c;}}
  if(quoted)throw new ParseError("Unterminated quoted field in delimited data");row.push(field.trim());rows.push(row);
  if(rows.length&&rows[0].length===1&&/\s+/.test(rows[0][0])){rows=text.split("\n").map(function(r){return r.trim().split(/\s+/);});delim=" ";}
  rows=rows.filter(function(r){return r.some(function(v){return v!=="";});});var width=rows.length?Math.max.apply(null,rows.map(function(r){return r.length;})):0,first=rows[0]||[],numericFirst=first.every(function(v){return v===""||Number.isFinite(Number(v.replace(",",".")));});
  var headers=numericFirst?Array.from({length:width},function(_,i){return "Column "+(i+1);}):first.map(function(v,i){return v||"Column "+(i+1);});return {headers:headers,rows:numericFirst?rows:rows.slice(1),delimiter:delim};
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
  value=Number(value);if(!Number.isFinite(value))throw new DomainError("Conversion value must be finite");
  if(group==="temperature"){var k;if(from==="C")k=value+273.15;else if(from==="F")k=(value-32)*5/9+273.15;else if(from==="K")k=value;else throw new DomainError("Unknown temperature unit");if(to==="C")return k-273.15;if(to==="F")return (k-273.15)*9/5+32;if(to==="K")return k;throw new DomainError("Unknown temperature unit");}
  var g=UNIT_GROUPS[group];if(!g||g[from]===undefined||g[to]===undefined)throw new DomainError("Incompatible or unknown units");return ensureFinite(value*g[from]/g[to]);
}
function loan(principal,annualRate,years,paymentsPerYear){
  principal=Number(principal);annualRate=Number(annualRate);years=Number(years);paymentsPerYear=Number(paymentsPerYear||12);
  if(!(principal>=0)||!(years>0)||!(paymentsPerYear>0)||!Number.isFinite(annualRate))throw new DomainError("Enter a valid principal, term and payment frequency");
  var n=Math.round(years*paymentsPerYear),i=annualRate/paymentsPerYear,payment;if(n>100000)throw new ComplexityError("Payment schedule exceeds the safety limit");
  if(Math.abs(i)<1e-15)payment=principal/n;else payment=principal*i/(1-Math.pow(1+i,-n));if(!Number.isFinite(payment))throw new NonFiniteError("Loan payment could not be represented");
  var balance=principal,totalInterest=0,schedule=[];
  for(var p=1;p<=n;p++){var interest=balance*i,principalPaid=payment-interest,currentPayment=payment;if(p===n||principalPaid>balance){principalPaid=balance;currentPayment=principalPaid+interest;}balance=Math.max(0,balance-principalPaid);totalInterest+=interest;schedule.push({period:p,payment:currentPayment,interest:interest,principal:principalPaid,balance:balance});}
  return {payment:schedule[0]?schedule[0].payment:0,totalInterest:totalInterest,totalPaid:principal+totalInterest,schedule:schedule};
}
function triangleSSS(a,b,c){
  a=Number(a);b=Number(b);c=Number(c);if(!(a>0&&b>0&&c>0)||a+b<=c||a+c<=b||b+c<=a)throw new DomainError("These sides cannot form a triangle");
  function acosd(x){return Math.acos(Math.max(-1,Math.min(1,x)))*180/Math.PI;}var A=acosd((b*b+c*c-a*a)/(2*b*c)),B=acosd((a*a+c*c-b*b)/(2*a*c)),C=180-A-B,s=(a+b+c)/2,area=Math.sqrt(s*(s-a)*(s-b)*(s-c));
  return {a:a,b:b,c:c,A:A,B:B,C:C,perimeter:a+b+c,area:area};
}
function dateDiffDays(a,b){
  var pa=String(a).split("-").map(Number),pb=String(b).split("-").map(Number);if(pa.length!==3||pb.length!==3)throw new DomainError("Use YYYY-MM-DD dates");
  var da=Date.UTC(pa[0],pa[1]-1,pa[2]),db=Date.UTC(pb[0],pb[1]-1,pb[2]),ca=new Date(da),cb=new Date(db);
  if(ca.getUTCFullYear()!==pa[0]||ca.getUTCMonth()!==pa[1]-1||ca.getUTCDate()!==pa[2]||cb.getUTCFullYear()!==pb[0]||cb.getUTCMonth()!==pb[1]-1||cb.getUTCDate()!==pb[2])throw new DomainError("Invalid calendar date");return Math.round((db-da)/86400000);
}
function parseBigIntBase(text,base){
  text=String(text).trim().replace(/_/g,"");base=Number(base);if(!Number.isInteger(base)||base<2||base>36)throw new DomainError("Base must be between 2 and 36");
  var negative=false;if(text[0]==="-"){negative=true;text=text.slice(1);}if(!text)throw new ParseError("Enter an integer");var digits="0123456789abcdefghijklmnopqrstuvwxyz",v=0n,b=BigInt(base);
  for(var i=0;i<text.length;i++){var d=digits.indexOf(text[i].toLowerCase());if(d<0||d>=base)throw new ParseError("Invalid digit '"+text[i]+"' for base "+base,i,i+1);v=v*b+BigInt(d);}return negative?-v:v;
}
function bitInterpret(value,width,signed){width=Number(width);if(!Number.isInteger(width)||width<1||width>4096)throw new DomainError("Invalid bit width");var mod=1n<<BigInt(width),raw=((BigInt(value)%mod)+mod)%mod;if(signed&&raw>=(1n<<BigInt(width-1)))return raw-mod;return raw;}
function formatBase(value,base,width){base=Number(base);if(!Number.isInteger(base)||base<2||base>36)throw new DomainError("Base must be between 2 and 36");value=BigInt(value);var s=value.toString(base).toUpperCase();if(base===2&&width)s=s.padStart(Number(width),"0");return s;}

global.CalcMath={
  VERSION:"1.1.0-kernel",LIMITS:LIMITS,
  CalcError:CalcError,ParseError:ParseError,DomainError:DomainError,DivisionByZeroError:DivisionByZeroError,UnknownIdentifierError:UnknownIdentifierError,ArityError:ArityError,ComplexityError:ComplexityError,NonFiniteError:NonFiniteError,ShapeError:ShapeError,InvalidIdentifierError:InvalidIdentifierError,
  Rational:Rational,Complex:Complex,CONSTANT_REGISTRY:CONSTANT_REGISTRY,FUNCTION_REGISTRY:FUNCTION_REGISTRY,
  parseExpression:parseExpression,evaluate:evaluate,evaluateAst:evalAst,evaluateNumber:evaluateNumber,
  formatValue:formatValue,formatNumber:formatNumber,approxString:approxString,toNumber:toNumber,numericKind:numericKind,isExactValue:isExactValue,
  serializeValue:serializeValue,deserializeValue:deserializeValue,serializeAst:serializeAst,deserializeAst:deserializeAst,normalizeInput:normalizeInput,
  add:add,sub:sub,mul:mul,div:div,power:power,neg:neg,isZero:isZero,sqrtValue:sqrtValue,
  matrixFromStrings:matrixFromStrings,parseMatrixString:parseMatrixString,transpose:transpose,determinant:determinant,inverse:inverse,rref:rref,rank:rank,matrixToStrings:matrixToStrings,matMul:matMul,
  stats:stats,covariance:covariance,correlation:correlation,linearRegression:linearRegression,parseDelimited:parseDelimited,
  UNIT_GROUPS:UNIT_GROUPS,convertUnit:convertUnit,loan:loan,triangleSSS:triangleSSS,dateDiffDays:dateDiffDays,
  gcdBig:gcdBig,lcmBig:lcmBig,factorialBig:factorialBig,parseBigIntBase:parseBigIntBase,bitInterpret:bitInterpret,formatBase:formatBase
};
})(window);