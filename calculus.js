(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
if(!M||!A)throw new Error("CalcMath and CalcAlgebra must load before CalcCalculus");

class CalculusError extends M.CalcError{
  constructor(code,message,details){super(code||"CALCULUS_ERROR",message,undefined,undefined,details);}
}
class UnsupportedDerivativeError extends CalculusError{constructor(message,details){super("UNSUPPORTED_DERIVATIVE",message,details);}}
class UnsupportedIntegralError extends CalculusError{constructor(message,details){super("UNSUPPORTED_INTEGRAL",message,details);}}
class UnsupportedLimitError extends CalculusError{constructor(message,details){super("UNSUPPORTED_LIMIT",message,details);}}
class LimitDoesNotExistError extends CalculusError{constructor(message,details){super("LIMIT_DOES_NOT_EXIST",message||"The limit does not exist",details);}}
class ConvergenceError extends CalculusError{constructor(message,details){super("CONVERGENCE_FAILURE",message||"Numerical method did not converge",details);}}
class InvalidBracketError extends CalculusError{constructor(message,details){super("INVALID_BRACKET",message||"The interval does not bracket a root",details);}}
class NonFiniteEvaluationError extends CalculusError{constructor(message,details){super("NON_FINITE_EVALUATION",message||"Function evaluation was not finite",details);}}
class SingularityError extends CalculusError{constructor(message,details){super("SINGULARITY_DETECTED",message||"A singularity was detected",details);}}
class CancelledError extends CalculusError{constructor(){super("CANCELLED","Calculation cancelled");}}

const DEFAULT_NUMERICAL=Object.freeze({
  absTol:1e-10,
  relTol:1e-10,
  maxIterations:100,
  maxDepth:20,
  maxEvaluations:100000
});

function rat(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function lit(v){return {type:"literal",value:v,start:0,end:0};}
function id(name){return {type:"identifier",name:name,start:0,end:0};}
function unary(op,arg){return {type:"unary",op:op,arg:arg,start:0,end:0};}
function bin(op,left,right){return {type:"binary",op:op,left:left,right:right,implicit:false,start:0,end:0};}
function call(name,args){return {type:"call",name:name,args:args,start:0,end:0};}
function cloneAst(ast){return M.deserializeAst(M.serializeAst(ast));}
function simplifyAst(ast){return A.simplifyAst(ast);}
function isRatLiteral(n){return n&&n.type==="literal"&&n.value instanceof M.Rational;}
function variables(ast){return Array.from(A.collectVariables(ast));}
function requireVariable(ast,preferred){
  if(preferred)return String(preferred).trim();
  var vars=variables(ast);
  if(vars.length===1)return vars[0];
  if(vars.length===0)return "x";
  throw new CalculusError("VARIABLE_REQUIRED","Specify the differentiation/integration variable",{variables:vars});
}
function ensureOnlyVariable(ast,variable){
  var others=variables(ast).filter(function(v){return v!==variable;});
  if(others.length)throw new UnsupportedIntegralError("Integration currently treats only numeric constants as constants; additional symbolic parameters are unsupported",{variables:others});
}
function dependsOn(ast,variable){return A.collectVariables(ast).has(variable);}

function derivativeAst(ast,variable){
  if(!ast)throw new UnsupportedDerivativeError("Missing expression");
  if(ast.type==="literal")return lit(rat(0));
  if(ast.type==="identifier")return lit(rat(ast.name===variable?1:0));
  if(ast.type==="unary"){
    var du=derivativeAst(ast.arg,variable);
    return ast.op==="-"?simplifyAst(unary("-",du)):du;
  }
  if(ast.type==="postfix"){
    if(ast.op==="%")return simplifyAst(bin("/",derivativeAst(ast.arg,variable),lit(rat(100))));
    throw new UnsupportedDerivativeError("Derivative of postfix '"+ast.op+"' is not supported");
  }
  if(ast.type==="binary"){
    var u=ast.left,v=ast.right,du2,dv2;
    if(ast.op==="+")return simplifyAst(bin("+",derivativeAst(u,variable),derivativeAst(v,variable)));
    if(ast.op==="-")return simplifyAst(bin("-",derivativeAst(u,variable),derivativeAst(v,variable)));
    if(ast.op==="*"){
      du2=derivativeAst(u,variable);dv2=derivativeAst(v,variable);
      return simplifyAst(bin("+",bin("*",du2,cloneAst(v)),bin("*",cloneAst(u),dv2)));
    }
    if(ast.op==="/"){
      du2=derivativeAst(u,variable);dv2=derivativeAst(v,variable);
      return simplifyAst(bin("/",bin("-",bin("*",du2,cloneAst(v)),bin("*",cloneAst(u),dv2)),bin("^",cloneAst(v),lit(rat(2)))));
    }
    if(ast.op==="^"){
      if(!dependsOn(v,variable)){
        if(isRatLiteral(v)){
          var n=v.value;
          return simplifyAst(bin("*",bin("*",lit(n),bin("^",cloneAst(u),lit(n.sub(rat(1))))),derivativeAst(u,variable)));
        }
        return simplifyAst(bin("*",bin("*",cloneAst(v),bin("^",cloneAst(u),bin("-",cloneAst(v),lit(rat(1))))),derivativeAst(u,variable)));
      }
      if(!dependsOn(u,variable)){
        return simplifyAst(bin("*",bin("*",bin("^",cloneAst(u),cloneAst(v)),call("ln",[cloneAst(u)])),derivativeAst(v,variable)));
      }
      du2=derivativeAst(u,variable);dv2=derivativeAst(v,variable);
      return simplifyAst(bin("*",bin("^",cloneAst(u),cloneAst(v)),bin("+",bin("*",dv2,call("ln",[cloneAst(u)])),bin("*",cloneAst(v),bin("/",du2,cloneAst(u))))));
    }
  }
  if(ast.type==="call"){
    if(ast.args.length<1)throw new UnsupportedDerivativeError("Function '"+ast.name+"' has no differentiable argument");
    var z=ast.args[0],dz=derivativeAst(z,variable),name=ast.name;
    if(name==="sin")return simplifyAst(bin("*",call("cos",[cloneAst(z)]),dz));
    if(name==="cos")return simplifyAst(bin("*",unary("-",call("sin",[cloneAst(z)])),dz));
    if(name==="tan")return simplifyAst(bin("*",bin("/",lit(rat(1)),bin("^",call("cos",[cloneAst(z)]),lit(rat(2)))),dz));
    if(name==="exp")return simplifyAst(bin("*",call("exp",[cloneAst(z)]),dz));
    if(name==="ln")return simplifyAst(bin("/",dz,cloneAst(z)));
    if(name==="log10")return simplifyAst(bin("/",dz,bin("*",cloneAst(z),call("ln",[lit(rat(10))]))));
    if(name==="log"){
      if(ast.args.length===1)return simplifyAst(bin("/",dz,bin("*",cloneAst(z),call("ln",[lit(rat(10))]))));
      if(ast.args.length===2&&!dependsOn(ast.args[1],variable))return simplifyAst(bin("/",dz,bin("*",cloneAst(z),call("ln",[cloneAst(ast.args[1])]))));
      throw new UnsupportedDerivativeError("Derivative of log with variable base is not supported");
    }
    if(name==="sqrt")return simplifyAst(bin("/",dz,bin("*",lit(rat(2)),call("sqrt",[cloneAst(z)]))));
    if(name==="sinh")return simplifyAst(bin("*",call("cosh",[cloneAst(z)]),dz));
    if(name==="cosh")return simplifyAst(bin("*",call("sinh",[cloneAst(z)]),dz));
    if(name==="tanh")return simplifyAst(bin("*",bin("/",lit(rat(1)),bin("^",call("cosh",[cloneAst(z)]),lit(rat(2)))),dz));
    if(name==="asin")return simplifyAst(bin("/",dz,call("sqrt",[bin("-",lit(rat(1)),bin("^",cloneAst(z),lit(rat(2))))])));
    if(name==="acos")return simplifyAst(unary("-",bin("/",dz,call("sqrt",[bin("-",lit(rat(1)),bin("^",cloneAst(z),lit(rat(2))))]))));
    if(name==="atan")return simplifyAst(bin("/",dz,bin("+",lit(rat(1)),bin("^",cloneAst(z),lit(rat(2))))));
    if(name==="abs")return simplifyAst(bin("*",call("sign",[cloneAst(z)]),dz));
    throw new UnsupportedDerivativeError("Derivative rule for '"+name+"' is not implemented",{function:name});
  }
  throw new UnsupportedDerivativeError("Unsupported expression node '"+String(ast.type)+"'");
}

function differentiate(sourceOrExpr,variable,order){
  var expr=sourceOrExpr instanceof A.SymbolicExpression?sourceOrExpr:new A.SymbolicExpression(sourceOrExpr);
  variable=requireVariable(expr.ast,variable);order=order===undefined?1:Number(order);
  if(!Number.isInteger(order)||order<0||order>20)throw new CalculusError("INVALID_ORDER","Derivative order must be an integer from 0 to 20");
  var ast=cloneAst(expr.ast),restrictions=expr.restrictions.slice();
  for(var i=0;i<order;i++){
    ast=derivativeAst(ast,variable);
    try{
      if(A.collectVariables(ast).size<=1)ast=new A.SymbolicExpression(ast,{restrictions:restrictions}).simplify(variable).ast;
      else ast=simplifyAst(ast);
    }catch(e){ast=simplifyAst(ast);}
  }
  if(order>0)restrictions=restrictions.concat(A.collectRestrictions(ast,{realDomain:true}));
  return new A.SymbolicExpression(ast,{restrictions:restrictions});
}
function partialDerivative(sourceOrExpr,variable,order){return differentiate(sourceOrExpr,variable,order||1);}
function gradient(source,vars){
  var expr=source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source);
  vars=vars&&vars.length?vars:Array.from(A.collectVariables(expr.ast)).sort();
  return vars.map(function(v){return differentiate(expr,v,1);});
}
function jacobian(expressions,vars){
  var exprs=expressions.map(function(e){return e instanceof A.SymbolicExpression?e:new A.SymbolicExpression(e);});
  if(!vars||!vars.length){
    var set=new Set();exprs.forEach(function(e){A.collectVariables(e.ast).forEach(function(v){set.add(v);});});vars=Array.from(set).sort();
  }
  return exprs.map(function(e){return vars.map(function(v){return differentiate(e,v,1);});});
}
function hessian(source,vars){
  var expr=source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source);
  vars=vars&&vars.length?vars:Array.from(A.collectVariables(expr.ast)).sort();
  return vars.map(function(v1){return vars.map(function(v2){return differentiate(differentiate(expr,v1,1),v2,1);});});
}

