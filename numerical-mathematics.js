(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
const ODE=global.CalcODE;
const LA=global.CalcLinearAlgebra;
const ALA=global.CalcAdvancedLinearAlgebra;
const OPT=global.CalcOptimization;
if(!M||!A||!C||!ODE||!LA||!ALA||!OPT)throw new Error("CalcMath, CalcAlgebra, CalcCalculus, CalcODE, CalcLinearAlgebra, CalcAdvancedLinearAlgebra, and CalcOptimization must load before CalcNumerical");

class NumericalMathematicsError extends M.CalcError{
  constructor(code,message,details){super(code||"NUMERICAL_MATHEMATICS_ERROR",message,undefined,undefined,details);}
}
class NumericalConvergenceError extends NumericalMathematicsError{
  constructor(message,details){super("NUMERICAL_CONVERGENCE",message||"Numerical method did not converge",details);}
}
class UnsupportedNumericalMethodError extends NumericalMathematicsError{
  constructor(message,details){super("UNSUPPORTED_NUMERICAL_METHOD",message,details);}
}

function commandResult(display,kind,details){
  details=details||{};
  return {
    value:details.value===undefined?null:details.value,
    display:String(display),approx:details.approx||"",
    exact:false,kind:kind||"numerical-mathematics",symbolic:false,
    metadata:Object.assign({numericKind:kind||"numerical-mathematics",exact:false,u6:true},details.metadata||{})
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
function parseSemicolon(raw,name){var body=parseCall(raw,name);return body===null?null:splitTopLevel(body,";");}
function requireVar(v){v=String(v||"").trim();if(!/^[A-Za-z_]\w*$/.test(v))throw new NumericalMathematicsError("INVALID_VARIABLE","Invalid variable '"+v+"'");return v;}
function numberConstant(source){
  var r=M.evaluate(String(source),{}, {commit:false,complex:false,angle:"RAD"}),n=M.toNumber(r.value);
  if(!Number.isFinite(n))throw new NumericalMathematicsError("FINITE_REQUIRED","Expected a finite real constant",{source:String(source)});
  return n;
}
function parseNumberList(source){
  var v=splitArgs(source).map(numberConstant);
  if(!v.length)throw new NumericalMathematicsError("DATA_REQUIRED","Expected a nonempty numeric list");return v;
}
function parseMatrix(source){
  var rows=splitTopLevel(source,"|").map(function(row){return splitArgs(row);});
  if(!rows.length||!rows[0].length)throw new NumericalMathematicsError("MATRIX_REQUIRED","Matrix input is empty");
  if(rows.some(function(r){return r.length!==rows[0].length;}))throw new NumericalMathematicsError("MATRIX_SHAPE_ERROR","Matrix rows must have equal length");
  return new LA.Matrix(rows.map(function(r){return r.map(numberConstant);}));
}
function parseVector(source){return new LA.Vector(parseNumberList(source));}
function numericRows(A){return A.data.map(function(r){return r.map(function(v){var n=M.toNumber(v);if(!Number.isFinite(n))throw new NumericalMathematicsError("FINITE_REQUIRED","Matrix must have finite real entries");return n;});});}
function norm2(v){return Math.sqrt(v.reduce(function(s,x){return s+x*x;},0));}
function dot(a,b){var s=0;for(var i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function addv(a,b,scale){scale=scale===undefined?1:scale;return a.map(function(x,i){return x+scale*b[i];});}
function matVec(A,x){return A.map(function(r){return dot(r,x);});}
function residualVec(A,x,b){return addv(matVec(A,x),b,-1);}
function relativeResidual(A,x,b){
  var r=norm2(residualVec(A,x,b)),bn=Math.max(norm2(b),Number.MIN_VALUE);return r/bn;
}
function evaluator(source,variable){
  variable=requireVar(variable);
  return new C.CompiledNumericFunction(source,variable,{});
}
function formatList(v,p){return "["+v.map(function(x){return M.formatNumber(x,p||10);}).join(", ")+"]";}
function uniqueNodes(x){
  var seen=new Set();x.forEach(function(v){var k=String(v);if(seen.has(k))throw new NumericalMathematicsError("DUPLICATE_NODE","Interpolation nodes must be distinct");seen.add(k);});
}

/* Floating-point and error analysis ------------------------------------- */
const floatBuffer=new ArrayBuffer(8),floatView=new DataView(floatBuffer);
function nextUp(x){
  x=Number(x);if(Number.isNaN(x)||x===Infinity)return x;if(x===0)return Number.MIN_VALUE;
  floatView.setFloat64(0,x,false);var bits=floatView.getBigUint64(0,false);
  bits=x>0?bits+1n:bits-1n;floatView.setBigUint64(0,bits,false);return floatView.getFloat64(0,false);
}
function nextDown(x){
  x=Number(x);if(Number.isNaN(x)||x===-Infinity)return x;if(x===0)return -Number.MIN_VALUE;
  floatView.setFloat64(0,x,false);var bits=floatView.getBigUint64(0,false);
  bits=x>0?bits-1n:bits+1n;floatView.setBigUint64(0,bits,false);return floatView.getFloat64(0,false);
}
function ulp(x){
  x=Number(x);if(!Number.isFinite(x))return Infinity;
  var ax=Math.abs(x);if(ax===0||ax<Math.pow(2,-1022))return Number.MIN_VALUE;
  return Math.pow(2,Math.floor(Math.log2(ax))-52);
}
function floatInfo(x){
  x=Number(x);if(!Number.isFinite(x))throw new NumericalMathematicsError("FINITE_REQUIRED","floatinfo requires a finite number");
  var up=nextUp(x),down=nextDown(x),spacing=ulp(x);
  return {value:x,nextUp:up,nextDown:down,ulp:spacing,machineEpsilon:Number.EPSILON,
    relativeSpacing:spacing/Math.max(Math.abs(x),Number.MIN_VALUE),
    toString:function(){return "x = "+x.toPrecision(17)+"; ulp = "+spacing.toExponential(17)+"; next = "+up.toPrecision(17);}};
}
function errorMetrics(reference,approximation){
  reference=Number(reference);approximation=Number(approximation);
  if(!Number.isFinite(reference)||!Number.isFinite(approximation))throw new NumericalMathematicsError("FINITE_REQUIRED","Error metrics require finite values");
  var abs=Math.abs(approximation-reference),rel=reference===0?(abs===0?0:Infinity):abs/Math.abs(reference);
  return {reference:reference,approximation:approximation,absoluteError:abs,relativeError:rel,percentError:100*rel,
    correctDigits:abs===0?Infinity:Math.max(0,-Math.log10(Math.max(rel,Number.MIN_VALUE))),
    toString:function(){return "absolute error = "+M.formatNumber(abs,10)+"; relative error = "+(Number.isFinite(rel)?M.formatNumber(rel,10):"∞");}};
}
function cancellationDiagnostic(a,b){
  a=Number(a);b=Number(b);if(!Number.isFinite(a)||!Number.isFinite(b))throw new NumericalMathematicsError("FINITE_REQUIRED","Cancellation diagnostic requires finite values");
  var result=a-b,scale=Math.max(Math.abs(a),Math.abs(b),Number.MIN_VALUE),ratio=Math.abs(result)/scale,
    lost=ratio===0?Infinity:Math.max(0,-Math.log10(ratio));
  return {a:a,b:b,result:result,relativeGap:ratio,estimatedLostDecimalDigits:lost,
    toString:function(){return "a-b = "+M.formatNumber(result,17)+"; relative gap = "+M.formatNumber(ratio,8)+"; cancellation digits ≈ "+(Number.isFinite(lost)?M.formatNumber(lost,5):"∞");}};
}
function scalarCondition(source,variable,x){
  var fn=evaluator(source,variable),fx=fn.evaluate(x),d;
  try{d=C.numericalDerivative(source,variable,x,{absTol:1e-12,relTol:1e-10}).value;}catch(e){throw new UnsupportedNumericalMethodError("Could not estimate the scalar derivative for conditioning",{cause:e.code||e.message});}
  var absCond=Math.abs(d),relCond=fx===0?Infinity:Math.abs(x*d/fx);
  return {x:x,value:fx,derivative:d,absoluteCondition:absCond,relativeCondition:relCond,
    toString:function(){return "f(x) = "+M.formatNumber(fx,12)+"; κ_abs = "+M.formatNumber(absCond,8)+"; κ_rel = "+(Number.isFinite(relCond)?M.formatNumber(relCond,8):"∞");}};
}
function richardsonExtrapolation(coarse,fine,order,ratio){
  coarse=Number(coarse);fine=Number(fine);order=Number(order);ratio=ratio===undefined?2:Number(ratio);
  if(![coarse,fine,order,ratio].every(Number.isFinite)||order<=0||ratio<=1)throw new NumericalMathematicsError("INVALID_PARAMETER","Richardson requires finite values, order > 0, ratio > 1");
  var den=Math.pow(ratio,order)-1,correction=(fine-coarse)/den,extrapolated=fine+correction;
  return {coarse:coarse,fine:fine,order:order,ratio:ratio,extrapolated:extrapolated,errorEstimate:Math.abs(correction),
    toString:function(){return "extrapolated ≈ "+M.formatNumber(extrapolated,14)+"; estimated fine-grid error ≈ "+M.formatNumber(Math.abs(correction),8);}};
}
function observedOrder(a1,a2,a3,ratio){
  a1=Number(a1);a2=Number(a2);a3=Number(a3);ratio=ratio===undefined?2:Number(ratio);
  var d1=Math.abs(a1-a2),d2=Math.abs(a2-a3);
  if(![a1,a2,a3,ratio].every(Number.isFinite)||ratio<=1||d1===0||d2===0)throw new NumericalMathematicsError("ORDER_UNDEFINED","Observed order requires three distinct successive approximations and ratio > 1");
  var p=Math.log(d1/d2)/Math.log(ratio);
  return {order:p,differenceCoarse:d1,differenceFine:d2,ratio:ratio,toString:function(){return "observed order p ≈ "+M.formatNumber(p,8);}};
}

/* Root finding V2 ------------------------------------------------------- */
function fixedPoint(source,variable,x0,options){
  options=Object.assign({absTol:1e-10,relTol:1e-9,maxIterations:500},options||{});
  var fn=evaluator(source,variable),x=Number(x0),history=[];
  if(!Number.isFinite(x))throw new NumericalMathematicsError("FINITE_REQUIRED","Fixed-point initial value must be finite");
  for(var i=0;i<options.maxIterations;i++){
    var next=fn.evaluate(x),step=Math.abs(next-x);history.push({iteration:i+1,x:next,step:step});
    if(step<=options.absTol+options.relTol*Math.max(1,Math.abs(next))){
      var derivative=C.numericalDerivative(source,variable,next,{step:Math.sqrt(Number.EPSILON)*Math.max(1,Math.abs(next))}).value,
        contraction=Math.abs(derivative);
      return {fixedPoint:next,iterations:i+1,step:step,localDerivative:derivative,localContraction:contraction,history:history,converged:true,method:"fixed-point",
        toString:function(){return variable+" ≈ "+M.formatNumber(next,12)+"; |g'| ≈ "+M.formatNumber(contraction,8)+"; iterations = "+(i+1);}};
    }
    if(!Number.isFinite(next))throw new NumericalConvergenceError("Fixed-point iteration became non-finite",{iteration:i+1});
    x=next;
  }
  throw new NumericalConvergenceError("Fixed-point iteration exceeded its iteration budget",{iterations:options.maxIterations,last:x});
}
function rootComparison(source,variable,a,b,x0,x1,options){
  options=Object.assign({absTol:1e-12,relTol:1e-10,maxIterations:200},options||{});
  var methods=[
    ["bisection",function(){return C.bisection(source,variable,a,b,options);}],
    ["newton",function(){return C.newton(source,variable,x0,options);}],
    ["secant",function(){return C.secant(source,variable,x0,x1,options);}],
    ["hybrid",function(){return C.hybridRoot(source,variable,a,b,options);}]
  ],results=[];
  methods.forEach(function(item){
    try{var r=item[1]();results.push({method:item[0],converged:true,root:r.root,residual:r.residual,iterations:r.iterations,evaluations:r.evaluations});}
    catch(e){results.push({method:item[0],converged:false,error:e.code||e.message,message:e.message});}
  });
  var successful=results.filter(function(r){return r.converged;});
  if(!successful.length)throw new NumericalConvergenceError("No root method converged",{results:results});
  successful.sort(function(x,y){return x.residual-y.residual;});var reference=successful[0].root;
  results.forEach(function(r){if(r.converged)r.agreement=Math.abs(r.root-reference);});
  return {results:results,reference:reference,toString:function(){return results.map(function(r){return r.converged?r.method+": x≈"+M.formatNumber(r.root,11)+", |f|="+M.formatNumber(r.residual,4)+", iter="+r.iterations:r.method+": "+r.error;}).join("; ");}};
}

/* Interpolation --------------------------------------------------------- */
function barycentricWeights(x){
  uniqueNodes(x);var n=x.length,w=Array(n);
  for(var i=0;i<n;i++){var p=1;for(var j=0;j<n;j++)if(i!==j)p*=x[i]-x[j];w[i]=1/p;}
  return w;
}
function barycentricInterpolation(x,y,t){
  if(x.length!==y.length||!x.length)throw new NumericalMathematicsError("SHAPE_ERROR","Interpolation x/y lists must have equal nonzero length");
  var w=barycentricWeights(x);
  for(var i=0;i<x.length;i++)if(Math.abs(t-x[i])<=2*Number.EPSILON*Math.max(1,Math.abs(t),Math.abs(x[i])))return {value:y[i],weights:w,nodes:x.slice(),method:"barycentric-lagrange"};
  var num=0,den=0;for(var i=0;i<x.length;i++){var q=w[i]/(t-x[i]);num+=q*y[i];den+=q;}
  return {value:num/den,weights:w,nodes:x.slice(),method:"barycentric-lagrange"};
}
function dividedDifferences(x,y){
  if(x.length!==y.length||!x.length)throw new NumericalMathematicsError("SHAPE_ERROR","Interpolation x/y lists must have equal nonzero length");
  uniqueNodes(x);var c=y.slice(),n=x.length;
  for(var j=1;j<n;j++)for(var i=n-1;i>=j;i--)c[i]=(c[i]-c[i-1])/(x[i]-x[i-j]);
  return c;
}
function newtonInterpolation(x,y,t){
  var c=dividedDifferences(x,y),v=c[c.length-1];
  for(var i=c.length-2;i>=0;i--)v=c[i]+(t-x[i])*v;
  return {value:v,coefficients:c,nodes:x.slice(),method:"newton-divided-differences"};
}
function hermiteInterpolation(x,y,dy,t){
  if(x.length!==y.length||x.length!==dy.length||!x.length)throw new NumericalMathematicsError("SHAPE_ERROR","Hermite x/y/derivative lists must have equal nonzero length");
  uniqueNodes(x);var n=x.length,z=Array(2*n),Q=Array.from({length:2*n},function(){return Array(2*n).fill(0);});
  for(var i=0;i<n;i++){
    z[2*i]=z[2*i+1]=x[i];Q[2*i][0]=Q[2*i+1][0]=y[i];Q[2*i+1][1]=dy[i];
    Q[2*i][1]=i===0?dy[i]:(Q[2*i][0]-Q[2*i-1][0])/(z[2*i]-z[2*i-1]);
  }
  for(var j=2;j<2*n;j++)for(var i=j;i<2*n;i++)Q[i][j]=(Q[i][j-1]-Q[i-1][j-1])/(z[i]-z[i-j]);
  var coeff=Array.from({length:2*n},function(_,i){return Q[i][i];}),v=coeff[coeff.length-1];
  for(var k=coeff.length-2;k>=0;k--)v=coeff[k]+(t-z[k])*v;
  return {value:v,coefficients:coeff,nodes:z,method:"hermite-divided-differences"};
}
function solveTridiagonal(a,b,c,d){
  var n=b.length,cp=c.slice(),dp=d.slice(),bp=b.slice();
  for(var i=1;i<n;i++){
    if(Math.abs(bp[i-1])<1e-15)throw new NumericalMathematicsError("SINGULAR_SYSTEM","Tridiagonal pivot is numerically zero");
    var m=a[i]/bp[i-1];bp[i]-=m*cp[i-1];dp[i]-=m*dp[i-1];
  }
  var x=Array(n);x[n-1]=dp[n-1]/bp[n-1];
  for(var i=n-2;i>=0;i--)x[i]=(dp[i]-cp[i]*x[i+1])/bp[i];
  return x;
}
function naturalCubicSpline(x,y,t){
  if(x.length!==y.length||x.length<2)throw new NumericalMathematicsError("SHAPE_ERROR","Spline needs at least two x/y nodes");
  for(var i=1;i<x.length;i++)if(!(x[i]>x[i-1]))throw new NumericalMathematicsError("NODE_ORDER","Spline nodes must be strictly increasing");
  var n=x.length,h=Array(n-1);for(var i=0;i<n-1;i++)h[i]=x[i+1]-x[i];
  var m=Array(n).fill(0);
  if(n>2){
    var N=n-2,a=Array(N).fill(0),b=Array(N).fill(0),c=Array(N).fill(0),d=Array(N).fill(0);
    for(var j=0;j<N;j++){var i=j+1;a[j]=j===0?0:h[i-1];b[j]=2*(h[i-1]+h[i]);c[j]=j===N-1?0:h[i];d[j]=6*((y[i+1]-y[i])/h[i]-(y[i]-y[i-1])/h[i-1]);}
    var inner=solveTridiagonal(a,b,c,d);for(var j=0;j<N;j++)m[j+1]=inner[j];
  }
  var seg;if(t<=x[0])seg=0;else if(t>=x[n-1])seg=n-2;else{seg=0;while(seg<n-2&&t>x[seg+1])seg++;}
  var hs=h[seg],A1=(x[seg+1]-t)/hs,B1=(t-x[seg])/hs,
    value=A1*y[seg]+B1*y[seg+1]+((Math.pow(A1,3)-A1)*m[seg]+(Math.pow(B1,3)-B1)*m[seg+1])*hs*hs/6;
  return {value:value,secondDerivatives:m,segment:seg,method:"natural-cubic-spline"};
}

/* Numerical differentiation -------------------------------------------- */
function finiteDifference(source,variable,x,h,method,derivativeOrder){
  method=String(method||"central").toLowerCase();derivativeOrder=derivativeOrder===undefined?1:Number(derivativeOrder);
  x=Number(x);h=Math.abs(Number(h));if(!(h>0)||!Number.isFinite(x))throw new NumericalMathematicsError("INVALID_STEP","Finite-difference x must be finite and h > 0");
  var fn=evaluator(source,variable),f=function(z){return fn.evaluate(z);},value,formalOrder;
  if(derivativeOrder===1){
    if(method==="forward"){value=(f(x+h)-f(x))/h;formalOrder=1;}
    else if(method==="backward"){value=(f(x)-f(x-h))/h;formalOrder=1;}
    else if(method==="central"){value=(f(x+h)-f(x-h))/(2*h);formalOrder=2;}
    else if(method==="fivepoint"){value=(-f(x+2*h)+8*f(x+h)-8*f(x-h)+f(x-2*h))/(12*h);formalOrder=4;}
    else throw new UnsupportedNumericalMethodError("First derivative methods: forward, backward, central, fivepoint");
  }else if(derivativeOrder===2){
    if(method==="central"){value=(f(x+h)-2*f(x)+f(x-h))/(h*h);formalOrder=2;}
    else if(method==="fivepoint"){value=(-f(x+2*h)+16*f(x+h)-30*f(x)+16*f(x-h)-f(x-2*h))/(12*h*h);formalOrder=4;}
    else throw new UnsupportedNumericalMethodError("Second derivative methods: central, fivepoint");
  }else throw new UnsupportedNumericalMethodError("U6 finite differences support derivative order 1 or 2");
  return {value:value,method:method,derivativeOrder:derivativeOrder,step:h,formalOrder:formalOrder,evaluations:fn.evaluations};
}
function finiteDifferenceDiagnostic(source,variable,x,h,method,derivativeOrder){
  var coarse=finiteDifference(source,variable,x,h,method,derivativeOrder),fine=finiteDifference(source,variable,x,h/2,method,derivativeOrder),
    r=richardsonExtrapolation(coarse.value,fine.value,coarse.formalOrder,2),truth=null,actualError=null;
  try{
    var d=C.differentiate(source,variable,derivativeOrder||1),v=M.evaluateAst(d.ast,{[variable]:Number(x)},{complex:false,angle:"RAD"},0);truth=M.toNumber(v);if(Number.isFinite(truth))actualError=Math.abs(fine.value-truth);
  }catch(e){}
  return {coarse:coarse,fine:fine,extrapolated:r.extrapolated,errorEstimate:r.errorEstimate,reference:truth,actualFineError:actualError,
    toString:function(){return "D ≈ "+M.formatNumber(r.extrapolated,13)+"; estimated error ≈ "+M.formatNumber(r.errorEstimate,6)+(truth===null?"":"; actual fine error ≈ "+M.formatNumber(actualError,6));}};
}

/* Quadrature ------------------------------------------------------------ */
const GAUSS={
  2:{x:[-0.5773502691896257,0.5773502691896257],w:[1,1]},
  3:{x:[-0.7745966692414834,0,0.7745966692414834],w:[0.5555555555555556,0.8888888888888888,0.5555555555555556]},
  4:{x:[-0.8611363115940526,-0.3399810435848563,0.3399810435848563,0.8611363115940526],w:[0.3478548451374538,0.6521451548625461,0.6521451548625461,0.3478548451374538]},
  5:{x:[-0.906179845938664,-0.5384693101056831,0,0.5384693101056831,0.906179845938664],w:[0.2369268850561891,0.4786286704993665,0.5688888888888889,0.4786286704993665,0.2369268850561891]}
};
function compositeQuadrature(source,variable,a,b,n,method){
  a=Number(a);b=Number(b);n=Number(n);method=String(method||"simpson").toLowerCase();
  if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isInteger(n)||n<1||n>100000)throw new NumericalMathematicsError("INVALID_GRID","Quadrature requires finite bounds and integer n from 1 to 100000");
  var fn=evaluator(source,variable),h=(b-a)/n,sum=0,formalOrder;
  if(method==="midpoint"){for(var i=0;i<n;i++)sum+=fn.evaluate(a+(i+0.5)*h);sum*=h;formalOrder=2;}
  else if(method==="trapezoid"){sum=(fn.evaluate(a)+fn.evaluate(b))/2;for(var i=1;i<n;i++)sum+=fn.evaluate(a+i*h);sum*=h;formalOrder=2;}
  else if(method==="simpson"){
    if(n%2!==0)throw new NumericalMathematicsError("INVALID_GRID","Composite Simpson requires even n");
    sum=fn.evaluate(a)+fn.evaluate(b);for(var i=1;i<n;i++)sum+=(i%2?4:2)*fn.evaluate(a+i*h);sum*=h/3;formalOrder=4;
  }else throw new UnsupportedNumericalMethodError("Composite quadrature methods: midpoint, trapezoid, simpson");
  return {value:sum,method:method,n:n,formalOrder:formalOrder,evaluations:fn.evaluations};
}
function gaussLegendre(source,variable,a,b,points,panels){
  points=Number(points);panels=panels===undefined?1:Number(panels);var rule=GAUSS[points];if(!rule)throw new UnsupportedNumericalMethodError("Gauss-Legendre supports 2, 3, 4, or 5 points");
  a=Number(a);b=Number(b);if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isInteger(panels)||panels<1||panels>100000)throw new NumericalMathematicsError("INVALID_GRID","Gauss-Legendre requires finite bounds and 1–100000 panels");
  var fn=evaluator(source,variable),h=(b-a)/panels,sum=0;
  for(var panel=0;panel<panels;panel++){
    var left=a+panel*h,right=left+h,mid=(left+right)/2,half=h/2,local=0;
    for(var i=0;i<rule.x.length;i++)local+=rule.w[i]*fn.evaluate(mid+half*rule.x[i]);
    sum+=half*local;
  }
  return {value:sum,points:points,panels:panels,formalOrder:2*points,evaluations:fn.evaluations,method:"composite-gauss-legendre-"+points};
}
function quadratureDiagnostic(source,variable,a,b,n,method){
  method=String(method||"simpson").toLowerCase();
  if(method==="adaptive"){
    var ad=C.adaptiveSimpson(source,variable,a,b,{absTol:1e-11,relTol:1e-10,maxDepth:24,maxEvaluations:200000});
    return {value:ad.value,errorEstimate:ad.errorEstimate,method:ad.method,evaluations:ad.evaluations,toString:function(){return "I ≈ "+M.formatNumber(ad.value,14)+"; estimated error ≈ "+M.formatNumber(ad.errorEstimate,6);}};
  }
  if(method.indexOf("gauss")===0){
    var p=Number(method.replace("gauss",""));if(!p)throw new UnsupportedNumericalMethodError("Use gauss2, gauss3, gauss4, or gauss5");
    var gc=gaussLegendre(source,variable,a,b,p,n),gf=gaussLegendre(source,variable,a,b,p,2*n),gr=richardsonExtrapolation(gc.value,gf.value,2*p,2);
    return {value:gr.extrapolated,coarse:gc.value,fine:gf.value,errorEstimate:gr.errorEstimate,formalOrder:2*p,method:"composite-gauss-legendre-"+p+"-richardson",evaluations:gc.evaluations+gf.evaluations,
      toString:function(){return "I ≈ "+M.formatNumber(gr.extrapolated,14)+"; estimated error ≈ "+M.formatNumber(gr.errorEstimate,6)+"; Gauss-"+p;}};
  }
  var coarse=compositeQuadrature(source,variable,a,b,n,method),fine=compositeQuadrature(source,variable,a,b,2*n,method),
    r=richardsonExtrapolation(coarse.value,fine.value,coarse.formalOrder,2);
  return {value:r.extrapolated,coarse:coarse.value,fine:fine.value,errorEstimate:r.errorEstimate,formalOrder:coarse.formalOrder,method:method+"-richardson",evaluations:coarse.evaluations+fine.evaluations,
    toString:function(){return "I ≈ "+M.formatNumber(r.extrapolated,14)+"; estimated error ≈ "+M.formatNumber(r.errorEstimate,6);}};
}

/* Iterative linear systems ---------------------------------------------- */
function diagonalDominance(A){
  var strict=true,weak=true;
  for(var i=0;i<A.length;i++){var off=0;for(var j=0;j<A.length;j++)if(j!==i)off+=Math.abs(A[i][j]);if(Math.abs(A[i][i])<=off)strict=false;if(Math.abs(A[i][i])<off)weak=false;}
  return {strict:strict,weak:weak};
}
function stationarySolve(A,b,x0,method,options){
  options=Object.assign({absTol:1e-10,relTol:1e-9,maxIterations:10000},options||{});
  var n=A.length;if(!n||A.some(function(r){return r.length!==n;})||b.length!==n||x0.length!==n)throw new NumericalMathematicsError("MATRIX_SHAPE_ERROR","Iterative linear solve dimensions must agree");
  for(var i=0;i<n;i++)if(Math.abs(A[i][i])<1e-15)throw new NumericalMathematicsError("ZERO_DIAGONAL","Jacobi/Gauss-Seidel require nonzero diagonal entries");
  var x=x0.slice(),history=[],bn=Math.max(norm2(b),1),dom=diagonalDominance(A);
  for(var it=1;it<=options.maxIterations;it++){
    var xn=x.slice();
    for(var i=0;i<n;i++){
      var s=0;for(var j=0;j<n;j++)if(j!==i)s+=A[i][j]*(method==="gauss-seidel"&&j<i?xn[j]:x[j]);
      xn[i]=(b[i]-s)/A[i][i];
    }
    var res=norm2(residualVec(A,xn,b)),step=norm2(addv(xn,x,-1));history.push({iteration:it,residual:res,step:step});
    if(res<=options.absTol+options.relTol*bn)return {solution:xn,iterations:it,residualNorm:res,relativeResidual:res/bn,history:history,method:method,diagonalDominance:dom,converged:true};
    if(!Number.isFinite(res)||norm2(xn)>1e100)throw new NumericalConvergenceError(method+" iteration diverged",{iteration:it,residual:res});
    x=xn;
  }
  throw new NumericalConvergenceError(method+" exceeded its iteration budget",{iterations:options.maxIterations,residual:history.length?history[history.length-1].residual:null});
}
function conjugateGradient(A,b,x0,options){
  options=Object.assign({absTol:1e-10,relTol:1e-9,maxIterations:10000},options||{});
  var mat=new LA.Matrix(A),n=A.length;if(!mat.isSquare()||b.length!==n||x0.length!==n)throw new NumericalMathematicsError("MATRIX_SHAPE_ERROR","CG dimensions must agree");
  if(!LA.isSymmetric(mat,{relTol:1e-10})||!LA.isPositiveDefinite(mat,{absTol:1e-14,relTol:1e-10}))throw new UnsupportedNumericalMethodError("Conjugate gradient requires a real symmetric positive-definite matrix");
  var x=x0.slice(),r=addv(b,matVec(A,x),-1),p=r.slice(),rs=dot(r,r),bn=Math.max(norm2(b),1),history=[];
  if(Math.sqrt(rs)<=options.absTol+options.relTol*bn)return {solution:x,iterations:0,residualNorm:Math.sqrt(rs),relativeResidual:Math.sqrt(rs)/bn,history:history,method:"conjugate-gradient",converged:true};
  for(var k=1;k<=options.maxIterations;k++){
    var Ap=matVec(A,p),den=dot(p,Ap);if(!(den>0))throw new NumericalConvergenceError("CG lost positive curvature",{iteration:k,denominator:den});
    var alpha=rs/den;x=addv(x,p,alpha);r=addv(r,Ap,-alpha);var rsNew=dot(r,r),rn=Math.sqrt(rsNew);history.push({iteration:k,residual:rn});
    if(rn<=options.absTol+options.relTol*bn)return {solution:x,iterations:k,residualNorm:rn,relativeResidual:rn/bn,history:history,method:"conjugate-gradient",converged:true};
    var beta=rsNew/rs;p=addv(r,p,beta);rs=rsNew;
  }
  throw new NumericalConvergenceError("Conjugate gradient exceeded its iteration budget",{iterations:options.maxIterations});
}
function gaussianSolve(A,b){
  var n=A.length,Mx=A.map(function(r,i){return r.slice().concat([b[i]]);});
  for(var k=0;k<n;k++){
    var p=k,max=Math.abs(Mx[k][k]);for(var i=k+1;i<n;i++)if(Math.abs(Mx[i][k])>max){max=Math.abs(Mx[i][k]);p=i;}
    if(max<1e-14)throw new NumericalMathematicsError("SINGULAR_SYSTEM","Linear system is singular or shift is too close to an eigenvalue");
    if(p!==k){var tmp=Mx[p];Mx[p]=Mx[k];Mx[k]=tmp;}
    for(var i=k+1;i<n;i++){var f=Mx[i][k]/Mx[k][k];for(var j=k;j<=n;j++)Mx[i][j]-=f*Mx[k][j];}
  }
  var x=Array(n).fill(0);for(var i=n-1;i>=0;i--){var s=Mx[i][n];for(var j=i+1;j<n;j++)s-=Mx[i][j]*x[j];x[i]=s/Mx[i][i];}
  return x;
}
function linearSystemDiagnostics(A,b,x){
  var mat=new LA.Matrix(A),res=residualVec(A,x,b),rn=norm2(res),an=mat.frobeniusNorm(),xn=norm2(x),bn=norm2(b),
    backward=rn/Math.max(an*xn+bn,Number.MIN_VALUE),cond=ALA.conditionReport(mat).conditionNumber,
    forwardBound=Number.isFinite(cond)?cond*backward:Infinity;
  return {residualNorm:rn,relativeResidual:rn/Math.max(bn,Number.MIN_VALUE),normwiseBackwardError:backward,conditionNumber:cond,forwardErrorBound:forwardBound,
    toString:function(){return "||r||2 = "+M.formatNumber(rn,8)+"; backward η ≈ "+M.formatNumber(backward,8)+"; κ2η ≈ "+(Number.isFinite(forwardBound)?M.formatNumber(forwardBound,8):"∞");}};
}

/* Eigenvalue iteration -------------------------------------------------- */
function normalize(v){var n=norm2(v);if(!(n>0))throw new NumericalMathematicsError("ZERO_VECTOR","Initial eigenvector guess must be nonzero");return v.map(function(x){return x/n;});}
function rayleigh(A,x){var Ax=matVec(A,x);return dot(x,Ax)/dot(x,x);}
function eigenResidual(A,x,lambda){return norm2(addv(matVec(A,x),x,-lambda));}
function powerIteration(A,x0,options){
  options=Object.assign({tol:1e-10,maxIterations:5000},options||{});var x=normalize(x0),lambda=rayleigh(A,x),history=[];
  for(var k=1;k<=options.maxIterations;k++){
    var y=matVec(A,x),xn=normalize(y),ln=rayleigh(A,xn),res=eigenResidual(A,xn,ln);history.push({iteration:k,eigenvalue:ln,residual:res});
    if(res<=options.tol*Math.max(1,Math.abs(ln)))return {eigenvalue:ln,eigenvector:xn,residual:res,iterations:k,history:history,method:"power-iteration"};
    x=xn;lambda=ln;
  }
  throw new NumericalConvergenceError("Power iteration exceeded its iteration budget",{lastEigenvalue:lambda});
}
function inverseIteration(A,x0,shift,options){
  options=Object.assign({tol:1e-10,maxIterations:1000},options||{});var n=A.length,x=normalize(x0),I=Array.from({length:n},function(_,i){return Array.from({length:n},function(_,j){return i===j?1:0;});}),history=[];
  for(var k=1;k<=options.maxIterations;k++){
    var B=A.map(function(r,i){return r.map(function(v,j){return v-shift*I[i][j];});}),y;
    try{y=gaussianSolve(B,x);}catch(e){
      var l=rayleigh(A,x),res=eigenResidual(A,x,l);if(res<=options.tol*Math.max(1,Math.abs(l)))return {eigenvalue:l,eigenvector:x,residual:res,iterations:k-1,history:history,method:"inverse-iteration",shift:shift};
      throw e;
    }
    x=normalize(y);var lambda=rayleigh(A,x),res=eigenResidual(A,x,lambda);history.push({iteration:k,eigenvalue:lambda,residual:res});
    if(res<=options.tol*Math.max(1,Math.abs(lambda)))return {eigenvalue:lambda,eigenvector:x,residual:res,iterations:k,history:history,method:"inverse-iteration",shift:shift};
  }
  throw new NumericalConvergenceError("Inverse iteration exceeded its iteration budget",{shift:shift});
}
function rayleighQuotientIteration(A,x0,options){
  options=Object.assign({tol:1e-12,maxIterations:100},options||{});var x=normalize(x0),mu=rayleigh(A,x),history=[];
  for(var k=1;k<=options.maxIterations;k++){
    var res=eigenResidual(A,x,mu);if(res<=options.tol*Math.max(1,Math.abs(mu)))return {eigenvalue:mu,eigenvector:x,residual:res,iterations:k-1,history:history,method:"rayleigh-quotient-iteration"};
    var B=A.map(function(r,i){return r.map(function(v,j){return v-(i===j?mu:0);});}),y;
    try{y=gaussianSolve(B,x);}catch(e){
      res=eigenResidual(A,x,mu);if(res<=10*options.tol*Math.max(1,Math.abs(mu)))return {eigenvalue:mu,eigenvector:x,residual:res,iterations:k-1,history:history,method:"rayleigh-quotient-iteration"};
      throw e;
    }
    x=normalize(y);mu=rayleigh(A,x);history.push({iteration:k,eigenvalue:mu,residual:eigenResidual(A,x,mu)});
  }
  throw new NumericalConvergenceError("Rayleigh quotient iteration exceeded its iteration budget",{lastEigenvalue:mu});
}

/* Numerical optimization comparison ------------------------------------ */
function optimizationComparison(source,vars,initial,options){
  var methods=["bfgs","newton","gradient"],results=[];
  methods.forEach(function(method){
    try{var r=OPT.optimizeLocal(source,vars,initial,method,"min",Object.assign({maxIterations:3000},options||{}));results.push({method:method,converged:true,point:r.point,objective:r.objective,iterations:r.iterations,gradientNorm:r.gradientNorm,secondOrder:r.secondOrder.status});}
    catch(e){results.push({method:method,converged:false,error:e.code||e.message,message:e.message});}
  });
  return {results:results,toString:function(){return results.map(function(r){return r.converged?r.method+": f="+M.formatNumber(r.objective,10)+", iter="+r.iterations+", ||g||="+M.formatNumber(r.gradientNorm,4):r.method+": "+r.error;}).join("; ");}};
}

/* Fixed-step ODEs and stability ---------------------------------------- */
function fixedScalarIVP(rhsSource,xVar,yVar,x0,y0,x1,steps,method){
  method=String(method||"rk4").toLowerCase();steps=Number(steps);
  if(!Number.isInteger(steps)||steps<1||steps>100000)throw new NumericalMathematicsError("INVALID_STEPS","Fixed ODE steps must be 1–100000");
  var rhs=ODE.compileSystem([rhsSource],requireVar(xVar),[requireVar(yVar)]),h=(x1-x0)/steps,t=x0,y=y0,points=[{t:t,y:y}];
  function f(tt,yy){return rhs(tt,[yy])[0];}
  for(var i=0;i<steps;i++){
    if(method==="euler")y=y+h*f(t,y);
    else if(method==="heun"){var k1=f(t,y),k2=f(t+h,y+h*k1);y=y+h*(k1+k2)/2;}
    else if(method==="midpoint"){var k1=f(t,y),k2=f(t+h/2,y+h*k1/2);y=y+h*k2;}
    else if(method==="rk4"){var k1=f(t,y),k2=f(t+h/2,y+h*k1/2),k3=f(t+h/2,y+h*k2/2),k4=f(t+h,y+h*k3);y=y+h*(k1+2*k2+2*k3+k4)/6;}
    else throw new UnsupportedNumericalMethodError("Fixed ODE methods: euler, heun, midpoint, rk4");
    t=x0+(i+1)*h;if(!Number.isFinite(y))throw new NumericalConvergenceError("Fixed-step ODE state became non-finite",{iteration:i+1,time:t});points.push({t:t,y:y});
  }
  return {value:y,time:x1,steps:steps,step:h,method:method,points:points,evaluations:rhs.getEvaluations(),formalOrder:method==="euler"?1:(method==="rk4"?4:2)};
}
function odeOrderDiagnostic(rhsSource,xVar,yVar,x0,y0,x1,steps,method){
  var r1=fixedScalarIVP(rhsSource,xVar,yVar,x0,y0,x1,steps,method),r2=fixedScalarIVP(rhsSource,xVar,yVar,x0,y0,x1,2*steps,method),r3=fixedScalarIVP(rhsSource,xVar,yVar,x0,y0,x1,4*steps,method),
    p=observedOrder(r1.value,r2.value,r3.value,2),rich=richardsonExtrapolation(r2.value,r3.value,r3.formalOrder,2);
  return {coarse:r1,fine:r2,finer:r3,observedOrder:p.order,formalOrder:r3.formalOrder,extrapolated:rich.extrapolated,errorEstimate:rich.errorEstimate,
    toString:function(){return "y("+M.formatNumber(x1,8)+") ≈ "+M.formatNumber(rich.extrapolated,13)+"; observed p ≈ "+M.formatNumber(p.order,6)+"; formal p = "+r3.formalOrder+"; error est ≈ "+M.formatNumber(rich.errorEstimate,6);}};
}
function cmul(a,b){return {re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re};}
function cadd(a,b){return {re:a.re+b.re,im:a.im+b.im};}
function cscale(a,s){return {re:a.re*s,im:a.im*s};}
function cdiv(a,b){var d=b.re*b.re+b.im*b.im;return {re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};}
function cpow(z,n){var r={re:1,im:0};for(var i=0;i<n;i++)r=cmul(r,z);return r;}
function cabs(z){return Math.hypot(z.re,z.im);}
function stabilityAmplification(method,re,im){
  method=String(method).toLowerCase();var z={re:Number(re),im:Number(im)},one={re:1,im:0},R;
  if(method==="euler")R=cadd(one,z);
  else if(method==="heun"||method==="midpoint"||method==="rk2")R=cadd(cadd(one,z),cscale(cpow(z,2),1/2));
  else if(method==="rk4")R=cadd(cadd(cadd(cadd(one,z),cscale(cpow(z,2),1/2)),cscale(cpow(z,3),1/6)),cscale(cpow(z,4),1/24));
  else if(method==="backward-euler")R=cdiv(one,{re:1-z.re,im:-z.im});
  else if(method==="implicit-midpoint")R=cdiv({re:1+z.re/2,im:z.im/2},{re:1-z.re/2,im:-z.im/2});
  else throw new UnsupportedNumericalMethodError("Stability methods: euler, heun/rk2, midpoint, rk4, backward-euler, implicit-midpoint");
  var mag=cabs(R);return {method:method,z:z,amplification:R,magnitude:mag,stable:mag<=1+1e-12,toString:function(){return "|R(z)| = "+M.formatNumber(mag,10)+"; "+(mag<=1+1e-12?"stable":"unstable");}};
}
function negativeRealStabilityLimit(method){
  method=String(method).toLowerCase();
  if(method==="backward-euler"||method==="implicit-midpoint")return {left:-Infinity,right:0,method:method};
  var stable=function(x){return stabilityAmplification(method,x,0).magnitude<=1;},lo=-1;
  while(stable(lo)&&lo>-1e6)lo*=2;
  if(lo<=-1e6&&stable(lo))return {left:-Infinity,right:0,method:method};
  var hi=lo/2;
  for(var i=0;i<100;i++){var mid=(lo+hi)/2;if(stable(mid))hi=mid;else lo=mid;}
  return {left:hi,right:0,method:method};
}

/* Command router -------------------------------------------------------- */
function runCommand(raw,options){
  raw=String(raw).trim();options=options||{};var p;

  p=parseSemicolon(raw,"floatinfo");
  if(p){if(p.length!==1)throw new NumericalMathematicsError("ARITY_ERROR","floatinfo expects one number");var fi=floatInfo(numberConstant(p[0]));return commandResult(fi.toString(),"float-info",{value:fi.value,metadata:fi});}

  p=parseSemicolon(raw,"numerror");
  if(p){if(p.length!==2)throw new NumericalMathematicsError("ARITY_ERROR","numerror expects reference; approximation");var er=errorMetrics(numberConstant(p[0]),numberConstant(p[1]));return commandResult(er.toString(),"error-metrics",{value:er.absoluteError,metadata:er});}

  p=parseSemicolon(raw,"cancellation");
  if(p){if(p.length!==2)throw new NumericalMathematicsError("ARITY_ERROR","cancellation expects a; b");var cd=cancellationDiagnostic(numberConstant(p[0]),numberConstant(p[1]));return commandResult(cd.toString(),"cancellation",{value:cd.result,metadata:cd});}

  p=parseSemicolon(raw,"scalarcond");
  if(p){if(p.length!==3)throw new NumericalMathematicsError("ARITY_ERROR","scalarcond expects f; x; x0");var sc=scalarCondition(p[0],p[1],numberConstant(p[2]));return commandResult(sc.toString(),"scalar-conditioning",{value:sc.relativeCondition,metadata:sc});}

  p=parseSemicolon(raw,"richardson");
  if(p){if(p.length<3||p.length>4)throw new NumericalMathematicsError("ARITY_ERROR","richardson expects coarse; fine; order; optional ratio");var rr=richardsonExtrapolation(numberConstant(p[0]),numberConstant(p[1]),numberConstant(p[2]),p[3]===undefined?2:numberConstant(p[3]));return commandResult(rr.toString(),"richardson",{value:rr.extrapolated,metadata:rr});}

  p=parseSemicolon(raw,"convorder");
  if(p){if(p.length<3||p.length>4)throw new NumericalMathematicsError("ARITY_ERROR","convorder expects a_h; a_h/r; a_h/r^2; optional ratio");var co=observedOrder(numberConstant(p[0]),numberConstant(p[1]),numberConstant(p[2]),p[3]===undefined?2:numberConstant(p[3]));return commandResult(co.toString(),"convergence-order",{value:co.order,metadata:co});}

  p=parseSemicolon(raw,"fixedpoint");
  if(p){if(p.length!==3)throw new NumericalMathematicsError("ARITY_ERROR","fixedpoint expects g(x); x; x0");var fp=fixedPoint(p[0],p[1],numberConstant(p[2]),options);return commandResult(fp.toString(),"fixed-point",{value:fp.fixedPoint,metadata:{iterations:fp.iterations,step:fp.step,localContraction:fp.localContraction}});}

  p=parseSemicolon(raw,"rootcompare");
  if(p){if(p.length!==4)throw new NumericalMathematicsError("ARITY_ERROR","rootcompare expects f; x; a,b; x0,x1");var br=splitArgs(p[2]),gu=splitArgs(p[3]);if(br.length!==2||gu.length!==2)throw new NumericalMathematicsError("ARITY_ERROR","rootcompare needs bracket a,b and guesses x0,x1");var rc=rootComparison(p[0],p[1],numberConstant(br[0]),numberConstant(br[1]),numberConstant(gu[0]),numberConstant(gu[1]),options);return commandResult(rc.toString(),"root-comparison",{value:rc.reference,metadata:{results:rc.results}});}

  p=parseSemicolon(raw,"interp");
  if(p){if(p.length!==3)throw new NumericalMathematicsError("ARITY_ERROR","interp expects x-list; y-list; target");var ix=parseNumberList(p[0]),iy=parseNumberList(p[1]),iv=barycentricInterpolation(ix,iy,numberConstant(p[2]));return commandResult("p(x) ≈ "+M.formatNumber(iv.value,14),"interpolation",{value:iv.value,metadata:{method:iv.method,weights:iv.weights,nodes:iv.nodes}});}

  p=parseSemicolon(raw,"newtoninterp");
  if(p){if(p.length!==3)throw new NumericalMathematicsError("ARITY_ERROR","newtoninterp expects x-list; y-list; target");var nx=parseNumberList(p[0]),ny=parseNumberList(p[1]),nv=newtonInterpolation(nx,ny,numberConstant(p[2]));return commandResult("p(x) ≈ "+M.formatNumber(nv.value,14)+"; coeff = "+formatList(nv.coefficients,8),"newton-interpolation",{value:nv.value,metadata:{coefficients:nv.coefficients,nodes:nv.nodes}});}

  p=parseSemicolon(raw,"hermite");
  if(p){if(p.length!==4)throw new NumericalMathematicsError("ARITY_ERROR","hermite expects x-list; y-list; derivative-list; target");var hx=parseNumberList(p[0]),hy=parseNumberList(p[1]),hd=parseNumberList(p[2]),hv=hermiteInterpolation(hx,hy,hd,numberConstant(p[3]));return commandResult("H(x) ≈ "+M.formatNumber(hv.value,14),"hermite-interpolation",{value:hv.value,metadata:{coefficients:hv.coefficients,nodes:hv.nodes}});}

  p=parseSemicolon(raw,"spline");
  if(p){if(p.length!==3)throw new NumericalMathematicsError("ARITY_ERROR","spline expects x-list; y-list; target");var sx=parseNumberList(p[0]),sy=parseNumberList(p[1]),sv=naturalCubicSpline(sx,sy,numberConstant(p[2]));return commandResult("S(x) ≈ "+M.formatNumber(sv.value,14)+"; segment = "+(sv.segment+1),"natural-cubic-spline",{value:sv.value,metadata:{secondDerivatives:sv.secondDerivatives,segment:sv.segment}});}

  p=parseSemicolon(raw,"fdiff");
  if(p){if(p.length<5||p.length>6)throw new NumericalMathematicsError("ARITY_ERROR","fdiff expects f; x; x0; h; method; optional derivative order");var fd=finiteDifferenceDiagnostic(p[0],p[1],numberConstant(p[2]),numberConstant(p[3]),p[4],p[5]===undefined?1:Number(p[5]));return commandResult(fd.toString(),"finite-difference",{value:fd.extrapolated,metadata:{errorEstimate:fd.errorEstimate,reference:fd.reference,actualFineError:fd.actualFineError,method:p[4]}});}

  p=parseSemicolon(raw,"quad");
  if(p){if(p.length!==6)throw new NumericalMathematicsError("ARITY_ERROR","quad expects f; x; a; b; n; method");var qd=quadratureDiagnostic(p[0],p[1],numberConstant(p[2]),numberConstant(p[3]),Number(p[4]),p[5]);return commandResult(qd.toString(),"quadrature",{value:qd.value,metadata:{method:qd.method,errorEstimate:qd.errorEstimate,evaluations:qd.evaluations,formalOrder:qd.formalOrder}});}

  for(const method of ["jacobi","gaussseidel","cg"]){
    p=parseSemicolon(raw,method);
    if(p){
      if(p.length<3||p.length>4)throw new NumericalMathematicsError("ARITY_ERROR",method+" expects A; b; x0; optional max iterations");
      var lm=parseMatrix(p[0]),Arows=numericRows(lm),b=parseNumberList(p[1]),x0=parseNumberList(p[2]),opt=Object.assign({},options);if(p[3]!==undefined)opt.maxIterations=Number(p[3]);
      var lr=method==="cg"?conjugateGradient(Arows,b,x0,opt):stationarySolve(Arows,b,x0,method==="jacobi"?"jacobi":"gauss-seidel",opt);
      return commandResult("x ≈ "+formatList(lr.solution,12)+"; ||r||2 = "+M.formatNumber(lr.residualNorm,6)+"; iterations = "+lr.iterations,"iterative-linear-solve",{value:new LA.Vector(lr.solution),metadata:{method:lr.method,iterations:lr.iterations,residualNorm:lr.residualNorm,relativeResidual:lr.relativeResidual,diagonalDominance:lr.diagonalDominance}});
    }
  }

  p=parseSemicolon(raw,"linsysdiag");
  if(p){if(p.length!==3)throw new NumericalMathematicsError("ARITY_ERROR","linsysdiag expects A; b; approximate x");var dm=parseMatrix(p[0]),dd=linearSystemDiagnostics(numericRows(dm),parseNumberList(p[1]),parseNumberList(p[2]));return commandResult(dd.toString(),"linear-system-diagnostics",{value:dd.normwiseBackwardError,metadata:dd});}

  p=parseSemicolon(raw,"poweriter");
  if(p){if(p.length<2||p.length>3)throw new NumericalMathematicsError("ARITY_ERROR","poweriter expects A; x0; optional max iterations");var pm=parseMatrix(p[0]),po=Object.assign({},options);if(p[2]!==undefined)po.maxIterations=Number(p[2]);var pw=powerIteration(numericRows(pm),parseNumberList(p[1]),po);return commandResult("λ ≈ "+M.formatNumber(pw.eigenvalue,13)+"; residual = "+M.formatNumber(pw.residual,6)+"; iterations = "+pw.iterations,"power-iteration",{value:pw.eigenvalue,metadata:{eigenvector:pw.eigenvector,residual:pw.residual,iterations:pw.iterations}});}

  p=parseSemicolon(raw,"inverseiter");
  if(p){if(p.length<3||p.length>4)throw new NumericalMathematicsError("ARITY_ERROR","inverseiter expects A; x0; shift; optional max iterations");var im=parseMatrix(p[0]),io=Object.assign({},options);if(p[3]!==undefined)io.maxIterations=Number(p[3]);var ir=inverseIteration(numericRows(im),parseNumberList(p[1]),numberConstant(p[2]),io);return commandResult("λ ≈ "+M.formatNumber(ir.eigenvalue,13)+"; residual = "+M.formatNumber(ir.residual,6)+"; iterations = "+ir.iterations,"inverse-iteration",{value:ir.eigenvalue,metadata:{eigenvector:ir.eigenvector,residual:ir.residual,iterations:ir.iterations,shift:ir.shift}});}

  p=parseSemicolon(raw,"rayleighiter");
  if(p){if(p.length<2||p.length>3)throw new NumericalMathematicsError("ARITY_ERROR","rayleighiter expects A; x0; optional max iterations");var rm=parseMatrix(p[0]),ro=Object.assign({},options);if(p[2]!==undefined)ro.maxIterations=Number(p[2]);var rq=rayleighQuotientIteration(numericRows(rm),parseNumberList(p[1]),ro);return commandResult("λ ≈ "+M.formatNumber(rq.eigenvalue,13)+"; residual = "+M.formatNumber(rq.residual,6)+"; iterations = "+rq.iterations,"rayleigh-iteration",{value:rq.eigenvalue,metadata:{eigenvector:rq.eigenvector,residual:rq.residual,iterations:rq.iterations}});}

  p=parseSemicolon(raw,"optcompare");
  if(p){if(p.length!==3)throw new NumericalMathematicsError("ARITY_ERROR","optcompare expects f; variables; initial");var vars=splitArgs(p[1]).map(requireVar),initial=parseNumberList(p[2]),oc=optimizationComparison(p[0],vars,initial,options);return commandResult(oc.toString(),"optimization-comparison",{value:null,metadata:{results:oc.results}});}

  p=parseSemicolon(raw,"odefixed");
  if(p){if(p.length!==8)throw new NumericalMathematicsError("ARITY_ERROR","odefixed expects rhs; x; y; x0; y0; x1; steps; method");var of=fixedScalarIVP(p[0],p[1],p[2],numberConstant(p[3]),numberConstant(p[4]),numberConstant(p[5]),Number(p[6]),p[7]);return commandResult(p[2]+"("+M.formatNumber(of.time,8)+") ≈ "+M.formatNumber(of.value,13)+"; h = "+M.formatNumber(of.step,6),"fixed-ode",{value:of.value,metadata:{method:of.method,steps:of.steps,step:of.step,evaluations:of.evaluations,formalOrder:of.formalOrder}});}

  p=parseSemicolon(raw,"odeorder");
  if(p){if(p.length!==8)throw new NumericalMathematicsError("ARITY_ERROR","odeorder expects rhs; x; y; x0; y0; x1; steps; method");var od=odeOrderDiagnostic(p[0],p[1],p[2],numberConstant(p[3]),numberConstant(p[4]),numberConstant(p[5]),Number(p[6]),p[7]);return commandResult(od.toString(),"ode-order",{value:od.extrapolated,metadata:{observedOrder:od.observedOrder,formalOrder:od.formalOrder,errorEstimate:od.errorEstimate,method:p[7]}});}

  p=parseSemicolon(raw,"stability");
  if(p){if(p.length!==3)throw new NumericalMathematicsError("ARITY_ERROR","stability expects method; Re(z); Im(z)");var st=stabilityAmplification(p[0],numberConstant(p[1]),numberConstant(p[2]));return commandResult(st.toString(),"stability-function",{value:st.magnitude,metadata:{method:st.method,z:st.z,amplification:st.amplification,stable:st.stable}});}

  p=parseSemicolon(raw,"stabinterval");
  if(p){if(p.length!==1)throw new NumericalMathematicsError("ARITY_ERROR","stabinterval expects method");var si=negativeRealStabilityLimit(p[0]);return commandResult("negative-real stability interval: ["+(Number.isFinite(si.left)?M.formatNumber(si.left,12):"-∞")+", 0]","stability-interval",{value:si.left,metadata:si});}

  if(/^numhelp\s*\(\s*\)$/i.test(raw)){
    return commandResult("U6: floatinfo · numerror · cancellation · scalarcond · richardson · convorder · fixedpoint · rootcompare · interp · newtoninterp · hermite · spline · fdiff · quad · jacobi · gaussseidel · cg · linsysdiag · poweriter · inverseiter · rayleighiter · optcompare · odefixed · odeorder · stability · stabinterval","numerical-help",{metadata:{operation:"numhelp"}});
  }
  return null;
}

global.CalcNumerical={
  VERSION:"2.5.0-u6",
  NumericalMathematicsError:NumericalMathematicsError,NumericalConvergenceError:NumericalConvergenceError,UnsupportedNumericalMethodError:UnsupportedNumericalMethodError,
  nextUp:nextUp,nextDown:nextDown,ulp:ulp,floatInfo:floatInfo,errorMetrics:errorMetrics,cancellationDiagnostic:cancellationDiagnostic,scalarCondition:scalarCondition,richardsonExtrapolation:richardsonExtrapolation,observedOrder:observedOrder,
  fixedPoint:fixedPoint,rootComparison:rootComparison,
  barycentricWeights:barycentricWeights,barycentricInterpolation:barycentricInterpolation,dividedDifferences:dividedDifferences,newtonInterpolation:newtonInterpolation,hermiteInterpolation:hermiteInterpolation,naturalCubicSpline:naturalCubicSpline,
  finiteDifference:finiteDifference,finiteDifferenceDiagnostic:finiteDifferenceDiagnostic,
  compositeQuadrature:compositeQuadrature,gaussLegendre:gaussLegendre,quadratureDiagnostic:quadratureDiagnostic,
  stationarySolve:stationarySolve,conjugateGradient:conjugateGradient,linearSystemDiagnostics:linearSystemDiagnostics,
  powerIteration:powerIteration,inverseIteration:inverseIteration,rayleighQuotientIteration:rayleighQuotientIteration,
  optimizationComparison:optimizationComparison,
  fixedScalarIVP:fixedScalarIVP,odeOrderDiagnostic:odeOrderDiagnostic,stabilityAmplification:stabilityAmplification,negativeRealStabilityLimit:negativeRealStabilityLimit,
  runCommand:runCommand
};
})(window);
