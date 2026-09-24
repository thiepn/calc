(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
const CAS=global.CalcCAS;
const MV=global.CalcMultivariable;
if(!M||!A||!C||!CAS||!MV)throw new Error("CalcMath, CalcAlgebra, CalcCalculus, CalcCAS, and CalcMultivariable must load before CalcODE");

class ODEError extends M.CalcError{
  constructor(code,message,details){super(code||"ODE_ERROR",message,undefined,undefined,details);}
}
class UnsupportedODEError extends ODEError{
  constructor(message,details){super("UNSUPPORTED_ODE",message,details);}
}
class ODEConvergenceError extends ODEError{
  constructor(message,details){super("ODE_CONVERGENCE",message||"ODE solver did not converge",details);}
}
class ODESingularityError extends ODEError{
  constructor(message,details){super("ODE_SINGULARITY",message||"ODE evaluation became non-finite",details);}
}

function rat(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function lit(v){return {type:"literal",value:v,start:0,end:0};}
function id(name){return {type:"identifier",name:name,start:0,end:0};}
function unary(op,arg){return {type:"unary",op:op,arg:arg,start:0,end:0};}
function bin(op,left,right){return {type:"binary",op:op,left:left,right:right,start:0,end:0};}
function call(name,args){return {type:"call",name:name,args:args,start:0,end:0};}
function cloneAst(ast){return M.deserializeAst(M.serializeAst(ast));}
function asExpr(source){return source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source);}
function simplify(ast){return A.simplifyAst(ast);}
function expr(ast){return new A.SymbolicExpression(simplify(ast));}
function zeroAst(ast){var s=simplify(ast);return s.type==="literal"&&M.isZero(s.value);}
function formatNumber(n,p){return M.formatNumber(Number(n),p||12);}
function commandResult(display,kind,details){
  details=details||{};
  return {
    value:details.value===undefined?null:details.value,
    display:String(display),
    approx:details.approx||"",
    exact:details.exact===undefined?true:!!details.exact,
    kind:kind||"ode",
    symbolic:details.symbolic===undefined?true:!!details.symbolic,
    metadata:Object.assign({numericKind:kind||"ode",exact:details.exact===undefined?true:!!details.exact,u3:true},details.metadata||{})
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
function parseCall(raw,name){
  var re=new RegExp("^"+name+"\\s*\\((.*)\\)$","s"),m=String(raw).trim().match(re);return m?m[1]:null;
}
function parseSemicolon(raw,name){
  var body=parseCall(raw,name);return body===null?null:splitTopLevel(body,";");
}
function requireVar(v,label){
  v=String(v||"").trim();
  if(!/^[A-Za-z_]\w*$/.test(v))throw new ODEError("INVALID_VARIABLE","Invalid "+(label||"variable")+" '"+v+"'");
  return v;
}
function parseVarList(s){
  var v=splitArgs(s);if(!v.length)throw new ODEError("VARIABLE_REQUIRED","At least one state variable is required");
  return v.map(function(x){return requireVar(x,"state variable");});
}
function substitute(sourceOrExpr,mapping){
  var e=asExpr(sourceOrExpr),parsed={};
  Object.keys(mapping||{}).forEach(function(k){
    var v=mapping[k];
    parsed[k]=v instanceof A.SymbolicExpression?cloneAst(v.ast):
      v&&v.type?cloneAst(v):
      typeof v==="string"?M.parseExpression(v):lit(v);
  });
  return new A.SymbolicExpression(simplify(A.substituteAst(e.ast,parsed)),{restrictions:e.restrictions});
}
function exactConstant(source){
  var e=asExpr(source);
  if(e.variables().length)throw new ODEError("CONSTANT_REQUIRED","Expected a constant expression",{source:String(source)});
  var v=M.evaluateAst(e.ast,{}, {complex:false,angle:"RAD"},0);
  if(v instanceof M.Complex)throw new ODEError("REAL_REQUIRED","Expected a real constant");
  return v;
}
function numberConstant(source){
  var v=exactConstant(source),n=M.toNumber(v);
  if(!Number.isFinite(n))throw new ODEError("FINITE_REQUIRED","Expected a finite constant");
  return n;
}
function exactSign(v){
  var n=M.toNumber(v);
  if(!Number.isFinite(n))throw new ODEError("FINITE_REQUIRED","Expected a finite real value");
  return n>0?1:n<0?-1:0;
}
function factorial(n){var f=1n;for(var i=2n;i<=BigInt(n);i++)f*=i;return f;}
function evalExpression(e,env){
  var v=M.evaluateAst(asExpr(e).ast,env||{}, {complex:false,angle:"RAD"},0),n=M.toNumber(v);
  if(!Number.isFinite(n))throw new ODESingularityError("ODE expression produced a non-finite value",{env:env});
  return n;
}
function integrateCertified(source,variable){
  try{return C.integrate(source,variable);}
  catch(e){
    if(!(e instanceof C.UnsupportedIntegralError))throw e;
    try{return CAS.integrateAdvanced(source,variable);}
    catch(e2){
      if(e2 instanceof CAS.UnsupportedCASError)throw new UnsupportedODEError("Required antiderivative is outside the certified symbolic integration rules",{expression:asExpr(source).toString(),variable:variable});
      throw e2;
    }
  }
}
function relationString(left,right){return asExpr(left).toString()+" = "+asExpr(right).toString()+" + C";}

/* Exact symbolic ODE families ------------------------------------------- */
class SymbolicODESolution{
  constructor(kind,dependent,independent,expression,display,metadata){
    this.kind=kind;this.dependent=dependent;this.independent=independent;this.expression=expression||null;this.display=display;this.metadata=metadata||{};
  }
  toString(){return this.display;}
}
function solveSeparable(fx,gy,x,y){
  x=requireVar(x,"independent variable");y=requireVar(y,"dependent variable");
  var fxExpr=asExpr(fx),gyExpr=asExpr(gy);
  if(fxExpr.variables().some(function(v){return v!==x;}))throw new UnsupportedODEError("Separable x-factor may depend only on "+x);
  if(gyExpr.variables().some(function(v){return v!==y;}))throw new UnsupportedODEError("Separable y-factor may depend only on "+y);
  var F=integrateCertified(fxExpr,x).expression,G=integrateCertified(gyExpr,y).expression;
  return new SymbolicODESolution("separable-implicit",y,x,null,relationString(G,F),{xIntegral:F,yIntegral:G,equation:"dy/dx = f(x)/g(y)"});
}
function solveLinearFirstOrder(P,Q,x,y){
  x=requireVar(x,"independent variable");y=requireVar(y,"dependent variable");
  var p=asExpr(P),q=asExpr(Q);
  if(p.variables().some(function(v){return v!==x;})||q.variables().some(function(v){return v!==x;}))throw new UnsupportedODEError("linearode coefficients may depend only on "+x);
  var intP=integrateCertified(p,x).expression,mu=expr(call("exp",[cloneAst(intP.ast)])),
    muQ=expr(bin("*",cloneAst(mu.ast),cloneAst(q.ast))),intMuQ=integrateCertified(muQ,x).expression,
    numerator=bin("+",cloneAst(intMuQ.ast),id("C1")),solution=expr(bin("/",numerator,cloneAst(mu.ast)));
  // Verify the symbolic family by differentiating with C1 treated as a constant with respect to x.
  var dydx=C.differentiate(solution,x),residual=expr(bin("-",bin("+",cloneAst(dydx.ast),bin("*",cloneAst(p.ast),cloneAst(solution.ast))),cloneAst(q.ast)));
  var check=substitute(residual,{C1:"1.23456789"});
  var verified=true;
  for(var sx of [-1,-0.25,0.5,1.5]){
    try{if(Math.abs(evalExpression(check,{[x]:sx}))>1e-7){verified=false;break;}}catch(e){}
  }
  if(!verified)throw new UnsupportedODEError("Linear first-order solution failed residual verification");
  return new SymbolicODESolution("linear-first-order",y,x,solution,y+" = "+solution.toString(),{integratingFactor:mu,verified:true});
}

function solveExactFirstOrder(Msource,Nsource,x,y){
  x=requireVar(x,"x variable");y=requireVar(y,"y variable");
  var field=new MV.VectorField([Msource,Nsource],[x,y]),curl=field.curl();
  if(!zeroAst(curl.ast))throw new ODEError("NOT_EXACT","Differential equation is not exact",{curl:curl.toString()});
  var potential;
  try{potential=MV.potential(field);}catch(e){
    if(e instanceof MV.UnsupportedMultivariableError)throw new UnsupportedODEError("Exact equation is certified, but its potential is outside the current polynomial reconstruction rules",{cause:e.message});
    throw e;
  }
  return new SymbolicODESolution("exact-first-order",y,x,potential,potential.toString()+" = C",{potential:potential,verified:true});
}
function solveBernoulli(P,Q,nSource,x,y){
  x=requireVar(x,"independent variable");y=requireVar(y,"dependent variable");
  var n=exactConstant(nSource);
  if(M.isZero(n)||M.isZero(M.sub(n,rat(1))))throw new ODEError("DEGENERATE_BERNOULLI","For n = 0 or 1, use linearode(...)");
  var oneMinus=M.sub(rat(1),n),p=expr(bin("*",lit(oneMinus),asExpr(P).ast)),q=expr(bin("*",lit(oneMinus),asExpr(Q).ast)),
    transformed=solveLinearFirstOrder(p,q,x,"u"),power=lit(oneMinus),left=expr(bin("^",id(y),power));
  return new SymbolicODESolution("bernoulli-implicit",y,x,null,left.toString()+" = "+transformed.expression.toString(),{power:oneMinus,transformed:transformed.expression,verified:true});
}

function solveSecondOrderHomogeneous(aSource,bSource,cSource,x,y){
  x=requireVar(x,"independent variable");y=requireVar(y,"dependent variable");
  var a=exactConstant(aSource),b=exactConstant(bSource),c=exactConstant(cSource);
  if(M.isZero(a))throw new ODEError("DEGENERATE_ORDER","Second-order leading coefficient must be nonzero");
  var disc=M.sub(M.mul(b,b),M.mul(rat(4),M.mul(a,c))),sgn=exactSign(disc),twoA=M.mul(rat(2),a),sol;
  if(sgn>0){
    var root=call("sqrt",[lit(disc)]),r1=simplify(bin("/",bin("+",unary("-",lit(b)),cloneAst(root)),lit(twoA))),r2=simplify(bin("/",bin("-",unary("-",lit(b)),cloneAst(root)),lit(twoA)));
    sol=expr(bin("+",bin("*",id("C1"),call("exp",[bin("*",r1,id(x))])),bin("*",id("C2"),call("exp",[bin("*",r2,id(x))]))));
  }else if(sgn===0){
    var r=simplify(bin("/",unary("-",lit(b)),lit(twoA)));
    sol=expr(bin("*",call("exp",[bin("*",r,id(x))]),bin("+",id("C1"),bin("*",id("C2"),id(x)))));
  }else{
    var alpha=simplify(bin("/",unary("-",lit(b)),lit(twoA))),beta=simplify(bin("/",call("sqrt",[lit(M.neg(disc))]),lit(twoA))),
      trig=bin("+",bin("*",id("C1"),call("cos",[bin("*",cloneAst(beta),id(x))])),bin("*",id("C2"),call("sin",[bin("*",cloneAst(beta),id(x))])));
    sol=expr(bin("*",call("exp",[bin("*",alpha,id(x))]),trig));
  }
  var d1=C.differentiate(sol,x),d2=C.differentiate(d1,x),res=expr(bin("+",bin("+",bin("*",lit(a),cloneAst(d2.ast)),bin("*",lit(b),cloneAst(d1.ast))),bin("*",lit(c),cloneAst(sol.ast))));
  var verified=true,usable=0,probe=substitute(res,{C1:"1.25",C2:"-0.75"});
  for(var px of [-1,-0.2,0.4,1.1]){
    try{var rv=evalExpression(probe,{[x]:px});usable++;if(Math.abs(rv)>1e-7){verified=false;break;}}catch(e){}
  }
  if(!verified||usable<2)throw new UnsupportedODEError("Second-order symbolic family failed residual verification");
  return new SymbolicODESolution("second-order-homogeneous",y,x,sol,y+" = "+sol.toString(),{discriminant:disc,verified:true});
}

/* ODE Taylor-series IVP ------------------------------------------------- */
function odeTaylorSeries(rhs,x,y,x0Source,y0Source,order){
  x=requireVar(x,"independent variable");y=requireVar(y,"dependent variable");
  order=Number(order);
  if(!Number.isInteger(order)||order<1||order>8)throw new ODEError("INVALID_ORDER","seriesivp order must be an integer from 1 to 8");
  var f=asExpr(rhs),allowed=new Set([x,y]);
  if(f.variables().some(function(v){return !allowed.has(v);}))throw new UnsupportedODEError("seriesivp RHS may depend only on "+x+" and "+y);
  var x0=exactConstant(x0Source),y0=exactConstant(y0Source),derivatives=[null,f],coefficients=[y0],sum=lit(y0),current=f;
  for(var n=1;n<=order;n++){
    var at=substitute(current,{[x]:lit(x0),[y]:lit(y0)}),value=exactConstant(at),coef=M.div(value,new M.Rational(factorial(n))),shift=bin("-",id(x),lit(x0)),
      pow=n===1?shift:bin("^",shift,lit(rat(n)));
    sum=simplify(bin("+",sum,bin("*",lit(coef),pow)));coefficients.push(coef);
    if(n<order){
      var dx=C.partialDerivative(current,x),dy=C.partialDerivative(current,y);
      current=expr(bin("+",cloneAst(dx.ast),bin("*",cloneAst(dy.ast),cloneAst(f.ast))));
      derivatives[n+1]=current;
    }
  }
  var polynomial=expr(sum);
  return {expression:polynomial,independent:x,dependent:y,center:x0,initial:y0,order:order,coefficients:coefficients,toString:function(){return y+" ≈ "+polynomial.toString()+" + O(("+x+" - "+M.formatValue(x0)+")^"+(order+1)+")";}};
}

/* Laplace transform tables ---------------------------------------------- */
function dependsOn(ast,variable){return A.collectVariables(ast).has(variable);}
function constantFactor(ast,variable){
  if(!dependsOn(ast,variable))return {constant:cloneAst(ast),rest:lit(rat(1))};
  if(ast.type==="binary"&&ast.op==="*"){
    if(!dependsOn(ast.left,variable))return {constant:cloneAst(ast.left),rest:cloneAst(ast.right)};
    if(!dependsOn(ast.right,variable))return {constant:cloneAst(ast.right),rest:cloneAst(ast.left)};
  }
  return null;
}
function linearInner(ast,variable){
  try{
    var p=A.Polynomial.fromAst(ast,variable);
    if(p.degree<=1)return {a:p.get(1),b:p.get(0)};
  }catch(e){}
  return null;
}
function laplaceAst(ast,t,s){
  ast=simplify(ast);
  if(!dependsOn(ast,t))return simplify(bin("/",cloneAst(ast),id(s)));
  if(ast.type==="binary"&&(ast.op==="+"||ast.op==="-"))return simplify(bin(ast.op,laplaceAst(ast.left,t,s),laplaceAst(ast.right,t,s)));
  if(ast.type==="identifier"&&ast.name===t)return simplify(bin("/",lit(rat(1)),bin("^",id(s),lit(rat(2)))));
  if(ast.type==="binary"&&ast.op==="^"&&ast.left.type==="identifier"&&ast.left.name===t&&ast.right.type==="literal"){
    var n=M.toNumber(ast.right.value);
    if(Number.isInteger(n)&&n>=0&&n<=20)return simplify(bin("/",lit(new M.Rational(factorial(n))),bin("^",id(s),lit(rat(n+1)))));
  }
  var cf=constantFactor(ast,t);
  if(cf&&!zeroAst(bin("-",cf.rest,lit(rat(1))))){
    return simplify(bin("*",cf.constant,laplaceAst(cf.rest,t,s)));
  }
  if(ast.type==="call"&&ast.args.length===1){
    var li=linearInner(ast.args[0],t);
    if(li&&!li.a.isZero()){
      if(ast.name==="exp"){
        var shift=lit(li.a),den=bin("-",id(s),shift),base=bin("/",lit(rat(1)),den);
        return li.b.isZero()?simplify(base):simplify(bin("*",call("exp",[lit(li.b)]),base));
      }
      if(!li.b.isZero())throw new UnsupportedODEError("Laplace sin/cos table currently requires zero phase");
      if(ast.name==="sin")return simplify(bin("/",lit(li.a),bin("+",bin("^",id(s),lit(rat(2))),lit(M.mul(li.a,li.a)))));
      if(ast.name==="cos")return simplify(bin("/",id(s),bin("+",bin("^",id(s),lit(rat(2))),lit(M.mul(li.a,li.a)))));
      if(ast.name==="sinh")return simplify(bin("/",lit(li.a),bin("-",bin("^",id(s),lit(rat(2))),lit(M.mul(li.a,li.a)))));
      if(ast.name==="cosh")return simplify(bin("/",id(s),bin("-",bin("^",id(s),lit(rat(2))),lit(M.mul(li.a,li.a)))));
    }
  }
  throw new UnsupportedODEError("No certified Laplace table rule matches this expression",{expression:A.printAst(ast)});
}
function laplaceTransform(source,t,s){
  t=requireVar(t,"time variable");s=requireVar(s,"transform variable");
  if(t===s)throw new ODEError("INVALID_VARIABLE","Time and transform variables must differ");
  var e=asExpr(source);
  if(e.variables().some(function(v){return v!==t;}))throw new UnsupportedODEError("Laplace input may depend only on "+t);
  return expr(laplaceAst(e.ast,t,s));
}
function inverseLaplace(source,s,t){
  s=requireVar(s,"transform variable");t=requireVar(t,"time variable");
  var rf;
  try{rf=A.RationalFunction.fromAst(asExpr(source).ast,s);}catch(e){throw new UnsupportedODEError("Inverse Laplace currently supports rational transforms with degree ≤ 2 denominators");}
  var n=rf.numerator,d=rf.denominator;
  if(n.degree>1||d.degree<1||d.degree>2)throw new UnsupportedODEError("Inverse Laplace rational degree is outside the certified table");
  if(d.degree===1){
    var d1=d.get(1),d0=d.get(0),n1=n.get(1),n0=n.get(0);
    if(!n1.isZero())throw new UnsupportedODEError("Improper linear-denominator transform is outside the inverse table");
    var root=d0.neg().div(d1),scale=n0.div(d1);
    return expr(bin("*",lit(scale),call("exp",[bin("*",lit(root),id(t))])));
  }
  var a=d.get(2),b=d.get(1),c=d.get(0),m=n.get(1),q=n.get(0),alpha=b.neg().div(a.mul(rat(2))),
    beta2=c.div(a).sub(alpha.mul(alpha)),Acoef=m.div(a),Bcoef=q.add(m.mul(alpha)).div(a),sgn=exactSign(beta2),out;
  if(sgn>0){
    var beta=call("sqrt",[lit(beta2)]),inner=bin("+",bin("*",lit(Acoef),call("cos",[bin("*",cloneAst(beta),id(t))])),bin("*",bin("/",lit(Bcoef),cloneAst(beta)),call("sin",[bin("*",cloneAst(beta),id(t))])));
    out=bin("*",call("exp",[bin("*",lit(alpha),id(t))]),inner);
  }else if(sgn===0){
    out=bin("*",call("exp",[bin("*",lit(alpha),id(t))]),bin("+",lit(Acoef),bin("*",lit(Bcoef),id(t))));
  }else{
    var gamma=call("sqrt",[lit(M.neg(beta2))]),r1=bin("+",lit(alpha),cloneAst(gamma)),r2=bin("-",lit(alpha),cloneAst(gamma)),
      denDiff=bin("*",lit(a),bin("-",cloneAst(r1),cloneAst(r2))),
      c1=bin("/",bin("+",bin("*",lit(m),cloneAst(r1)),lit(q)),cloneAst(denDiff)),
      c2=bin("/",bin("+",bin("*",lit(m),cloneAst(r2)),lit(q)),unary("-",cloneAst(denDiff)));
    out=bin("+",bin("*",c1,call("exp",[bin("*",cloneAst(r1),id(t))])),bin("*",c2,call("exp",[bin("*",cloneAst(r2),id(t))])));
  }
  return expr(out);
}
function convolutionAt(fSource,gSource,t,targetSource,options){
  t=requireVar(t,"time variable");var target=numberConstant(targetSource);
  if(target<0)throw new ODEError("INVALID_TIME","Laplace convolution evaluation requires t ≥ 0");
  var tau="__tau",f=substitute(fSource,{[t]:id(tau)}),g=substitute(gSource,{[t]:expr(bin("-",lit(M.Rational.fromDecimal(String(target))),id(tau)))}),
    integrand=expr(bin("*",cloneAst(f.ast),cloneAst(g.ast)));
  var r=C.adaptiveSimpson(integrand,tau,0,target,options||{});
  return {value:r.value,errorEstimate:r.errorEstimate,evaluations:r.evaluations,integrand:integrand,toString:function(){return "≈ "+formatNumber(r.value,12);}};
}

/* Numerical IVP integration -------------------------------------------- */
function compileSystem(rhsSources,timeVar,stateVars){
  timeVar=requireVar(timeVar,"independent variable");stateVars=stateVars.map(function(v){return requireVar(v,"state variable");});
  if(new Set(stateVars).size!==stateVars.length||stateVars.indexOf(timeVar)>=0)throw new ODEError("INVALID_VARIABLE","Independent and state variables must be distinct");
  if(rhsSources.length!==stateVars.length)throw new ODEError("SHAPE_ERROR","One RHS expression is required per state variable");
  var asts=rhsSources.map(function(s){return asExpr(s).ast;}),allowed=new Set([timeVar].concat(stateVars));
  asts.forEach(function(ast){A.collectVariables(ast).forEach(function(v){if(!allowed.has(v))throw new UnsupportedODEError("Unknown ODE variable '"+v+"'");});});
  var evaluations=0;
  function evaluate(t,state){
    if(state.length!==stateVars.length)throw new ODEError("SHAPE_ERROR","State dimension mismatch");
    var env={[timeVar]:t};stateVars.forEach(function(v,i){env[v]=state[i];});evaluations++;
    return asts.map(function(ast){
      var value;
      try{value=M.evaluateAst(ast,env,{complex:false,angle:"RAD"},0);}catch(e){throw new ODESingularityError("ODE RHS is not finite",{time:t,state:state,cause:e.code||e.message});}
      var n=M.toNumber(value);if(!Number.isFinite(n))throw new ODESingularityError("ODE RHS is not finite",{time:t,state:state});return n;
    });
  }
  evaluate.getEvaluations=function(){return evaluations;};
  return evaluate;
}
function vecAdd(y,terms,h){
  var out=y.slice();
  for(var j=0;j<out.length;j++){
    var add=0;for(var i=0;i<terms.length;i++)add+=terms[i][0]*terms[i][1][j];
    out[j]+=h*add;
  }
  return out;
}
function rk4System(rhs,t0,y0,t1,steps){
  t0=Number(t0);t1=Number(t1);steps=Number(steps);
  if(!Number.isInteger(steps)||steps<1||steps>100000)throw new ODEError("INVALID_STEPS","RK4 steps must be an integer from 1 to 100000");
  var y=y0.map(Number),t=t0,h=(t1-t0)/steps,points=[{t:t,state:y.slice()}];
  for(var i=0;i<steps;i++){
    var k1=rhs(t,y),k2=rhs(t+h/2,vecAdd(y,[[1/2,k1]],h)),k3=rhs(t+h/2,vecAdd(y,[[1/2,k2]],h)),k4=rhs(t+h,vecAdd(y,[[1,k3]],h));
    y=vecAdd(y,[[1/6,k1],[1/3,k2],[1/3,k3],[1/6,k4]],h);t=t0+(i+1)*h;
    if(y.some(function(v){return !Number.isFinite(v);}))throw new ODESingularityError("RK4 state became non-finite",{time:t});
    points.push({t:t,state:y.slice()});
  }
  return {time:t1,state:y,points:points,steps:steps,evaluations:typeof rhs.getEvaluations==="function"?rhs.getEvaluations():steps*4,method:"rk4"};
}
function rk45System(rhs,t0,y0,t1,options){
  options=options||{};t0=Number(t0);t1=Number(t1);
  var absTol=options.absTol===undefined?1e-9:Number(options.absTol),relTol=options.relTol===undefined?1e-8:Number(options.relTol),
    maxSteps=options.maxSteps===undefined?100000:Number(options.maxSteps),maxEvaluations=options.maxEvaluations===undefined?700000:Number(options.maxEvaluations);
  if(!(absTol>0)||!(relTol>0)||!Number.isInteger(maxSteps)||maxSteps<1)throw new ODEError("INVALID_TOLERANCE","Invalid RK45 tolerances or step limit");
  var span=t1-t0;if(span===0)return {time:t0,state:y0.slice(),points:[{t:t0,state:y0.slice()}],steps:0,rejectedSteps:0,errorEstimate:0,evaluations:0,method:"dormand-prince-rk45"};
  var dir=span>0?1:-1,h=dir*Math.min(Math.abs(span)/20,Math.max(1e-6,Math.abs(span)/100)),t=t0,y=y0.map(Number),
    accepted=0,rejected=0,lastError=0,points=[{t:t,state:y.slice()}];
  function ensureEval(){if(typeof rhs.getEvaluations==="function"&&rhs.getEvaluations()>=maxEvaluations)throw new ODEConvergenceError("RK45 exceeded its RHS evaluation budget",{evaluations:rhs.getEvaluations()});}
  while(dir*(t1-t)>0){
    if(accepted+rejected>=maxSteps)throw new ODEConvergenceError("RK45 exceeded its step budget",{time:t,accepted:accepted,rejected:rejected});
    if(dir*(t+h-t1)>0)h=t1-t;
    var minStep=32*Number.EPSILON*Math.max(1,Math.abs(t));
    if(Math.abs(h)<minStep)throw new ODEConvergenceError("RK45 step size underflow",{time:t,step:h});
    ensureEval();
    var k1=rhs(t,y),
      k2=rhs(t+h*(1/5),vecAdd(y,[[1/5,k1]],h)),
      k3=rhs(t+h*(3/10),vecAdd(y,[[3/40,k1],[9/40,k2]],h)),
      k4=rhs(t+h*(4/5),vecAdd(y,[[44/45,k1],[-56/15,k2],[32/9,k3]],h)),
      k5=rhs(t+h*(8/9),vecAdd(y,[[19372/6561,k1],[-25360/2187,k2],[64448/6561,k3],[-212/729,k4]],h)),
      k6=rhs(t+h,vecAdd(y,[[9017/3168,k1],[-355/33,k2],[46732/5247,k3],[49/176,k4],[-5103/18656,k5]],h)),
      y5=vecAdd(y,[[35/384,k1],[500/1113,k3],[125/192,k4],[-2187/6784,k5],[11/84,k6]],h),
      k7=rhs(t+h,y5),
      y4=vecAdd(y,[[5179/57600,k1],[7571/16695,k3],[393/640,k4],[-92097/339200,k5],[187/2100,k6],[1/40,k7]],h);
    ensureEval();
    var err=0;
    for(var j=0;j<y.length;j++){
      var scale=absTol+relTol*Math.max(Math.abs(y[j]),Math.abs(y5[j])),e=Math.abs(y5[j]-y4[j])/scale;if(e>err)err=e;
    }
    if(!Number.isFinite(err))throw new ODESingularityError("RK45 local error became non-finite",{time:t});
    lastError=err;
    if(err<=1){
      t+=h;y=y5;
      if(y.some(function(v){return !Number.isFinite(v);}))throw new ODESingularityError("RK45 state became non-finite",{time:t});
      accepted++;points.push({t:t,state:y.slice()});
    }else rejected++;
    var factor=err===0?5:Math.max(0.2,Math.min(5,0.9*Math.pow(err,-0.2)));h*=factor;
  }
  return {time:t1,state:y,points:points,steps:accepted,rejectedSteps:rejected,errorEstimate:lastError,evaluations:typeof rhs.getEvaluations==="function"?rhs.getEvaluations():null,method:"dormand-prince-rk45"};
}
function solveScalarIVP(rhsSource,x,y,x0Source,y0Source,x1Source,options){
  var x0=numberConstant(x0Source),y0=numberConstant(y0Source),x1=numberConstant(x1Source),fn=compileSystem([rhsSource],x,[y]),r=rk45System(fn,x0,[y0],x1,options);
  return {independent:x,dependent:y,result:r,value:r.state[0],toString:function(){return y+"("+formatNumber(x1,8)+") ≈ "+formatNumber(this.value,12);}};
}
function solveSecondOrderIVP(rhsSource,x,y,v,x0Source,y0Source,v0Source,x1Source,options){
  x=requireVar(x,"independent variable");y=requireVar(y,"dependent variable");v=requireVar(v,"first-derivative state");
  var fn=compileSystem([v,rhsSource],x,[y,v]),x0=numberConstant(x0Source),x1=numberConstant(x1Source),initial=[numberConstant(y0Source),numberConstant(v0Source)],
    r=rk45System(fn,x0,initial,x1,options);
  return {independent:x,dependent:y,velocity:v,result:r,value:r.state[0],derivative:r.state[1],toString:function(){return y+"("+formatNumber(x1,8)+") ≈ "+formatNumber(this.value,12)+", "+v+"("+formatNumber(x1,8)+") ≈ "+formatNumber(this.derivative,12);}};
}
function solveSystemIVP(rhsSources,t,stateVars,t0Source,initialSources,t1Source,options){
  if(rhsSources.length!==stateVars.length||initialSources.length!==stateVars.length)throw new ODEError("SHAPE_ERROR","RHS, state-variable, and initial-state dimensions must match");
  var fn=compileSystem(rhsSources,t,stateVars),initial=initialSources.map(numberConstant),t0=numberConstant(t0Source),t1=numberConstant(t1Source),r=rk45System(fn,t0,initial,t1,options);
  return {independent:t,states:stateVars,result:r,toString:function(){return "["+stateVars.map(function(v,i){return v+"("+formatNumber(t1,8)+") ≈ "+formatNumber(r.state[i],12);}).join(", ")+"]";}};
}
function sampleTrajectory(rhsSources,t,stateVars,t0Source,initialSources,t1Source,samples,options){
  samples=Number(samples);if(!Number.isInteger(samples)||samples<2||samples>2000)throw new ODEError("INVALID_SAMPLES","Trajectory samples must be an integer from 2 to 2000");
  var fn=compileSystem(rhsSources,t,stateVars),t0=numberConstant(t0Source),t1=numberConstant(t1Source),state=initialSources.map(numberConstant),points=[{t:t0,state:state.slice()}],
    steps=0,rejected=0,evals=0;
  for(var i=1;i<samples;i++){
    var target=t0+(t1-t0)*i/(samples-1),r=rk45System(fn,points[points.length-1].t,state,target,options);
    state=r.state.slice();steps+=r.steps;rejected+=r.rejectedSteps;evals=r.evaluations||evals;points.push({t:target,state:state.slice()});
  }
  return {independent:t,states:stateVars,points:points,steps:steps,rejectedSteps:rejected,evaluations:evals,method:"sampled-dormand-prince",toString:function(){var last=points[points.length-1];return samples+" samples; final ["+last.state.map(function(v){return formatNumber(v,10);}).join(", ")+"]";}};
}

/* Dynamical systems ------------------------------------------------------ */
function equilibria2(f,g,x,y){
  x=requireVar(x,"state variable");y=requireVar(y,"state variable");
  var equations=[asExpr(f).toString()+" = 0",asExpr(g).toString()+" = 0"],solution=null;
  try{solution=A.solveLinearSystem(equations,[x,y]);}
  catch(e){
    try{var r=CAS.runCommand("system("+equations.join("; ")+")");solution=r&&r.value;}catch(e2){}
  }
  if(!solution)throw new UnsupportedODEError("Equilibrium equations are outside the certified exact system solvers",{equations:equations});
  return {variables:[x,y],solution:solution,toString:function(){return solution.toString();}};
}
function jacobianAt2(f,g,x,y,x0Source,y0Source){
  x=requireVar(x,"state variable");y=requireVar(y,"state variable");
  var point={[x]:x0Source,[y]:y0Source},J=C.jacobian([f,g],[x,y]);
  return J.map(function(row){return row.map(function(e){return substitute(e,point);});});
}
function numericMatrix2(J){
  return J.map(function(row){return row.map(function(e){return numberConstant(e);});});
}
function classifyLinearization2(f,g,x,y,x0Source,y0Source){
  var x0=numberConstant(x0Source),y0=numberConstant(y0Source),fv=evalExpression(f,{[x]:x0,[y]:y0}),gv=evalExpression(g,{[x]:x0,[y]:y0});
  if(Math.max(Math.abs(fv),Math.abs(gv))>1e-8)throw new ODEError("NOT_EQUILIBRIUM","The supplied point is not an equilibrium",{residual:[fv,gv]});
  var symbolic=jacobianAt2(f,g,x,y,x0Source,y0Source),J=numericMatrix2(symbolic),tr=J[0][0]+J[1][1],det=J[0][0]*J[1][1]-J[0][1]*J[1][0],disc=tr*tr-4*det,eps=1e-10,classification,stability;
  if(det<-eps){classification="saddle";stability="unstable";}
  else if(Math.abs(det)<=eps){classification="non-hyperbolic";stability="inconclusive";}
  else if(disc>eps){
    classification=tr<0?"stable node":tr>0?"unstable node":"non-hyperbolic";
    stability=tr<0?"asymptotically stable":tr>0?"unstable":"inconclusive";
  }else if(disc<-eps){
    if(tr<-eps){classification="stable spiral";stability="asymptotically stable";}
    else if(tr>eps){classification="unstable spiral";stability="unstable";}
    else{classification="center (linearized)";stability="nonlinear stability inconclusive";}
  }else{
    if(tr<-eps){classification="stable repeated node";stability="asymptotically stable";}
    else if(tr>eps){classification="unstable repeated node";stability="unstable";}
    else{classification="non-hyperbolic";stability="inconclusive";}
  }
  return {jacobian:symbolic,numericJacobian:J,trace:tr,determinant:det,discriminant:disc,classification:classification,stability:stability,toString:function(){return classification+"; trace = "+formatNumber(tr,8)+", det = "+formatNumber(det,8);}};
}
function directionField(rhs,x,y,xBounds,yBounds,grid){
  x=requireVar(x,"independent variable");y=requireVar(y,"dependent variable");
  var rhsExpr=asExpr(rhs),allowed=new Set([x,y]);if(rhsExpr.variables().some(function(v){return !allowed.has(v);}))throw new UnsupportedODEError("Direction-field RHS may depend only on "+x+" and "+y);
  var xb=xBounds.map(numberConstant),yb=yBounds.map(numberConstant),nx=Number(grid[0]),ny=Number(grid[1]);
  if(xb.length!==2||yb.length!==2||!Number.isInteger(nx)||!Number.isInteger(ny)||nx<2||ny<2||nx>100||ny>100)throw new ODEError("INVALID_GRID","Direction-field grid must be nx,ny with each dimension 2–100");
  var points=[];
  for(var i=0;i<nx;i++)for(var j=0;j<ny;j++){
    var xv=xb[0]+(xb[1]-xb[0])*i/(nx-1),yv=yb[0]+(yb[1]-yb[0])*j/(ny-1);
    try{
      var slope=evalExpression(rhsExpr,{[x]:xv,[y]:yv}),norm=Math.sqrt(1+slope*slope);
      points.push({x:xv,y:yv,slope:slope,dx:1/norm,dy:slope/norm});
    }catch(err){if(!(err instanceof ODESingularityError))throw err;}
  }
  return {points:points,xBounds:xb,yBounds:yb,grid:[nx,ny],toString:function(){return points.length+" finite direction samples on "+nx+"×"+ny+" grid";}};
}


function phasePortrait2(f,g,x,y,xBounds,yBounds,grid,initial,timeBounds,samples,options){
  x=requireVar(x,"state variable");y=requireVar(y,"state variable");
  var xb=xBounds.map(numberConstant),yb=yBounds.map(numberConstant),nx=Number(grid[0]),ny=Number(grid[1]);
  if(xb.length!==2||yb.length!==2||!Number.isInteger(nx)||!Number.isInteger(ny)||nx<2||ny<2||nx>80||ny>80)throw new ODEError("INVALID_GRID","Phase portrait grid dimensions must be 2–80");
  var fe=asExpr(f),ge=asExpr(g),allowed=new Set([x,y]);
  [fe,ge].forEach(function(e){if(e.variables().some(function(v){return !allowed.has(v);}))throw new UnsupportedODEError("Autonomous phase field may depend only on "+x+" and "+y);});
  var vectors=[];
  for(var i=0;i<nx;i++)for(var j=0;j<ny;j++){
    var xv=xb[0]+(xb[1]-xb[0])*i/(nx-1),yv=yb[0]+(yb[1]-yb[0])*j/(ny-1);
    try{
      var dx=evalExpression(fe,{[x]:xv,[y]:yv}),dy=evalExpression(ge,{[x]:xv,[y]:yv}),norm=Math.hypot(dx,dy);
      if(norm>0)vectors.push({x:xv,y:yv,dx:dx/norm,dy:dy/norm,speed:norm});else vectors.push({x:xv,y:yv,dx:0,dy:0,speed:0});
    }catch(e){if(!(e instanceof ODESingularityError))throw e;}
  }
  var trajectory=null;
  if(initial&&timeBounds){
    if(initial.length!==2||timeBounds.length!==2)throw new ODEError("SHAPE_ERROR","Phase trajectory needs x0,y0 and t0,t1");
    trajectory=sampleTrajectory([f,g],"t",[x,y],timeBounds[0],initial,timeBounds[1],samples||101,options);
  }
  return {vectors:vectors,trajectory:trajectory,xBounds:xb,yBounds:yb,grid:[nx,ny],toString:function(){return vectors.length+" vector samples"+(trajectory?"; trajectory "+trajectory.points.length+" points":"");}};
}

/* 2x2 matrix exponential and linear flow -------------------------------- */
function matrixExponential2(aSource,bSource,cSource,dSource,t){
  t=requireVar(t,"time variable");
  var a=exactConstant(aSource),b=exactConstant(bSource),c=exactConstant(cSource),d=exactConstant(dSource),half=rat(1,2),
    tau=M.mul(M.add(a,d),half),det=M.sub(M.mul(a,d),M.mul(b,c)),delta2=M.sub(M.mul(tau,tau),det),sgn=exactSign(delta2),
    B=[[M.sub(a,tau),b],[c,M.sub(d,tau)]],factor=call("exp",[bin("*",lit(tau),id(t))]),F,G;
  if(sgn>0){
    var delta=call("sqrt",[lit(delta2)]);F=call("cosh",[bin("*",cloneAst(delta),id(t))]);G=bin("/",call("sinh",[bin("*",cloneAst(delta),id(t))]),cloneAst(delta));
  }else if(sgn<0){
    var omega=call("sqrt",[lit(M.neg(delta2))]);F=call("cos",[bin("*",cloneAst(omega),id(t))]);G=bin("/",call("sin",[bin("*",cloneAst(omega),id(t))]),cloneAst(omega));
  }else{F=lit(rat(1));G=id(t);}
  var E=[[],[]];
  for(var i=0;i<2;i++)for(var j=0;j<2;j++){
    var inner=bin("+",i===j?cloneAst(F):lit(rat(0)),bin("*",cloneAst(G),lit(B[i][j])));
    E[i][j]=expr(bin("*",cloneAst(factor),inner));
  }
  // Differential equation verification at sample times: E' = A E.
  var verified=true;
  for(var col=0;col<2;col++)for(var row=0;row<2;row++){
    var der=C.differentiate(E[row][col],t),rhs=expr(bin("+",bin("*",lit(row===0?a:c),cloneAst(E[0][col].ast)),bin("*",lit(row===0?b:d),cloneAst(E[1][col].ast)))),
      residual=expr(bin("-",cloneAst(der.ast),cloneAst(rhs.ast))),usable=0;
    for(var pt of [-0.5,0,0.75]){
      try{usable++;if(Math.abs(evalExpression(residual,{[t]:pt}))>1e-7){verified=false;break;}}catch(e){}
    }
    if(!verified||usable<2)break;
  }
  if(!verified)throw new UnsupportedODEError("Matrix exponential candidate failed E' = A E verification");
  return {matrix:E,timeVariable:t,trace:M.add(a,d),determinant:det,toString:function(){return "["+E.map(function(r){return "["+r.map(function(e){return e.toString();}).join(", ")+"]";}).join(", ")+"]";}};
}
function linearFlow2(a,b,c,d,x0Source,y0Source,t){
  var E=matrixExponential2(a,b,c,d,t),x0=asExpr(x0Source),y0=asExpr(y0Source),
    x=expr(bin("+",bin("*",cloneAst(E.matrix[0][0].ast),cloneAst(x0.ast)),bin("*",cloneAst(E.matrix[0][1].ast),cloneAst(y0.ast)))),
    y=expr(bin("+",bin("*",cloneAst(E.matrix[1][0].ast),cloneAst(x0.ast)),bin("*",cloneAst(E.matrix[1][1].ast),cloneAst(y0.ast))));
  return {matrix:E.matrix,state:[x,y],timeVariable:t,toString:function(){return "["+x.toString()+", "+y.toString()+"]";}};
}

/* Command router --------------------------------------------------------- */
function runCommand(raw,options){
  raw=String(raw).trim();options=options||{};
  var p=parseSemicolon(raw,"separable");
  if(p){
    if(p.length!==4)throw new ODEError("ARITY_ERROR","separable expects separable(f(x); g(y); x; y) for y' = f(x)/g(y)");
    var sep=solveSeparable(p[0],p[1],p[2],p[3]);
    return commandResult(sep.toString(),"ode-symbolic",{value:sep,metadata:{operation:"separable",family:sep.kind}});
  }

  p=parseSemicolon(raw,"linearode");
  if(p){
    if(p.length!==4)throw new ODEError("ARITY_ERROR","linearode expects linearode(P; Q; x; y) for y' + P(x)y = Q(x)");
    var lin=solveLinearFirstOrder(p[0],p[1],p[2],p[3]);
    return commandResult(lin.toString(),"ode-symbolic",{value:lin.expression,metadata:{operation:"linearode",family:lin.kind,verified:true}});
  }

  p=parseSemicolon(raw,"exactode");
  if(p){
    if(p.length!==4)throw new ODEError("ARITY_ERROR","exactode expects exactode(M; N; x; y) for M dx + N dy = 0");
    var ex=solveExactFirstOrder(p[0],p[1],p[2],p[3]);
    return commandResult(ex.toString(),"ode-symbolic",{value:ex.expression,metadata:{operation:"exactode",family:ex.kind,verified:true}});
  }

  p=parseSemicolon(raw,"bernoulli");
  if(p){
    if(p.length!==5)throw new ODEError("ARITY_ERROR","bernoulli expects bernoulli(P; Q; n; x; y) for y' + P y = Q y^n");
    var be=solveBernoulli(p[0],p[1],p[2],p[3],p[4]);
    return commandResult(be.toString(),"ode-symbolic",{value:be,metadata:{operation:"bernoulli",family:be.kind,verified:true}});
  }

  p=parseSemicolon(raw,"ode2hom");
  if(p){
    if(p.length!==5)throw new ODEError("ARITY_ERROR","ode2hom expects ode2hom(a; b; c; x; y)");
    var hom=solveSecondOrderHomogeneous(p[0],p[1],p[2],p[3],p[4]);
    return commandResult(hom.toString(),"ode-symbolic",{value:hom.expression,metadata:{operation:"ode2hom",family:hom.kind,verified:true}});
  }

  p=parseSemicolon(raw,"seriesivp");
  if(p){
    if(p.length!==5)throw new ODEError("ARITY_ERROR","seriesivp expects seriesivp(rhs; x; y; x0,y0; order)");
    var init=splitArgs(p[3]);if(init.length!==2)throw new ODEError("ARITY_ERROR","seriesivp initial condition must be x0,y0");
    var ser=odeTaylorSeries(p[0],p[1],p[2],init[0],init[1],p[4]);
    return commandResult(ser.toString(),"ode-series",{value:ser.expression,metadata:{operation:"seriesivp",order:ser.order}});
  }

  p=parseSemicolon(raw,"laplace");
  if(p){
    if(p.length!==3)throw new ODEError("ARITY_ERROR","laplace expects laplace(f; t; s)");
    var lt=laplaceTransform(p[0],p[1],p[2]);
    return commandResult(lt.toString(),"laplace-transform",{value:lt,metadata:{operation:"laplace"}});
  }

  p=parseSemicolon(raw,"invlaplace");
  if(p){
    if(p.length!==3)throw new ODEError("ARITY_ERROR","invlaplace expects invlaplace(F; s; t)");
    var ilt=inverseLaplace(p[0],p[1],p[2]);
    return commandResult(ilt.toString(),"inverse-laplace",{value:ilt,metadata:{operation:"invlaplace"}});
  }

  p=parseSemicolon(raw,"convolution");
  if(p){
    if(p.length!==4)throw new ODEError("ARITY_ERROR","convolution expects convolution(f; g; t; value)");
    var conv=convolutionAt(p[0],p[1],p[2],p[3],options);
    return commandResult(conv.toString(),"convolution",{value:conv.value,exact:false,symbolic:false,metadata:{operation:"convolution",errorEstimate:conv.errorEstimate,evaluations:conv.evaluations}});
  }

  p=parseSemicolon(raw,"ivp");
  if(p){
    if(p.length!==5)throw new ODEError("ARITY_ERROR","ivp expects ivp(rhs; x; y; x0,y0; x1)");
    var ic=splitArgs(p[3]);if(ic.length!==2)throw new ODEError("ARITY_ERROR","ivp initial condition must be x0,y0");
    var iv=solveScalarIVP(p[0],p[1],p[2],ic[0],ic[1],p[4],options);
    return commandResult(iv.toString(),"ode-ivp",{value:iv.value,exact:false,symbolic:false,metadata:{operation:"ivp",method:iv.result.method,steps:iv.result.steps,rejectedSteps:iv.result.rejectedSteps,errorEstimate:iv.result.errorEstimate,evaluations:iv.result.evaluations}});
  }

  p=parseSemicolon(raw,"ivp2");
  if(p){
    if(p.length!==6)throw new ODEError("ARITY_ERROR","ivp2 expects ivp2(y'' rhs; x; y; v; x0,y0,v0; x1)");
    var ic2=splitArgs(p[4]);if(ic2.length!==3)throw new ODEError("ARITY_ERROR","ivp2 initial condition must be x0,y0,v0");
    var iv2=solveSecondOrderIVP(p[0],p[1],p[2],p[3],ic2[0],ic2[1],ic2[2],p[5],options);
    return commandResult(iv2.toString(),"ode-ivp2",{value:iv2.result.state.slice(),exact:false,symbolic:false,metadata:{operation:"ivp2",method:iv2.result.method,steps:iv2.result.steps,rejectedSteps:iv2.result.rejectedSteps,errorEstimate:iv2.result.errorEstimate}});
  }

  p=parseSemicolon(raw,"ivpsystem");
  if(p){
    if(p.length!==6)throw new ODEError("ARITY_ERROR","ivpsystem expects ivpsystem(f1,f2,...; t; y1,y2,...; t0; y10,y20,...; t1)");
    var rhs=splitArgs(p[0]),states=parseVarList(p[2]),initial=splitArgs(p[4]),sys=solveSystemIVP(rhs,p[1],states,p[3],initial,p[5],options);
    return commandResult(sys.toString(),"ode-system-ivp",{value:sys.result.state.slice(),exact:false,symbolic:false,metadata:{operation:"ivpsystem",method:sys.result.method,steps:sys.result.steps,rejectedSteps:sys.result.rejectedSteps,errorEstimate:sys.result.errorEstimate}});
  }

  p=parseSemicolon(raw,"rk4");
  if(p){
    if(p.length!==7)throw new ODEError("ARITY_ERROR","rk4 expects rk4(f1,...; t; y1,...; t0; initial; t1; steps)");
    var rrhs=splitArgs(p[0]),rstates=parseVarList(p[2]),rinit=splitArgs(p[4]);if(rrhs.length!==rstates.length||rinit.length!==rstates.length)throw new ODEError("SHAPE_ERROR","RK4 system dimensions must match");
    var rfn=compileSystem(rrhs,p[1],rstates),rk=rk4System(rfn,numberConstant(p[3]),rinit.map(numberConstant),numberConstant(p[5]),Number(p[6]));
    return commandResult("["+rk.state.map(function(v){return formatNumber(v,12);}).join(", ")+"]","rk4",{value:rk.state.slice(),exact:false,symbolic:false,metadata:{operation:"rk4",method:rk.method,steps:rk.steps,evaluations:rk.evaluations}});
  }

  p=parseSemicolon(raw,"trajectory");
  if(p){
    if(p.length!==6)throw new ODEError("ARITY_ERROR","trajectory expects trajectory(f1,f2,...; t; y1,y2,...; t0,t1; initial; samples)");
    var trhs=splitArgs(p[0]),tstates=parseVarList(p[2]),tb=splitArgs(p[3]),tinit=splitArgs(p[4]);
    if(tb.length!==2)throw new ODEError("ARITY_ERROR","trajectory time bounds must be t0,t1");
    var traj=sampleTrajectory(trhs,p[1],tstates,tb[0],tinit,tb[1],p[5],options);
    return commandResult(traj.toString(),"trajectory",{value:traj,exact:false,symbolic:false,metadata:{operation:"trajectory",samples:traj.points.length,method:traj.method,steps:traj.steps}});
  }

  p=parseSemicolon(raw,"equilibria");
  if(p){
    if(p.length!==2)throw new ODEError("ARITY_ERROR","equilibria expects equilibria(f,g; x,y)");
    var ec=splitArgs(p[0]),ev=parseVarList(p[1]);if(ec.length!==2||ev.length!==2)throw new ODEError("SHAPE_ERROR","equilibria currently supports 2D autonomous systems");
    var eq=equilibria2(ec[0],ec[1],ev[0],ev[1]);
    return commandResult(eq.toString(),"equilibria",{value:eq.solution,metadata:{operation:"equilibria",variables:ev}});
  }

  p=parseSemicolon(raw,"linearize");
  if(p){
    if(p.length!==3)throw new ODEError("ARITY_ERROR","linearize expects linearize(f,g; x,y; x0,y0)");
    var lc=splitArgs(p[0]),lv=parseVarList(p[1]),lp=splitArgs(p[2]);if(lc.length!==2||lv.length!==2||lp.length!==2)throw new ODEError("SHAPE_ERROR","linearize requires a 2D system and 2D point");
    var J=jacobianAt2(lc[0],lc[1],lv[0],lv[1],lp[0],lp[1]),disp="["+J.map(function(row){return "["+row.map(function(e){return e.toString();}).join(", ")+"]";}).join(", ")+"]";
    return commandResult(disp,"linearization",{value:J,metadata:{operation:"linearize",variables:lv}});
  }

  p=parseSemicolon(raw,"stability");
  if(p){
    if(p.length!==3)throw new ODEError("ARITY_ERROR","stability expects stability(f,g; x,y; x0,y0)");
    var sc=splitArgs(p[0]),sv=parseVarList(p[1]),sp=splitArgs(p[2]);if(sc.length!==2||sv.length!==2||sp.length!==2)throw new ODEError("SHAPE_ERROR","stability requires a 2D system and 2D equilibrium");
    var st=classifyLinearization2(sc[0],sc[1],sv[0],sv[1],sp[0],sp[1]);
    return commandResult(st.toString(),"stability",{value:st,metadata:{operation:"stability",classification:st.classification,stability:st.stability,trace:st.trace,determinant:st.determinant}});
  }

  p=parseSemicolon(raw,"directionfield");
  if(p){
    if(p.length!==5)throw new ODEError("ARITY_ERROR","directionfield expects directionfield(rhs; x,y; xmin,xmax; ymin,ymax; nx,ny)");
    var dv=parseVarList(p[1]),xb=splitArgs(p[2]),yb=splitArgs(p[3]),grid=splitArgs(p[4]);if(dv.length!==2||xb.length!==2||yb.length!==2||grid.length!==2)throw new ODEError("SHAPE_ERROR","Invalid direction-field dimensions");
    var field=directionField(p[0],dv[0],dv[1],xb,yb,grid);
    return commandResult(field.toString(),"direction-field",{value:field,exact:false,symbolic:false,metadata:{operation:"directionfield",samples:field.points.length,grid:field.grid}});
  }

  p=parseSemicolon(raw,"phase2");
  if(p){
    if(p.length!==8)throw new ODEError("ARITY_ERROR","phase2 expects phase2(f,g; x,y; xmin,xmax; ymin,ymax; nx,ny; x0,y0; t0,t1; samples)");
    var pc=splitArgs(p[0]),pv=parseVarList(p[1]),pxb=splitArgs(p[2]),pyb=splitArgs(p[3]),pg=splitArgs(p[4]),pi=splitArgs(p[5]),pt=splitArgs(p[6]);
    if(pc.length!==2||pv.length!==2||pxb.length!==2||pyb.length!==2||pg.length!==2||pi.length!==2||pt.length!==2)throw new ODEError("SHAPE_ERROR","Invalid phase2 dimensions");
    var phase=phasePortrait2(pc[0],pc[1],pv[0],pv[1],pxb,pyb,pg,pi,pt,p[7],options);
    return commandResult(phase.toString(),"phase-portrait",{value:phase,exact:false,symbolic:false,metadata:{operation:"phase2",vectors:phase.vectors.length,trajectorySamples:phase.trajectory.points.length}});
  }

  p=parseSemicolon(raw,"matrixexp2");
  if(p){
    if(p.length!==2)throw new ODEError("ARITY_ERROR","matrixexp2 expects matrixexp2(a,b,c,d; t)");
    var mc=splitArgs(p[0]);if(mc.length!==4)throw new ODEError("SHAPE_ERROR","matrixexp2 requires four matrix entries");
    var me=matrixExponential2(mc[0],mc[1],mc[2],mc[3],p[1]);
    return commandResult(me.toString(),"matrix-exponential",{value:me.matrix,metadata:{operation:"matrixexp2",verified:true}});
  }

  p=parseSemicolon(raw,"linearflow2");
  if(p){
    if(p.length!==3)throw new ODEError("ARITY_ERROR","linearflow2 expects linearflow2(a,b,c,d; x0,y0; t)");
    var fc=splitArgs(p[0]),fi=splitArgs(p[1]);if(fc.length!==4||fi.length!==2)throw new ODEError("SHAPE_ERROR","linearflow2 requires a 2×2 matrix and 2D initial state");
    var flow=linearFlow2(fc[0],fc[1],fc[2],fc[3],fi[0],fi[1],p[2]);
    return commandResult(flow.toString(),"linear-flow",{value:flow.state,metadata:{operation:"linearflow2",verified:true}});
  }

  if(/^odehelp\s*\(\s*\)$/i.test(raw)){
    return commandResult("U3: separable · linearode · exactode · bernoulli · ode2hom · seriesivp · laplace · invlaplace · convolution · ivp · ivp2 · ivpsystem · rk4 · trajectory · equilibria · linearize · stability · directionfield · phase2 · matrixexp2 · linearflow2","ode-help",{metadata:{operation:"odehelp"}});
  }
  return null;
}

global.CalcODE={
  VERSION:"2.2.0-u3",
  ODEError:ODEError,UnsupportedODEError:UnsupportedODEError,ODEConvergenceError:ODEConvergenceError,ODESingularityError:ODESingularityError,
  SymbolicODESolution:SymbolicODESolution,
  solveSeparable:solveSeparable,solveLinearFirstOrder:solveLinearFirstOrder,solveExactFirstOrder:solveExactFirstOrder,solveBernoulli:solveBernoulli,solveSecondOrderHomogeneous:solveSecondOrderHomogeneous,odeTaylorSeries:odeTaylorSeries,
  laplaceTransform:laplaceTransform,inverseLaplace:inverseLaplace,convolutionAt:convolutionAt,
  compileSystem:compileSystem,rk4System:rk4System,rk45System:rk45System,solveScalarIVP:solveScalarIVP,solveSecondOrderIVP:solveSecondOrderIVP,solveSystemIVP:solveSystemIVP,sampleTrajectory:sampleTrajectory,
  equilibria2:equilibria2,jacobianAt2:jacobianAt2,classifyLinearization2:classifyLinearization2,directionField:directionField,phasePortrait2:phasePortrait2,
  matrixExponential2:matrixExponential2,linearFlow2:linearFlow2,
  runCommand:runCommand
};
})(window);