function linearInner(ast,variable){
  try{
    var p=A.Polynomial.fromAst(ast,variable);
    if(p.degree<=1&&!p.get(1).isZero())return {a:p.get(1),b:p.get(0)};
  }catch(e){}
  return null;
}
function integratePolynomial(p){
  var out=new A.Polynomial(p.variable);
  p.coefficients.forEach(function(c,d){out.set(d+1,c.div(rat(d+1)));});
  return out.toAst();
}
function integrateAst(ast,variable){
  ast=simplifyAst(ast);
  try{
    var p=A.Polynomial.fromAst(ast,variable);
    return integratePolynomial(p);
  }catch(e){if(!(e instanceof A.UnsupportedSymbolicError))throw e;}

  if(!dependsOn(ast,variable))return simplifyAst(bin("*",cloneAst(ast),id(variable)));

  if(ast.type==="unary"){
    if(ast.op==="-")return simplifyAst(unary("-",integrateAst(ast.arg,variable)));
    if(ast.op==="+")return integrateAst(ast.arg,variable);
  }
  if(ast.type==="binary"){
    if(ast.op==="+")return simplifyAst(bin("+",integrateAst(ast.left,variable),integrateAst(ast.right,variable)));
    if(ast.op==="-")return simplifyAst(bin("-",integrateAst(ast.left,variable),integrateAst(ast.right,variable)));
    if(ast.op==="*"){
      if(!dependsOn(ast.left,variable))return simplifyAst(bin("*",cloneAst(ast.left),integrateAst(ast.right,variable)));
      if(!dependsOn(ast.right,variable))return simplifyAst(bin("*",cloneAst(ast.right),integrateAst(ast.left,variable)));
    }
    if(ast.op==="/"){
      if(!dependsOn(ast.left,variable)&&ast.left.type==="literal"){
        var lin=linearInner(ast.right,variable);
        if(lin)return simplifyAst(bin("*",bin("/",cloneAst(ast.left),lit(lin.a)),call("ln",[call("abs",[cloneAst(ast.right)])])));
      }
      if(ast.left.type==="literal"&&ast.left.value instanceof M.Rational&&ast.left.value.equals(rat(1))&&ast.right.type==="identifier"&&ast.right.name===variable){
        return call("ln",[call("abs",[id(variable)])]);
      }
    }
    if(ast.op==="^"&&isRatLiteral(ast.right)){
      var linpow=linearInner(ast.left,variable),n=ast.right.value;
      if(linpow){
        if(n.equals(rat(-1)))return simplifyAst(bin("/",call("ln",[call("abs",[cloneAst(ast.left)])]),lit(linpow.a)));
        var np1=n.add(rat(1));
        return simplifyAst(bin("/",bin("^",cloneAst(ast.left),lit(np1)),lit(linpow.a.mul(np1))));
      }
    }
  }
  if(ast.type==="call"&&ast.args.length>=1){
    var inner=ast.args[0],lin2=linearInner(inner,variable);
    if(lin2){
      if(ast.name==="sin")return simplifyAst(bin("/",unary("-",call("cos",[cloneAst(inner)])),lit(lin2.a)));
      if(ast.name==="cos")return simplifyAst(bin("/",call("sin",[cloneAst(inner)]),lit(lin2.a)));
      if(ast.name==="exp")return simplifyAst(bin("/",call("exp",[cloneAst(inner)]),lit(lin2.a)));
    }
    if(ast.name==="ln"&&inner.type==="identifier"&&inner.name===variable){
      return simplifyAst(bin("-",bin("*",id(variable),call("ln",[id(variable)])),id(variable)));
    }
  }
  throw new UnsupportedIntegralError("No certified antiderivative rule matches this expression",{expression:A.printAst(ast),variable:variable});
}

function evalAstAt(ast,variable,x,extraEnv){
  var env=Object.assign({},extraEnv||{});
  env[variable]=x instanceof M.Rational||x instanceof M.Complex?x:(Number.isInteger(x)&&Number.isSafeInteger(x)?rat(x):Number(x));
  return M.evaluateAst(ast,env,{complex:true,angle:"RAD"},0);
}
function numericalClose(a,b,absTol,relTol){
  var an=typeof a==="number"?a:M.toNumber(a),bn=typeof b==="number"?b:M.toNumber(b);
  if(!Number.isFinite(an)||!Number.isFinite(bn))return false;
  return Math.abs(an-bn)<=absTol+relTol*Math.max(Math.abs(an),Math.abs(bn),1);
}
function verifyAntiderivative(original,anti,variable){
  var d=differentiate(anti,variable,1),simpleOriginal;
  try{simpleOriginal=original instanceof A.SymbolicExpression?original.simplify(variable):new A.SymbolicExpression(original).simplify(variable);}catch(e){simpleOriginal=original instanceof A.SymbolicExpression?original:new A.SymbolicExpression(original);}
  if(d.toString()===simpleOriginal.toString())return {verified:true,method:"symbolic"};
  var points=[-3,-2,-1,-0.5,0.5,1,2,3],checked=0;
  for(var i=0;i<points.length;i++){
    try{
      var aa=evalAstAt(d.ast,variable,points[i]),bb=evalAstAt(simpleOriginal.ast,variable,points[i]);
      if(!numericalClose(aa,bb,1e-8,1e-8))return {verified:false,method:"numeric",point:points[i]};
      checked++;
    }catch(e){}
  }
  return {verified:checked>=3,method:"numeric",samples:checked};
}
class AntiderivativeResult{
  constructor(expression,variable,verification,method){this.expression=expression;this.variable=variable;this.verification=verification;this.method=method||"rule";}
  toString(){return this.expression.toString()+" + C";}
}
function integrate(sourceOrExpr,variable){
  var expr=sourceOrExpr instanceof A.SymbolicExpression?sourceOrExpr:new A.SymbolicExpression(sourceOrExpr);
  variable=requireVariable(expr.ast,variable);ensureOnlyVariable(expr.ast,variable);
  var ast=integrateAst(expr.ast,variable),anti=new A.SymbolicExpression(ast);
  var verification=verifyAntiderivative(expr,anti,variable);
  if(!verification.verified)throw new UnsupportedIntegralError("Candidate antiderivative could not be verified and was rejected",{candidate:anti.toString(),verification:verification});
  return new AntiderivativeResult(anti,variable,verification,"symbolic-rules");
}

class CancellationToken{
  constructor(){this.cancelled=false;}
  cancel(){this.cancelled=true;}
  throwIfCancelled(){if(this.cancelled)throw new CancelledError();}
}
class CompiledNumericFunction{
  constructor(sourceOrAst,variable,env){
    this.ast=typeof sourceOrAst==="string"?M.parseExpression(sourceOrAst):(sourceOrAst instanceof A.SymbolicExpression?cloneAst(sourceOrAst.ast):cloneAst(sourceOrAst));
    this.variable=variable||requireVariable(this.ast);this.env=Object.assign({},env||{});this.evaluations=0;
  }
  evaluate(x){
    var env=Object.assign({},this.env);env[this.variable]=Number(x);this.evaluations++;
    var value;
    try{value=M.evaluateAst(this.ast,env,{complex:false,angle:"RAD"},0);}catch(e){throw new NonFiniteEvaluationError("Function is not finite at x = "+M.formatNumber(Number(x),12),{x:Number(x),cause:e.code||e.message});}
    var n=M.toNumber(value);if(!Number.isFinite(n))throw new NonFiniteEvaluationError("Function is not finite at x = "+M.formatNumber(Number(x),12),{x:Number(x)});
    return n;
  }
}

function mergedOptions(options){return Object.assign({},DEFAULT_NUMERICAL,options||{});}
function checkToken(o){if(o.token&&typeof o.token.throwIfCancelled==="function")o.token.throwIfCancelled();}

function numericalDerivative(sourceOrFn,variable,x,options){
  var o=mergedOptions(options),fn=sourceOrFn instanceof CompiledNumericFunction?sourceOrFn:new CompiledNumericFunction(sourceOrFn,variable,o.env);
  x=Number(x);if(!Number.isFinite(x))throw new CalculusError("INVALID_POINT","Derivative point must be finite");
  checkToken(o);
  var scale=Math.max(1,Math.abs(x)),h=Math.cbrt(Number.EPSILON)*scale;
  if(o.step)h=Math.abs(Number(o.step));
  var d1=(fn.evaluate(x+h)-fn.evaluate(x-h))/(2*h),h2=h/2,d2=(fn.evaluate(x+h2)-fn.evaluate(x-h2))/(2*h2),improved=d2+(d2-d1)/3,error=Math.abs(improved-d2);
  return {value:improved,errorEstimate:error,method:"central-richardson",step:h2,evaluations:fn.evaluations};
}

function adaptiveSimpson(sourceOrFn,variable,a,b,options){
  var o=mergedOptions(options),fn=sourceOrFn instanceof CompiledNumericFunction?sourceOrFn:new CompiledNumericFunction(sourceOrFn,variable,o.env);
  a=Number(a);b=Number(b);if(!Number.isFinite(a)||!Number.isFinite(b))throw new UnsupportedIntegralError("Numerical integration currently requires finite bounds");
  if(a===b)return {value:0,errorEstimate:0,method:"adaptive-simpson",evaluations:0,converged:true};
  var sign=1;if(b<a){var t=a;a=b;b=t;sign=-1;}
  function safe(x){
    checkToken(o);if(fn.evaluations>=o.maxEvaluations)throw new ConvergenceError("Integration exceeded the evaluation limit",{evaluations:fn.evaluations});
    try{return fn.evaluate(x);}catch(e){if(e instanceof NonFiniteEvaluationError)throw new SingularityError("Non-finite integrand encountered near x = "+M.formatNumber(x,12),{x:x});throw e;}
  }
  function simp(x0,x1,f0,fm,f1){return (x1-x0)*(f0+4*fm+f1)/6;}
  var m=(a+b)/2,fa=safe(a),fm=safe(m),fb=safe(b),whole=simp(a,b,fa,fm,fb),errTotal=0;
  function recurse(x0,x1,f0,fmid,f1,S,depth){
    checkToken(o);var mid=(x0+x1)/2,lm=(x0+mid)/2,rm=(mid+x1)/2,fl=safe(lm),fr=safe(rm),L=simp(x0,mid,f0,fl,fmid),R=simp(mid,x1,fmid,fr,f1),delta=L+R-S,tol=o.absTol+o.relTol*Math.abs(L+R);
    if(depth<=0){errTotal+=Math.abs(delta)/15;return L+R+delta/15;}
    if(Math.abs(delta)<=15*tol){errTotal+=Math.abs(delta)/15;return L+R+delta/15;}
    return recurse(x0,mid,f0,fl,fmid,L,depth-1)+recurse(mid,x1,fmid,fr,f1,R,depth-1);
  }
  var value=recurse(a,b,fa,fm,fb,whole,o.maxDepth);
  return {value:sign*value,errorEstimate:errTotal,method:"adaptive-simpson",evaluations:fn.evaluations,converged:true};
}

function parseBound(source){
  var s=String(source).trim().toLowerCase();
  if(s==="inf"||s==="+inf"||s==="infinity"||s==="+infinity"||s==="∞")return {kind:"infinity",sign:1};
  if(s==="-inf"||s==="-infinity"||s==="-∞")return {kind:"infinity",sign:-1};
  var r=M.evaluate(String(source),{}, {commit:false,complex:false,angle:"RAD"}),n=M.toNumber(r.value);if(!Number.isFinite(n))throw new CalculusError("INVALID_BOUND","Bound must be a finite real value or ±inf");
  return {kind:"finite",value:r.value,number:n,exact:r.value instanceof M.Rational};
}
class DefiniteIntegralResult{
  constructor(value,exact,method,errorEstimate,meta){this.value=value;this.exact=!!exact;this.method=method;this.errorEstimate=errorEstimate||0;this.metadata=meta||{};}
  toString(){return this.exact?M.formatValue(this.value):"≈ "+M.formatNumber(Number(this.value),12);}
}
function definiteIntegral(source,variable,aSource,bSource,options){
  var expr=source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source),a=parseBound(aSource),b=parseBound(bSource);
  variable=requireVariable(expr.ast,variable);if(a.kind!=="finite"||b.kind!=="finite")throw new UnsupportedIntegralError("Improper integrals are not yet certified in the implementation phase");
  try{
    var anti=integrate(expr,variable),av=evalAstAt(anti.expression.ast,variable,a.value),bv=evalAstAt(anti.expression.ast,variable,b.value),value=M.sub(bv,av);
    return new DefiniteIntegralResult(value,M.isExactValue(value),"fundamental-theorem",0,{antiderivative:anti.expression.toString(),verified:anti.verification.verified});
  }catch(e){if(!(e instanceof UnsupportedIntegralError))throw e;}
  var num=adaptiveSimpson(expr.ast,variable,a.number,b.number,options);
  return new DefiniteIntegralResult(num.value,false,num.method,num.errorEstimate,{evaluations:num.evaluations});
}

function polynomialLimit(rf,target){
  var p=rf.numerator,q=rf.denominator;
  if(target.kind==="infinity"){
    var dp=p.degree,dq=q.degree;if(dp<dq)return {type:"finite",value:rat(0),exact:true,method:"rational-degree"};
    if(dp===dq)return {type:"finite",value:p.leading().div(q.leading()),exact:true,method:"rational-degree"};
    var diff=dp-dq,lead=p.leading().div(q.leading()),sgn=lead.n<0n?-1:1;if(target.sign<0&&diff%2===1)sgn*=-1;
    return {type:"infinite",sign:sgn,exact:true,method:"rational-degree"};
  }
  var x=target.value,pv=p.evaluate(x),qv=q.evaluate(x),steps=0;
  if(!qv.isZero())return {type:"finite",value:pv.div(qv),exact:true,method:"direct-rational"};
  while(qv.isZero()&&pv.isZero()&&steps<32&&p.degree>0&&q.degree>0){p=p.derivative();q=q.derivative();pv=p.evaluate(x);qv=q.evaluate(x);steps++;}
  if(!qv.isZero())return {type:"finite",value:pv.div(qv),exact:true,method:"polynomial-lhopital",steps:steps};
  return null;
}
function standardLimit(ast,variable,target){
  if(target.kind!=="finite"||!M.isZero(target.value))return null;
  var s=A.printAst(ast).replace(/\s+/g,"");
  if(s==="sin("+variable+")/"+variable)return {type:"finite",value:rat(1),exact:true,method:"standard-limit"};
  if(s==="(1-cos("+variable+"))/"+variable+"^2"||s==="(1-cos("+variable+"))/("+variable+"^2)")return {type:"finite",value:rat(1,2),exact:true,method:"standard-limit"};
  if(s==="(exp("+variable+")-1)/"+variable||s==="(exp("+variable+")-1)/("+variable+")")return {type:"finite",value:rat(1),exact:true,method:"standard-limit"};
  if(s==="ln(1+"+variable+")/"+variable||s==="ln("+variable+"+1)/"+variable)return {type:"finite",value:rat(1),exact:true,method:"standard-limit"};
  return null;
}
function sampleLimit(expr,variable,target,direction){
  if(target.kind!=="finite")throw new UnsupportedLimitError("Numerical infinite-limit fallback is not certified");
  var fn=new CompiledNumericFunction(expr.ast,variable),x0=target.number,dirs=direction==="left"?[-1]:direction==="right"?[1]:[-1,1],results=[];
  dirs.forEach(function(dir){
    var vals=[];for(var k=2;k<=9;k++){var h=Math.pow(10,-k)*Math.max(1,Math.abs(x0));try{vals.push(fn.evaluate(x0+dir*h));}catch(e){}}
    if(vals.length<4)throw new UnsupportedLimitError("Not enough finite samples to estimate the limit");
    var tail=vals.slice(-3),avg=tail.reduce(function(a,b){return a+b;},0)/tail.length,spread=Math.max.apply(null,tail)-Math.min.apply(null,tail);results.push({value:avg,spread:spread});
  });
  if(results.length===2&&!numericalClose(results[0].value,results[1].value,1e-6,1e-6))throw new LimitDoesNotExistError("Left- and right-hand limits disagree",{left:results[0].value,right:results[1].value});
  var val=results.reduce(function(a,b){return a+b.value;},0)/results.length,err=Math.max.apply(null,results.map(function(r){return r.spread;}));if(!Number.isFinite(val))throw new UnsupportedLimitError("Numerical limit estimate was not finite");
  return {type:"finite",value:val,exact:false,method:"numerical-sampling",errorEstimate:err};
}
class LimitResult{
  constructor(type,value,options){options=options||{};this.type=type;this.value=value;this.sign=options.sign;this.exact=!!options.exact;this.method=options.method||"unknown";this.direction=options.direction||"both";this.errorEstimate=options.errorEstimate||0;}
  toString(){if(this.type==="finite")return (this.exact?"":"≈ ")+M.formatValue(this.value);if(this.type==="infinite")return this.sign<0?"−∞":"∞";return "DNE";}
}
function limit(source,variable,targetSource,direction,options){
  var expr=source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source),target=parseBound(targetSource),dir=direction||"both";variable=requireVariable(expr.ast,variable);
  if(target.kind==="finite"){
    try{var direct=evalAstAt(expr.ast,variable,target.value);if(Number.isFinite(M.toNumber(direct)))return new LimitResult("finite",direct,{exact:M.isExactValue(direct),method:"direct",direction:dir});}catch(e){}
  }
  try{var rf=A.RationalFunction.fromAst(expr.ast,variable),pr=polynomialLimit(rf,target);if(pr)return new LimitResult(pr.type,pr.value,{sign:pr.sign,exact:pr.exact,method:pr.method,direction:dir});}catch(e){}
  var standard=standardLimit(expr.ast,variable,target);if(standard)return new LimitResult(standard.type,standard.value,{exact:standard.exact,method:standard.method,direction:dir});
  var sampled=sampleLimit(expr,variable,target,dir,options);return new LimitResult(sampled.type,sampled.value,{exact:false,method:sampled.method,direction:dir,errorEstimate:sampled.errorEstimate});
}

function taylor(source,variable,centerSource,order){
  var expr=source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source);variable=requireVariable(expr.ast,variable);order=Number(order);
  if(!Number.isInteger(order)||order<0||order>12)throw new CalculusError("INVALID_ORDER","Taylor order must be an integer from 0 to 12");
  var center=parseBound(centerSource);if(center.kind!=="finite")throw new CalculusError("INVALID_POINT","Taylor center must be finite");
  var current=expr,poly=lit(rat(0)),terms=[];
  for(var k=0;k<=order;k++){
    var val;try{val=evalAstAt(current.ast,variable,center.value);}catch(e){throw new UnsupportedDerivativeError("Taylor coefficient could not be evaluated at order "+k,{order:k,cause:e.code||e.message});}
    var coeff=M.div(val,new M.Rational(M.factorialBig(BigInt(k)))),term;
    if(k===0)term=lit(coeff);
    else{
      var shift=M.isZero(center.value)?id(variable):bin("-",id(variable),lit(center.value)),pow=k===1?shift:bin("^",shift,lit(rat(k)));
      term=M.isZero(coeff)?lit(rat(0)):(M.isExactValue(coeff)&&M.formatValue(coeff)==="1"?pow:bin("*",lit(coeff),pow));
    }
    terms.push({order:k,coefficient:coeff,derivative:current.toString()});poly=simplifyAst(bin("+",poly,term));if(k<order)current=differentiate(current,variable,1);
  }
  return {expression:new A.SymbolicExpression(poly),variable:variable,center:center.value,order:order,terms:terms,toString:function(){return this.expression.toString();}};
}

function residualConverged(fx,x,o){return Math.abs(fx)<=o.absTol+o.relTol*Math.max(1,Math.abs(x));}
function bisection(sourceOrFn,variable,a,b,options){
  var o=mergedOptions(options),fn=sourceOrFn instanceof CompiledNumericFunction?sourceOrFn:new CompiledNumericFunction(sourceOrFn,variable,o.env);a=Number(a);b=Number(b);
  if(!(Number.isFinite(a)&&Number.isFinite(b)&&a<b))throw new InvalidBracketError("Bisection requires finite a < b");
  var fa=fn.evaluate(a),fb=fn.evaluate(b);if(fa===0)return {root:a,residual:0,iterations:0,converged:true,method:"bisection",evaluations:fn.evaluations};if(fb===0)return {root:b,residual:0,iterations:0,converged:true,method:"bisection",evaluations:fn.evaluations};
  if(Math.sign(fa)===Math.sign(fb))throw new InvalidBracketError("Function values at the bracket endpoints have the same sign",{a:a,b:b,fa:fa,fb:fb});
  var mid=a,fm=fa;
  for(var i=1;i<=o.maxIterations;i++){checkToken(o);mid=(a+b)/2;fm=fn.evaluate(mid);if(residualConverged(fm,mid,o)||Math.abs(b-a)<=o.absTol+o.relTol*Math.max(1,Math.abs(mid)))return {root:mid,residual:Math.abs(fm),iterations:i,converged:true,method:"bisection",evaluations:fn.evaluations,bracket:[a,b]};if(Math.sign(fa)===Math.sign(fm)){a=mid;fa=fm;}else{b=mid;fb=fm;}}
  throw new ConvergenceError("Bisection reached the iteration limit",{root:mid,residual:Math.abs(fm),iterations:o.maxIterations});
}
function newton(sourceOrFn,variable,x0,options){
  var o=mergedOptions(options),fn=sourceOrFn instanceof CompiledNumericFunction?sourceOrFn:new CompiledNumericFunction(sourceOrFn,variable,o.env),x=Number(x0),deriv=null;
  if(!Number.isFinite(x))throw new CalculusError("INVALID_POINT","Newton initial value must be finite");
  if(!(sourceOrFn instanceof CompiledNumericFunction)){try{deriv=new CompiledNumericFunction(differentiate(sourceOrFn,variable,1).ast,variable,o.env);}catch(e){}}
  var fx=fn.evaluate(x);
  for(var i=0;i<o.maxIterations;i++){
    checkToken(o);if(residualConverged(fx,x,o))return {root:x,residual:Math.abs(fx),iterations:i,converged:true,method:"newton",evaluations:fn.evaluations+(deriv?deriv.evaluations:0)};
    var d=deriv?deriv.evaluate(x):numericalDerivative(fn,variable,x,o).value;if(!Number.isFinite(d)||Math.abs(d)<1e-14)throw new ConvergenceError("Newton derivative is zero or numerically unusable",{x:x,fx:fx,iteration:i});
    var next=x-fx/d;if(!Number.isFinite(next))throw new ConvergenceError("Newton step became non-finite",{x:x,iteration:i});
    if(Math.abs(next-x)<=o.absTol+o.relTol*Math.max(1,Math.abs(next))){x=next;fx=fn.evaluate(x);if(residualConverged(fx,x,o))return {root:x,residual:Math.abs(fx),iterations:i+1,converged:true,method:"newton",evaluations:fn.evaluations+(deriv?deriv.evaluations:0)};}
    x=next;fx=fn.evaluate(x);
  }
  throw new ConvergenceError("Newton method reached the iteration limit",{root:x,residual:Math.abs(fx),iterations:o.maxIterations});
}
function secant(sourceOrFn,variable,x0,x1,options){
  var o=mergedOptions(options),fn=sourceOrFn instanceof CompiledNumericFunction?sourceOrFn:new CompiledNumericFunction(sourceOrFn,variable,o.env),a=Number(x0),b=Number(x1),fa=fn.evaluate(a),fb=fn.evaluate(b);
  for(var i=1;i<=o.maxIterations;i++){checkToken(o);if(residualConverged(fb,b,o))return {root:b,residual:Math.abs(fb),iterations:i-1,converged:true,method:"secant",evaluations:fn.evaluations};var den=fb-fa;if(Math.abs(den)<1e-16)throw new ConvergenceError("Secant denominator became zero",{iteration:i,a:a,b:b});var c=b-fb*(b-a)/den;if(!Number.isFinite(c))throw new ConvergenceError("Secant step became non-finite",{iteration:i});a=b;fa=fb;b=c;fb=fn.evaluate(b);}
  throw new ConvergenceError("Secant method reached the iteration limit",{root:b,residual:Math.abs(fb),iterations:o.maxIterations});
}
function hybridRoot(sourceOrFn,variable,a,b,options){
  var o=mergedOptions(options),fn=sourceOrFn instanceof CompiledNumericFunction?sourceOrFn:new CompiledNumericFunction(sourceOrFn,variable,o.env),left=Number(a),right=Number(b);
  if(!(Number.isFinite(left)&&Number.isFinite(right)&&left<right))throw new InvalidBracketError("Hybrid root solve requires finite a < b");
  var fl=fn.evaluate(left),fr=fn.evaluate(right);if(fl===0)return {root:left,residual:0,iterations:0,converged:true,method:"hybrid-newton-bisection",evaluations:fn.evaluations,bracket:[left,right]};if(fr===0)return {root:right,residual:0,iterations:0,converged:true,method:"hybrid-newton-bisection",evaluations:fn.evaluations,bracket:[left,right]};
  if(Math.sign(fl)===Math.sign(fr))throw new InvalidBracketError("Function values at bracket endpoints have the same sign",{a:left,b:right,fa:fl,fb:fr});
  var derivative=null;if(!(sourceOrFn instanceof CompiledNumericFunction)){try{derivative=new CompiledNumericFunction(differentiate(sourceOrFn,variable,1).ast,variable,o.env);}catch(e){}}
  var x=(left+right)/2,fx=fn.evaluate(x);
  for(var i=1;i<=o.maxIterations;i++){
    checkToken(o);if(residualConverged(fx,x,o))return {root:x,residual:Math.abs(fx),iterations:i-1,converged:true,method:"hybrid-newton-bisection",evaluations:fn.evaluations+(derivative?derivative.evaluations:0),bracket:[left,right]};
    var d=derivative?derivative.evaluate(x):numericalDerivative(fn,variable,x,o).value,candidate=(left+right)/2;
    if(Number.isFinite(d)&&Math.abs(d)>1e-14){var nstep=x-fx/d;if(nstep>left&&nstep<right&&Number.isFinite(nstep))candidate=nstep;}
    var fc=fn.evaluate(candidate);if(Math.sign(fl)===Math.sign(fc)){left=candidate;fl=fc;}else{right=candidate;fr=fc;}x=candidate;fx=fc;
    if(Math.abs(right-left)<=o.absTol+o.relTol*Math.max(1,Math.abs(x))&&residualConverged(fx,x,o))return {root:x,residual:Math.abs(fx),iterations:i,converged:true,method:"hybrid-newton-bisection",evaluations:fn.evaluations+(derivative?derivative.evaluations:0),bracket:[left,right]};
  }
  throw new ConvergenceError("Hybrid root solver reached the iteration limit",{root:x,residual:Math.abs(fx),iterations:o.maxIterations});
}

function splitArgs(text){
  var out=[],depth=0,start=0;
  for(var i=0;i<text.length;i++){if(text[i]==="(")depth++;else if(text[i]===")")depth--;else if(text[i]===","&&depth===0){out.push(text.slice(start,i).trim());start=i+1;}}
  out.push(text.slice(start).trim());return out;
}
function commandResult(display,kind,details){
  details=details||{};return {value:details.value===undefined?null:details.value,display:display,approx:details.approx||"",exact:details.exact===undefined?false:details.exact,kind:kind||"calculus",symbolic:!!details.symbolic,metadata:Object.assign({numericKind:kind||"calculus",exact:!!details.exact},details.metadata||{})};
}
function parseDirection(s){s=(s||"both").trim().toLowerCase();if(s==="left"||s==="-")return "left";if(s==="right"||s==="+")return "right";return "both";}
function runCommand(raw,options){
  raw=String(raw).trim();options=options||{};
  var m=raw.match(/^(diff|partial|integrate|integral|limit|taylor|root|nderivative|nintegral)\s*\((.*)\)$/s);if(!m)return null;
  var cmd=m[1],args=splitArgs(m[2]);
  if(cmd==="diff"||cmd==="partial"){
    if(args.length<1||args.length>3)throw new CalculusError("ARITY_ERROR",cmd+" expects expression, variable, optional order");
    var d=differentiate(args[0],args[1]||undefined,args[2]===undefined?1:Number(args[2])),dd=d.toString();if(d.restrictions.length)dd+="   where "+d.restrictions.map(function(r){return r.toString();}).join(", ");
    return commandResult(dd,"symbolic-derivative",{value:d,exact:true,symbolic:true,metadata:{operation:cmd,variable:args[1]||null,order:args[2]||1,restrictions:d.restrictions.map(function(r){return r.toString();})}});
  }
  if(cmd==="integrate"){
    if(args.length<1||args.length>2)throw new CalculusError("ARITY_ERROR","integrate expects expression and optional variable");
    var anti=integrate(args[0],args[1]||undefined);return commandResult(anti.toString(),"antiderivative",{value:anti.expression,exact:true,symbolic:true,metadata:{operation:"integrate",variable:anti.variable,verified:anti.verification.verified,verificationMethod:anti.verification.method}});
  }
  if(cmd==="integral"){
    if(args.length!==4)throw new CalculusError("ARITY_ERROR","integral expects expression, variable, lower, upper");
    var di=definiteIntegral(args[0],args[1],args[2],args[3],options);
    return commandResult(di.toString(),"definite-integral",{value:di.value,exact:di.exact,symbolic:false,metadata:{operation:"integral",method:di.method,errorEstimate:di.errorEstimate}});
  }
  if(cmd==="nintegral"){
    if(args.length!==4)throw new CalculusError("ARITY_ERROR","nintegral expects expression, variable, lower, upper");
    var lo=parseBound(args[2]),hi=parseBound(args[3]);if(lo.kind!=="finite"||hi.kind!=="finite")throw new UnsupportedIntegralError("Numerical integration requires finite bounds");
    var ni=adaptiveSimpson(args[0],args[1],lo.number,hi.number,options),nid="≈ "+M.formatNumber(ni.value,12);
    return commandResult(nid,"numerical-integral",{value:ni.value,exact:false,symbolic:false,metadata:{operation:"nintegral",method:ni.method,errorEstimate:ni.errorEstimate,evaluations:ni.evaluations}});
  }
  if(cmd==="nderivative"){
    if(args.length!==3)throw new CalculusError("ARITY_ERROR","nderivative expects expression, variable, point");
    var pt=parseBound(args[2]);if(pt.kind!=="finite")throw new CalculusError("INVALID_POINT","Derivative point must be finite");
    var nd=numericalDerivative(args[0],args[1],pt.number,options);return commandResult("≈ "+M.formatNumber(nd.value,12),"numerical-derivative",{value:nd.value,exact:false,symbolic:false,metadata:{operation:"nderivative",method:nd.method,errorEstimate:nd.errorEstimate,evaluations:nd.evaluations}});
  }
  if(cmd==="limit"){
    if(args.length<3||args.length>4)throw new CalculusError("ARITY_ERROR","limit expects expression, variable, target, optional direction");
    var lr=limit(args[0],args[1],args[2],parseDirection(args[3]),options);return commandResult(lr.toString(),"limit",{value:lr.type==="finite"?lr.value:null,exact:lr.exact,symbolic:lr.type!=="finite"||!lr.exact,metadata:{operation:"limit",method:lr.method,direction:lr.direction,errorEstimate:lr.errorEstimate,type:lr.type}});
  }
  if(cmd==="taylor"){
    if(args.length!==4)throw new CalculusError("ARITY_ERROR","taylor expects expression, variable, center, order");
    var tr=taylor(args[0],args[1],args[2],args[3]);return commandResult(tr.toString(),"taylor-polynomial",{value:tr.expression,exact:false,symbolic:true,metadata:{operation:"taylor",variable:tr.variable,order:tr.order,center:M.formatValue(tr.center)}});
  }
  if(cmd==="root"){
    if(args.length!==4)throw new CalculusError("ARITY_ERROR","root expects expression, variable, lower, upper");
    var ba=parseBound(args[2]),bb=parseBound(args[3]);if(ba.kind!=="finite"||bb.kind!=="finite")throw new InvalidBracketError("Root bracket must be finite");
    var rr=hybridRoot(args[0],args[1],ba.number,bb.number,options);return commandResult("≈ "+M.formatNumber(rr.root,12),"numerical-root",{value:rr.root,exact:false,symbolic:false,metadata:{operation:"root",method:rr.method,residual:rr.residual,iterations:rr.iterations,evaluations:rr.evaluations}});
  }
  return null;
}

class NumericalWorkerClient{
  constructor(url){this.url=url||"./calculus-worker.js";this.worker=null;this.seq=0;this.pending=new Map();}
  ensure(){
    if(this.worker)return this.worker;if(typeof Worker==="undefined")throw new CalculusError("WORKER_UNAVAILABLE","Web Workers are unavailable in this environment");
    var self=this;this.worker=new Worker(this.url);this.worker.onmessage=function(e){var msg=e.data||{},p=self.pending.get(msg.id);if(!p)return;self.pending.delete(msg.id);if(msg.ok)p.resolve(msg.result);else p.reject(new CalculusError(msg.error&&msg.error.code||"WORKER_ERROR",msg.error&&msg.error.message||"Worker calculation failed",msg.error&&msg.error.details));};this.worker.onerror=function(e){self.pending.forEach(function(p){p.reject(new CalculusError("WORKER_ERROR",e.message||"Worker failed"));});self.pending.clear();};
    return this.worker;
  }
  run(task,payload){var w=this.ensure(),jid=++this.seq,self=this;return new Promise(function(resolve,reject){self.pending.set(jid,{resolve:resolve,reject:reject});w.postMessage({id:jid,task:task,payload:payload||{}});});}
  cancelAll(){if(this.worker){this.worker.terminate();this.worker=null;}this.pending.forEach(function(p){p.reject(new CancelledError());});this.pending.clear();}
}

global.CalcCalculus={
  VERSION:"1.0.0-calculus",
  DEFAULT_NUMERICAL:DEFAULT_NUMERICAL,
  CalculusError:CalculusError,UnsupportedDerivativeError:UnsupportedDerivativeError,UnsupportedIntegralError:UnsupportedIntegralError,UnsupportedLimitError:UnsupportedLimitError,LimitDoesNotExistError:LimitDoesNotExistError,ConvergenceError:ConvergenceError,InvalidBracketError:InvalidBracketError,NonFiniteEvaluationError:NonFiniteEvaluationError,SingularityError:SingularityError,CancelledError:CancelledError,
  AntiderivativeResult:AntiderivativeResult,DefiniteIntegralResult:DefiniteIntegralResult,LimitResult:LimitResult,CancellationToken:CancellationToken,CompiledNumericFunction:CompiledNumericFunction,NumericalWorkerClient:NumericalWorkerClient,
  derivativeAst:derivativeAst,differentiate:differentiate,partialDerivative:partialDerivative,gradient:gradient,jacobian:jacobian,hessian:hessian,
  integrate:integrate,definiteIntegral:definiteIntegral,verifyAntiderivative:verifyAntiderivative,
  numericalDerivative:numericalDerivative,adaptiveSimpson:adaptiveSimpson,
  limit:limit,taylor:taylor,
  bisection:bisection,newton:newton,secant:secant,hybridRoot:hybridRoot,
  runCommand:runCommand
};
})(window);