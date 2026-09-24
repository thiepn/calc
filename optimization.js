(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
const MV=global.CalcMultivariable;
const LA=global.CalcLinearAlgebra;
if(!M||!A||!C||!MV||!LA)throw new Error("CalcMath, CalcAlgebra, CalcCalculus, CalcMultivariable, and CalcLinearAlgebra must load before CalcOptimization");

class OptimizationError extends M.CalcError{
  constructor(code,message,details){super(code||"OPTIMIZATION_ERROR",message,undefined,undefined,details);}
}
class UnsupportedOptimizationError extends OptimizationError{
  constructor(message,details){super("UNSUPPORTED_OPTIMIZATION",message,details);}
}
class OptimizationConvergenceError extends OptimizationError{
  constructor(message,details){super("OPTIMIZATION_CONVERGENCE",message||"Optimization did not converge",details);}
}
class UnboundedProblemError extends OptimizationError{
  constructor(message,details){super("UNBOUNDED_PROBLEM",message||"Optimization problem is unbounded",details);}
}
class InfeasibleProblemError extends OptimizationError{
  constructor(message,details){super("INFEASIBLE_PROBLEM",message||"Optimization problem is infeasible",details);}
}

function rat(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function lit(v){return {type:"literal",value:v,start:0,end:0};}
function id(name){return {type:"identifier",name:name,start:0,end:0};}
function unary(op,arg){return {type:"unary",op:op,arg:arg,start:0,end:0};}
function bin(op,left,right){return {type:"binary",op:op,left:left,right:right,start:0,end:0};}
function cloneAst(ast){return M.deserializeAst(M.serializeAst(ast));}
function asExpr(source){return source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source);}
function simplify(ast){return A.simplifyAst(ast);}
function expr(ast){return new A.SymbolicExpression(simplify(ast));}
function zeroAst(ast){var s=simplify(ast);return s.type==="literal"&&M.isZero(s.value);}
function commandResult(display,kind,details){
  details=details||{};
  return {
    value:details.value===undefined?null:details.value,
    display:String(display),approx:details.approx||"",
    exact:details.exact===undefined?true:!!details.exact,
    kind:kind||"optimization",
    symbolic:details.symbolic===undefined?true:!!details.symbolic,
    metadata:Object.assign({numericKind:kind||"optimization",exact:details.exact===undefined?true:!!details.exact,u4:true},details.metadata||{})
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
function requireVar(v){
  v=String(v||"").trim();if(!/^[A-Za-z_]\w*$/.test(v))throw new OptimizationError("INVALID_VARIABLE","Invalid variable '"+v+"'");return v;
}
function parseVars(source){
  var vars=splitArgs(source).map(requireVar);
  if(!vars.length||new Set(vars).size!==vars.length)throw new OptimizationError("INVALID_VARIABLE","Optimization variables must be nonempty and distinct");
  return vars;
}
function parseOptionalExprList(source){
  source=String(source||"").trim();if(!source||source==="-")return [];
  return splitArgs(source).map(asExpr);
}
function parseExact(source){
  if(source instanceof M.Rational)return source;
  if(typeof source==="number"){if(!Number.isFinite(source))throw new OptimizationError("FINITE_REQUIRED","Expected a finite constant");return M.Rational.fromDecimal(String(source));}
  var e=asExpr(source);if(e.variables().length)throw new OptimizationError("CONSTANT_REQUIRED","Expected a constant expression",{source:String(source)});
  var v=M.evaluateAst(e.ast,{}, {complex:false,angle:"RAD"},0);
  if(v instanceof M.Complex)throw new OptimizationError("REAL_REQUIRED","Expected a real constant");
  return v;
}
function parseNumber(source){var n=M.toNumber(parseExact(source));if(!Number.isFinite(n))throw new OptimizationError("FINITE_REQUIRED","Expected a finite real constant");return n;}
function evalExpr(sourceOrExpr,env){
  var v;
  try{v=M.evaluateAst(asExpr(sourceOrExpr).ast,env||{}, {complex:false,angle:"RAD"},0);}
  catch(e){throw new OptimizationError("NON_FINITE_OBJECTIVE","Objective/constraint evaluation is undefined",{cause:e.code||e.message,env:env});}
  var n=M.toNumber(v);if(!Number.isFinite(n))throw new OptimizationError("NON_FINITE_OBJECTIVE","Objective/constraint evaluation is non-finite",{env:env});return n;
}
function substitute(sourceOrExpr,mapping){
  var e=asExpr(sourceOrExpr),parsed={};
  Object.keys(mapping||{}).forEach(function(k){
    var v=mapping[k];
    parsed[k]=v instanceof A.SymbolicExpression?cloneAst(v.ast):v&&v.type?cloneAst(v):typeof v==="string"?M.parseExpression(v):lit(v);
  });
  return new A.SymbolicExpression(simplify(A.substituteAst(e.ast,parsed)),{restrictions:e.restrictions});
}
function pointEnv(vars,point){var env={};vars.forEach(function(v,i){env[v]=point[i];});return env;}
function formatPoint(vars,point,p){return vars.map(function(v,i){return v+" = "+M.formatNumber(point[i],p||10);}).join(", ");}
function norm(v){return Math.sqrt(v.reduce(function(s,x){return s+x*x;},0));}
function dot(a,b){var s=0;for(var i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function matVec(A,x){return A.map(function(row){return dot(row,x);});}
function eye(n){return Array.from({length:n},function(_,i){return Array.from({length:n},function(_,j){return i===j?1:0;});});}
function addVec(a,b,scale){scale=scale===undefined?1:scale;return a.map(function(x,i){return x+scale*b[i];});}
function outer(a,b){return a.map(function(x){return b.map(function(y){return x*y;});});}
function addMat(A,B,scale){scale=scale===undefined?1:scale;return A.map(function(row,i){return row.map(function(x,j){return x+scale*B[i][j];});});}
function mulMat(A,B){
  var R=Array.from({length:A.length},function(){return Array(B[0].length).fill(0);});
  for(var i=0;i<A.length;i++)for(var k=0;k<B.length;k++)for(var j=0;j<B[0].length;j++)R[i][j]+=A[i][k]*B[k][j];
  return R;
}
function transpose(A){return Array.from({length:A[0].length},function(_,j){return A.map(function(r){return r[j];});});}
function solveNumeric(A,b,tol){
  tol=tol||1e-12;var n=A.length;
  if(!n||A.some(function(r){return r.length!==n;})||b.length!==n)throw new OptimizationError("SHAPE_ERROR","Numeric linear solve requires a square system");
  var Mx=A.map(function(r,i){return r.slice().concat([b[i]]);});
  for(var k=0;k<n;k++){
    var p=k,max=Math.abs(Mx[k][k]);
    for(var i=k+1;i<n;i++)if(Math.abs(Mx[i][k])>max){max=Math.abs(Mx[i][k]);p=i;}
    if(max<=tol)throw new OptimizationError("SINGULAR_SYSTEM","Optimization linear system is singular or ill-conditioned",{pivot:k});
    if(p!==k){var tmp=Mx[p];Mx[p]=Mx[k];Mx[k]=tmp;}
    var piv=Mx[k][k];for(var j=k;j<=n;j++)Mx[k][j]/=piv;
    for(var r=0;r<n;r++)if(r!==k){
      var f=Mx[r][k];if(Math.abs(f)<=tol)continue;
      for(var c=k;c<=n;c++)Mx[r][c]-=f*Mx[k][c];
    }
  }
  return Mx.map(function(r){return r[n];});
}

/* Objective differential model ----------------------------------------- */
class ObjectiveModel{
  constructor(source,vars,sense){
    this.expression=asExpr(source);this.vars=vars.slice();this.sense=sense==="max"?-1:1;
    var allowed=new Set(vars);
    this.expression.variables().forEach(function(v){if(!allowed.has(v))throw new UnsupportedOptimizationError("Objective contains undeclared variable '"+v+"'");});
    this.gradientExpr=C.gradient(this.expression,this.vars);
    this.hessianExpr=C.hessian(this.expression,this.vars);
    this.evaluations=0;
  }
  env(point){return pointEnv(this.vars,point);}
  rawValue(point){this.evaluations++;return evalExpr(this.expression,this.env(point));}
  value(point){return this.sense*this.rawValue(point);}
  gradient(point){
    var env=this.env(point),s=this.sense;
    return this.gradientExpr.map(function(e){return s*evalExpr(e,env);});
  }
  hessian(point){
    var env=this.env(point),s=this.sense;
    return this.hessianExpr.map(function(row){return row.map(function(e){return s*evalExpr(e,env);});});
  }
}

/* Convexity / curvature ------------------------------------------------- */
function symmetricEigenvalues(H){
  var matrix=new LA.Matrix(H),d=LA.jacobiEigenSymmetric(matrix,{absTol:1e-12,relTol:1e-10,maxIterations:500,rankTol:1e-12});
  return d.values.slice().sort(function(a,b){return a-b;});
}
function hessianConstant(hessian,vars){
  var set=new Set(vars);
  return hessian.every(function(row){return row.every(function(e){return e.variables().every(function(v){return !set.has(v);});});});
}
function classifyEigenvalues(values,tol){
  tol=tol||1e-9;
  var allPos=values.every(function(v){return v>tol;}),allNeg=values.every(function(v){return v<-tol;}),
    allNonNeg=values.every(function(v){return v>=-tol;}),allNonPos=values.every(function(v){return v<=tol;});
  if(allPos)return {matrixClass:"positive definite",curvature:"strictly convex"};
  if(allNeg)return {matrixClass:"negative definite",curvature:"strictly concave"};
  if(allNonNeg)return {matrixClass:"positive semidefinite",curvature:"convex"};
  if(allNonPos)return {matrixClass:"negative semidefinite",curvature:"concave"};
  return {matrixClass:"indefinite",curvature:"indefinite"};
}
function convexity(source,vars,point){
  var e=asExpr(source),H=C.hessian(e,vars),globalCertificate=!point;
  if(!point&&!hessianConstant(H,vars))throw new UnsupportedOptimizationError("Global convexity certification currently requires a constant Hessian (for example, a quadratic objective) or an explicit evaluation point");
  var env={};
  if(point){
    if(point.length!==vars.length)throw new OptimizationError("SHAPE_ERROR","Convexity point dimension must match variables");
    env=pointEnv(vars,point.map(parseNumber));
  }
  var numeric=H.map(function(row){return row.map(function(x){return evalExpr(x,env);});}),eig=symmetricEigenvalues(numeric),cls=classifyEigenvalues(eig,1e-9),
    classification=globalCertificate?cls.curvature:cls.matrixClass+" Hessian at point",
    scope=globalCertificate?"global quadratic certificate":"pointwise curvature";
  return {classification:classification,matrixClass:cls.matrixClass,eigenvalues:eig,hessian:H,numericHessian:numeric,global:globalCertificate,
    toString:function(){return scope+": "+classification+"; eigenvalues = ["+eig.map(function(v){return M.formatNumber(v,8);}).join(", ")+"]";}};
}

/* One-dimensional bounded search --------------------------------------- */
function goldenSection(source,variable,aSource,bSource,sense,options){
  options=options||{};variable=requireVar(variable);var e=asExpr(source);
  if(e.variables().some(function(v){return v!==variable;}))throw new UnsupportedOptimizationError("Golden-section objective may depend only on "+variable);
  var a=parseNumber(aSource),b=parseNumber(bSource);if(!(b>a))throw new OptimizationError("INVALID_INTERVAL","Golden-section interval requires b > a");
  var sign=sense==="max"?-1:1,tol=options.tol||1e-10,maxIterations=options.maxIterations||1000,phi=(Math.sqrt(5)-1)/2,
    c=b-phi*(b-a),d=a+phi*(b-a),fc=sign*evalExpr(e,{[variable]:c}),fd=sign*evalExpr(e,{[variable]:d}),iterations=0;
  for(;iterations<maxIterations&&Math.abs(b-a)>tol*Math.max(1,Math.abs(a),Math.abs(b));iterations++){
    if(fc<=fd){b=d;d=c;fd=fc;c=b-phi*(b-a);fc=sign*evalExpr(e,{[variable]:c});}
    else{a=c;c=d;fc=fd;d=a+phi*(b-a);fd=sign*evalExpr(e,{[variable]:d});}
  }
  if(iterations>=maxIterations)throw new OptimizationConvergenceError("Golden-section search exceeded its iteration budget",{interval:[a,b]});
  var x=(a+b)/2,value=evalExpr(e,{[variable]:x});
  return {variable:variable,point:x,value:value,iterations:iterations,interval:[a,b],sense:sense||"min",method:"golden-section",
    toString:function(){return variable+" ≈ "+M.formatNumber(x,12)+"; f ≈ "+M.formatNumber(value,12);}};
}

/* Local unconstrained numerical optimization ---------------------------- */

function secondOrderStatus(model,point){
  var H=model.hessian(point),eig=symmetricEigenvalues(H),cls=classifyEigenvalues(eig,1e-8),constant=hessianConstant(model.hessianExpr,model.vars),
    status;
  if(cls.matrixClass==="positive definite")status=constant?"global strict optimum (quadratic certificate)":"strict local optimum";
  else if(cls.matrixClass==="positive semidefinite")status=constant?"global optimum set/candidate (convex quadratic certificate)":"stationary candidate; second-order test inconclusive";
  else status="stationary point has a negative-curvature direction";
  return {hessian:H,eigenvalues:eig,matrixClass:cls.matrixClass,status:status,constantHessian:constant};
}
function finishLocalResult(model,vars,x,f,g,iter,method,sense,history){
  var so=secondOrderStatus(model,x);
  if(so.matrixClass!=="positive definite"&&so.matrixClass!=="positive semidefinite")
    throw new OptimizationError("WRONG_STATIONARY_POINT","Solver converged to a stationary point that fails the second-order minimum condition for the transformed objective",{point:x,eigenvalues:so.eigenvalues,sense:sense||"min"});
  var objective=model.sense*f,gn=norm(g),label=so.status;
  if(sense==="max")label=label.replace(/minimum/g,"maximum").replace(/optimum/g,"optimum");
  return {point:x,objective:objective,gradientNorm:gn,iterations:iter,evaluations:model.evaluations,method:method,sense:sense||"min",history:history,converged:true,secondOrder:so,
    toString:function(){return label+": "+formatPoint(vars,x,10)+"; f = "+M.formatNumber(objective,12)+"; ||grad|| = "+M.formatNumber(gn,4);}};
}

function armijo(model,x,f,g,p,options){
  var c1=options.armijo||1e-4,shrink=options.shrink||0.5,max=options.maxLineSearch||50,descent=dot(g,p);
  if(!(descent<0))return null;
  var alpha=1;
  for(var i=0;i<max;i++){
    var trial=addVec(x,p,alpha),fv;
    try{fv=model.value(trial);}catch(e){alpha*=shrink;continue;}
    if(fv<=f+c1*alpha*descent)return {alpha:alpha,point:trial,value:fv,iterations:i+1};
    alpha*=shrink;
  }
  return null;
}
function optimizeLocal(source,vars,initial,method,sense,options){
  options=Object.assign({gradTol:1e-8,stepTol:1e-12,maxIterations:500,maxLineSearch:50,armijo:1e-4,shrink:0.5},options||{});
  if(initial.length!==vars.length)throw new OptimizationError("SHAPE_ERROR","Initial point dimension must match variables");
  var x=initial.map(parseNumber),model=new ObjectiveModel(source,vars,sense),n=vars.length,Hinv=eye(n),history=[],f=model.value(x),g=model.gradient(x);
  method=(method||"bfgs").toLowerCase();
  if(["bfgs","newton","gradient"].indexOf(method)<0)throw new OptimizationError("INVALID_METHOD","Optimization method must be bfgs, newton, or gradient");
  for(var iter=0;iter<options.maxIterations;iter++){
    var gn=norm(g);
    history.push({iteration:iter,point:x.slice(),objective:model.sense*f,gradientNorm:gn});
    if(gn<=options.gradTol)return finishLocalResult(model,vars,x,f,g,iter,method,sense,history);
    var p;
    if(method==="gradient")p=g.map(function(v){return -v;});
    else if(method==="newton"){
      try{p=solveNumeric(model.hessian(x),g.map(function(v){return -v;}),1e-12);}
      catch(e){p=g.map(function(v){return -v;});}
      if(dot(g,p)>=-1e-14*gn*Math.max(1,norm(p)))p=g.map(function(v){return -v;});
    }else{
      p=matVec(Hinv,g).map(function(v){return -v;});
      if(dot(g,p)>=-1e-14*gn*Math.max(1,norm(p))){Hinv=eye(n);p=g.map(function(v){return -v;});}
    }
    var ls=armijo(model,x,f,g,p,options);
    if(!ls)throw new OptimizationConvergenceError("Line search could not find a finite descent step",{iteration:iter,point:x,gradientNorm:gn,method:method});
    var xNew=ls.point,fNew=ls.value,gNew=model.gradient(xNew),step=addVec(xNew,x,-1);
    if(method==="bfgs"){
      var y=addVec(gNew,g,-1),ys=dot(y,step);
      if(ys>1e-12*norm(y)*Math.max(1e-16,norm(step))){
        var rho=1/ys,I=eye(n),sy=outer(step,y),ysOuter=outer(y,step),
          left=addMat(I,sy,-rho),right=addMat(I,ysOuter,-rho);
        Hinv=addMat(mulMat(mulMat(left,Hinv),right),outer(step,step),rho);
      }else Hinv=eye(n);
    }
    if(norm(step)<=options.stepTol*Math.max(1,norm(x))){
      x=xNew;f=fNew;g=gNew;
      if(norm(g)<=Math.max(options.gradTol*10,1e-7))continue;
      throw new OptimizationConvergenceError("Optimization step stagnated before first-order convergence",{iteration:iter+1,point:x,gradientNorm:norm(g),method:method});
    }
    x=xNew;f=fNew;g=gNew;
  }
  throw new OptimizationConvergenceError("Optimization exceeded its iteration budget",{iterations:options.maxIterations,point:x,gradientNorm:norm(g),method:method});
}


/* Bound-constrained projected gradient ---------------------------------- */
function projectBox(x,lower,upper){return x.map(function(v,i){return Math.min(upper[i],Math.max(lower[i],v));});}
function boxOptimize(source,vars,lowerSources,upperSources,initialSources,sense,options){
  options=Object.assign({gradTol:1e-8,stepTol:1e-12,maxIterations:2000,maxLineSearch:60,armijo:1e-4,shrink:0.5},options||{});
  if(lowerSources.length!==vars.length||upperSources.length!==vars.length||initialSources.length!==vars.length)throw new OptimizationError("SHAPE_ERROR","Box bounds, initial point, and variables must have matching dimensions");
  var lower=lowerSources.map(parseNumber),upper=upperSources.map(parseNumber);
  for(var i=0;i<vars.length;i++)if(!(upper[i]>lower[i]))throw new OptimizationError("INVALID_BOUNDS","Each upper bound must exceed its lower bound",{index:i});
  var model=new ObjectiveModel(source,vars,sense),x=projectBox(initialSources.map(parseNumber),lower,upper),f=model.value(x),history=[];
  for(var iter=0;iter<options.maxIterations;iter++){
    var g=model.gradient(x),unitTrial=projectBox(addVec(x,g,-1),lower,upper),mapping=addVec(x,unitTrial,-1),pg=norm(mapping);
    history.push({iteration:iter,point:x.slice(),objective:model.sense*f,projectedGradientNorm:pg});
    if(pg<=options.gradTol){
      return {point:x,objective:model.sense*f,projectedGradientNorm:pg,iterations:iter,evaluations:model.evaluations,method:"projected-gradient",sense:sense||"min",lower:lower,upper:upper,history:history,converged:true,
        toString:function(){return "box KKT candidate: "+formatPoint(vars,x,10)+"; f = "+M.formatNumber(this.objective,12)+"; projected gradient = "+M.formatNumber(pg,4);}};
    }
    var alpha=1,accepted=null;
    for(var ls=0;ls<options.maxLineSearch;ls++){
      var trial=projectBox(addVec(x,g,-alpha),lower,upper),d=addVec(trial,x,-1);
      if(norm(d)<=options.stepTol*Math.max(1,norm(x))){alpha*=options.shrink;continue;}
      var fv;try{fv=model.value(trial);}catch(e){alpha*=options.shrink;continue;}
      if(fv<=f+options.armijo*dot(g,d)){accepted={point:trial,value:fv,step:d};break;}
      alpha*=options.shrink;
    }
    if(!accepted)throw new OptimizationConvergenceError("Projected-gradient line search could not find a feasible descent step",{iteration:iter,point:x});
    x=accepted.point;f=accepted.value;
  }
  throw new OptimizationConvergenceError("Projected-gradient optimization exceeded its iteration budget",{iterations:options.maxIterations,point:x});
}

/* KKT checker ----------------------------------------------------------- */
function gradientNumeric(e,vars,point){var env=pointEnv(vars,point);return C.gradient(e,vars).map(function(d){return evalExpr(d,env);});}
function kktCheck(objective,vars,equalities,inequalities,point,lambda,mu,tol){
  tol=tol||1e-8;if(point.length!==vars.length)throw new OptimizationError("SHAPE_ERROR","KKT point dimension must match variables");
  if(lambda.length!==equalities.length||mu.length!==inequalities.length)throw new OptimizationError("SHAPE_ERROR","KKT multiplier dimensions must match constraints");
  point=point.map(parseNumber);lambda=lambda.map(parseNumber);mu=mu.map(parseNumber);
  var env=pointEnv(vars,point),stationarity=gradientNumeric(objective,vars,point),eqResiduals=[],ineqValues=[],complementarity=[];
  equalities.forEach(function(g,j){
    var gr=gradientNumeric(g,vars,point);for(var i=0;i<vars.length;i++)stationarity[i]+=lambda[j]*gr[i];
    eqResiduals.push(evalExpr(g,env));
  });
  inequalities.forEach(function(h,j){
    var gr=gradientNumeric(h,vars,point);for(var i=0;i<vars.length;i++)stationarity[i]+=mu[j]*gr[i];
    var hv=evalExpr(h,env);ineqValues.push(hv);complementarity.push(mu[j]*hv);
  });
  var stationarityNorm=norm(stationarity),eqMax=eqResiduals.length?Math.max.apply(null,eqResiduals.map(Math.abs)):0,
    ineqViolation=ineqValues.length?Math.max(0,Math.max.apply(null,ineqValues)):0,
    dualViolation=mu.length?Math.max(0,-Math.min.apply(null,mu)):0,
    compMax=complementarity.length?Math.max.apply(null,complementarity.map(Math.abs)):0,
    satisfied=stationarityNorm<=tol&&eqMax<=tol&&ineqViolation<=tol&&dualViolation<=tol&&compMax<=tol;
  return {satisfied:satisfied,stationarity:stationarity,stationarityNorm:stationarityNorm,equalityResidual:eqMax,inequalityViolation:ineqViolation,dualViolation:dualViolation,complementarityResidual:compMax,
    point:point,lambda:lambda,mu:mu,toString:function(){return (satisfied?"KKT satisfied":"KKT not satisfied")+"; stationarity "+M.formatNumber(stationarityNorm,4)+", primal "+M.formatNumber(Math.max(eqMax,ineqViolation),4)+", dual "+M.formatNumber(dualViolation,4)+", complementarity "+M.formatNumber(compMax,4);}};
}

/* Exact standard-form simplex ------------------------------------------ */
function parseExactList(source){return splitArgs(source).map(parseExact);}
function parseExactRows(source){
  var rows=splitTopLevel(source,"|").map(parseExactList);
  if(!rows.length)throw new OptimizationError("SHAPE_ERROR","At least one constraint row is required");var n=rows[0].length;
  if(!n||rows.some(function(r){return r.length!==n;}))throw new OptimizationError("SHAPE_ERROR","Constraint matrix rows must have equal nonzero length");
  return rows;
}
function rcmp(a,b){var x=M.toNumber(a),y=M.toNumber(b);return x<y?-1:x>y?1:0;}
function simplexPivot(T,row,col){
  var pivot=T[row][col],rows=T.length,cols=T[0].length;
  for(var j=0;j<cols;j++)T[row][j]=M.div(T[row][j],pivot);
  for(var i=0;i<rows;i++)if(i!==row&&!M.isZero(T[i][col])){
    var f=T[i][col];for(var c=0;c<cols;c++)T[i][c]=M.sub(T[i][c],M.mul(f,T[row][c]));
  }
}
function simplexMax(c,Arows,b,options){
  options=options||{};var m=Arows.length,n=c.length;
  if(!m||Arows.some(function(r){return r.length!==n;})||b.length!==m)throw new OptimizationError("SHAPE_ERROR","LP dimensions do not match");
  if(b.some(function(x){return M.toNumber(x)<-1e-14;}))throw new UnsupportedOptimizationError("Standard-form simplex currently requires nonnegative RHS values so x=0 is primal feasible");
  var cols=n+m+1,T=Array.from({length:m+1},function(){return Array.from({length:cols},function(){return rat(0);});}),basis=[];
  for(var i=0;i<m;i++){
    for(var j=0;j<n;j++)T[i][j]=Arows[i][j];
    T[i][n+i]=rat(1);T[i][cols-1]=b[i];basis[i]=n+i;
  }
  for(var j=0;j<n;j++)T[m][j]=M.neg(c[j]);
  var maxIterations=options.maxIterations||10000,iterations=0;
  for(;iterations<maxIterations;iterations++){
    var enter=-1;
    for(var j=0;j<cols-1;j++)if(M.toNumber(T[m][j])<-1e-14){enter=j;break;} // Bland entering.
    if(enter<0)break;
    var leave=-1,bestRatio=null;
    for(var i=0;i<m;i++){
      if(M.toNumber(T[i][enter])<=1e-14)continue;
      var ratio=M.div(T[i][cols-1],T[i][enter]);
      if(leave<0||rcmp(ratio,bestRatio)<0||(rcmp(ratio,bestRatio)===0&&basis[i]<basis[leave])){leave=i;bestRatio=ratio;}
    }
    if(leave<0)throw new UnboundedProblemError("Standard-form LP objective is unbounded in an improving feasible direction",{enteringColumn:enter});
    simplexPivot(T,leave,enter);basis[leave]=enter;
  }
  if(iterations>=maxIterations)throw new OptimizationConvergenceError("Simplex exceeded its iteration budget",{iterations:iterations});
  var all=Array.from({length:n+m},function(){return rat(0);});
  basis.forEach(function(col,row){all[col]=T[row][cols-1];});
  var primal=all.slice(0,n),slacks=all.slice(n),objective=T[m][cols-1],
    reduced=T[m].slice(0,n+m),dual=T[m].slice(n,n+m);
  // Certificate checks.
  for(var i=0;i<m;i++){
    var lhs=rat(0);for(var j=0;j<n;j++)lhs=M.add(lhs,M.mul(Arows[i][j],primal[j]));
    if(M.toNumber(M.sub(lhs,b[i]))>1e-9)throw new OptimizationError("LP_CERTIFICATE_FAILED","Simplex result failed primal-feasibility verification",{row:i});
  }
  if(primal.some(function(x){return M.toNumber(x)<-1e-9;}))throw new OptimizationError("LP_CERTIFICATE_FAILED","Simplex result contains a negative primal variable");
  if(reduced.some(function(x){return M.toNumber(x)<-1e-9;}))throw new OptimizationError("LP_CERTIFICATE_FAILED","Simplex result failed reduced-cost optimality verification");
  if(dual.some(function(y){return M.toNumber(y)<-1e-9;}))throw new OptimizationError("LP_CERTIFICATE_FAILED","Simplex dual certificate contains a negative multiplier");
  for(var j=0;j<n;j++){
    var aty=rat(0);for(var i=0;i<m;i++)aty=M.add(aty,M.mul(Arows[i][j],dual[i]));
    if(M.toNumber(M.sub(c[j],aty))>1e-9)throw new OptimizationError("LP_CERTIFICATE_FAILED","Simplex dual certificate violates A^T y >= c",{column:j});
  }
  var dualObj=rat(0);for(var i=0;i<m;i++)dualObj=M.add(dualObj,M.mul(b[i],dual[i]));
  if(Math.abs(M.toNumber(M.sub(dualObj,objective)))>1e-9)throw new OptimizationError("LP_CERTIFICATE_FAILED","Primal and dual objectives do not match",{primal:M.formatValue(objective),dual:M.formatValue(dualObj)});
  return {primal:primal,slacks:slacks,objective:objective,basis:basis,reducedCosts:reduced,dual:dual,dualObjective:dualObj,iterations:iterations,tableau:T,method:"primal-simplex-bland",
    toString:function(){return "x = ["+primal.map(function(x){return M.formatValue(x);}).join(", ")+"]; objective = "+M.formatValue(objective);}};
}
function standardLP(cSource,rowsSource,bSource,sense){
  var c=parseExactList(cSource),rows=parseExactRows(rowsSource),b=parseExactList(bSource);
  if(rows[0].length!==c.length||rows.length!==b.length)throw new OptimizationError("SHAPE_ERROR","LP objective, matrix, and RHS dimensions do not match");
  var solveC=sense==="min"?c.map(function(x){return M.neg(x);}):c,res=simplexMax(solveC,rows,b);
  if(sense==="min")res.objective=M.neg(res.objective);
  res.sense=sense||"max";
  res.toString=function(){return "x = ["+this.primal.map(function(x){return M.formatValue(x);}).join(", ")+"]; objective = "+M.formatValue(this.objective);};
  return res;
}

/* Convex quadratic programming via active-set enumeration --------------- */
function constraintLinear(e,vars){
  var H=C.hessian(e,vars);
  return H.every(function(row){return row.every(function(x){return zeroAst(x.ast);});});
}
function constHessian(objective,vars){
  var H=C.hessian(objective,vars);
  if(!hessianConstant(H,vars))throw new UnsupportedOptimizationError("quadprog requires a quadratic objective with constant Hessian");
  return H;
}
function enumerateSubsets(n,callback){
  if(n>10)throw new UnsupportedOptimizationError("quadprog currently supports at most 10 inequality constraints");
  var total=1<<n;for(var mask=0;mask<total;mask++){var set=[];for(var i=0;i<n;i++)if(mask&(1<<i))set.push(i);callback(set);}
}
function exactSolutionPoint(solution,vars){
  if(!solution||solution.type!=="unique")return null;
  return vars.map(function(v){return solution.values[v];});
}
function quadProg(objectiveSource,vars,equalities,inequalities,options){
  options=options||{};var objective=asExpr(objectiveSource),H=constHessian(objective,vars);
  equalities.forEach(function(g){if(!constraintLinear(g,vars))throw new UnsupportedOptimizationError("quadprog equality constraints must be linear");});
  inequalities.forEach(function(h){if(!constraintLinear(h,vars))throw new UnsupportedOptimizationError("quadprog inequality constraints must be linear residuals h(x)<=0");});
  var Hnum=H.map(function(row){return row.map(function(e){return evalExpr(e,{});});}),eig=symmetricEigenvalues(Hnum),cls=classifyEigenvalues(eig,1e-9);
  if(!(cls.matrixClass==="positive definite"||cls.matrixClass==="positive semidefinite"))throw new UnsupportedOptimizationError("quadprog requires a convex quadratic objective",{eigenvalues:eig});
  var grad=C.gradient(objective,vars),candidates=[],tol=options.tol||1e-8;
  enumerateSubsets(inequalities.length,function(active){
    if(equalities.length+active.length>vars.length+equalities.length)return;
    var lnames=equalities.map(function(_,i){return "__lambda"+i;}),mnames=active.map(function(_,i){return "__mu"+i;}),unknowns=vars.concat(lnames,mnames),equations=[];
    for(var vi=0;vi<vars.length;vi++){
      var station=cloneAst(grad[vi].ast);
      equalities.forEach(function(g,j){station=bin("+",station,bin("*",id(lnames[j]),cloneAst(C.differentiate(g,vars[vi]).ast)));});
      active.forEach(function(idx,j){station=bin("+",station,bin("*",id(mnames[j]),cloneAst(C.differentiate(inequalities[idx],vars[vi]).ast)));});
      equations.push(expr(station).toString()+" = 0");
    }
    equalities.forEach(function(g){equations.push(g.toString()+" = 0");});
    active.forEach(function(idx){equations.push(inequalities[idx].toString()+" = 0");});
    var sol;try{sol=A.solveLinearSystem(equations,unknowns);}catch(e){return;}
    var pexpr=exactSolutionPoint(sol,vars);if(!pexpr)return;
    var point=pexpr.map(function(e){try{return evalExpr(e,{});}catch(err){return NaN;}});if(point.some(function(x){return !Number.isFinite(x);}))return;
    var env=pointEnv(vars,point),eqOk=equalities.every(function(g){return Math.abs(evalExpr(g,env))<=tol;}),ineqVals=inequalities.map(function(h){return evalExpr(h,env);});
    if(!eqOk||ineqVals.some(function(v){return v>tol;}))return;
    var mu=Array(inequalities.length).fill(0),dualOk=true;
    active.forEach(function(idx,j){
      var val;try{val=evalExpr(sol.values[mnames[j]],{});}catch(e){val=NaN;}
      if(!Number.isFinite(val)||val<-tol)dualOk=false;mu[idx]=val;
    });
    if(!dualOk)return;
    var lambda=lnames.map(function(n){return evalExpr(sol.values[n],{});}),value=evalExpr(objective,env),
      cert=kktCheck(objective,vars,equalities,inequalities,point,lambda,mu,Math.max(tol,1e-7));
    if(!cert.satisfied)return;
    candidates.push({point:point,pointExact:pexpr,objective:value,lambda:lambda,mu:mu,active:active.slice(),solution:sol,kkt:cert});
  });
  if(!candidates.length)throw new InfeasibleProblemError("No certified KKT point was found for the convex quadratic program; the problem may be infeasible or degenerate outside the current exact active-set solver");
  candidates.sort(function(a,b){return a.objective-b.objective;});var best=candidates[0];
  return {point:best.point,pointExact:best.pointExact,objective:best.objective,lambda:best.lambda,mu:best.mu,active:best.active,eigenvalues:eig,strictlyConvex:cls.matrixClass==="positive definite",candidates:candidates.length,kkt:best.kkt,
    toString:function(){return formatPoint(vars,best.point,10)+"; f = "+M.formatNumber(best.objective,12)+"; active inequalities = ["+best.active.map(function(i){return i+1;}).join(", ")+"]";}};
}

/* Command router --------------------------------------------------------- */
function runCommand(raw,options){
  raw=String(raw).trim();options=options||{};
  var p=parseSemicolon(raw,"convexity");
  if(p){
    if(p.length<2||p.length>3)throw new OptimizationError("ARITY_ERROR","convexity expects convexity(f; x,y,...; optional point)");
    var vars=parseVars(p[1]),point=p[2]?splitArgs(p[2]):null,cv=convexity(p[0],vars,point);
    return commandResult(cv.toString(),"convexity",{value:cv,metadata:{operation:"convexity",classification:cv.classification,global:cv.global,eigenvalues:cv.eigenvalues}});
  }

  p=parseSemicolon(raw,"goldenmin");
  if(p){
    if(p.length!==3)throw new OptimizationError("ARITY_ERROR","goldenmin expects goldenmin(f; x; a,b)");
    var b=splitArgs(p[2]);if(b.length!==2)throw new OptimizationError("ARITY_ERROR","goldenmin bounds must be a,b");
    var gm=goldenSection(p[0],p[1],b[0],b[1],"min",options);
    return commandResult(gm.toString(),"bounded-optimization",{value:gm.value,exact:false,symbolic:false,metadata:{operation:"goldenmin",point:gm.point,iterations:gm.iterations,method:gm.method}});
  }

  p=parseSemicolon(raw,"goldenmax");
  if(p){
    if(p.length!==3)throw new OptimizationError("ARITY_ERROR","goldenmax expects goldenmax(f; x; a,b)");
    var bb=splitArgs(p[2]);if(bb.length!==2)throw new OptimizationError("ARITY_ERROR","goldenmax bounds must be a,b");
    var gx=goldenSection(p[0],p[1],bb[0],bb[1],"max",options);
    return commandResult(gx.toString(),"bounded-optimization",{value:gx.value,exact:false,symbolic:false,metadata:{operation:"goldenmax",point:gx.point,iterations:gx.iterations,method:gx.method}});
  }

  p=parseSemicolon(raw,"optmin");
  if(p){
    if(p.length<3||p.length>4)throw new OptimizationError("ARITY_ERROR","optmin expects optmin(f; x,y,...; initial; optional method)");
    var ov=parseVars(p[1]),oi=splitArgs(p[2]),om=optimizeLocal(p[0],ov,oi,p[3]||"bfgs","min",options);
    return commandResult(om.toString(),"local-minimum",{value:om.objective,exact:false,symbolic:false,metadata:{operation:"optmin",point:om.point,gradientNorm:om.gradientNorm,iterations:om.iterations,method:om.method,secondOrder:om.secondOrder.status,eigenvalues:om.secondOrder.eigenvalues}});
  }

  p=parseSemicolon(raw,"optmax");
  if(p){
    if(p.length<3||p.length>4)throw new OptimizationError("ARITY_ERROR","optmax expects optmax(f; x,y,...; initial; optional method)");
    var xv=parseVars(p[1]),xi=splitArgs(p[2]),xm=optimizeLocal(p[0],xv,xi,p[3]||"bfgs","max",options);
    return commandResult(xm.toString(),"local-maximum",{value:xm.objective,exact:false,symbolic:false,metadata:{operation:"optmax",point:xm.point,gradientNorm:xm.gradientNorm,iterations:xm.iterations,method:xm.method,secondOrder:xm.secondOrder.status,eigenvalues:xm.secondOrder.eigenvalues}});
  }

  p=parseSemicolon(raw,"boxmin");
  if(p){
    if(p.length!==5)throw new OptimizationError("ARITY_ERROR","boxmin expects boxmin(f; vars; lower; upper; initial)");
    var bv=parseVars(p[1]),bl=splitArgs(p[2]),bu=splitArgs(p[3]),bi=splitArgs(p[4]),br=boxOptimize(p[0],bv,bl,bu,bi,"min",options);
    return commandResult(br.toString(),"box-optimization",{value:br.objective,exact:false,symbolic:false,metadata:{operation:"boxmin",point:br.point,projectedGradientNorm:br.projectedGradientNorm,iterations:br.iterations,method:br.method}});
  }

  p=parseSemicolon(raw,"boxmax");
  if(p){
    if(p.length!==5)throw new OptimizationError("ARITY_ERROR","boxmax expects boxmax(f; vars; lower; upper; initial)");
    var bxv=parseVars(p[1]),bxl=splitArgs(p[2]),bxu=splitArgs(p[3]),bxi=splitArgs(p[4]),bxr=boxOptimize(p[0],bxv,bxl,bxu,bxi,"max",options);
    return commandResult(bxr.toString(),"box-optimization",{value:bxr.objective,exact:false,symbolic:false,metadata:{operation:"boxmax",point:bxr.point,projectedGradientNorm:bxr.projectedGradientNorm,iterations:bxr.iterations,method:bxr.method}});
  }

  p=parseSemicolon(raw,"kktcheck");
  if(p){
    if(p.length!==7)throw new OptimizationError("ARITY_ERROR","kktcheck expects kktcheck(f; vars; equalities|-; inequalities|-; point; lambda|-; mu|-)");
    var kv=parseVars(p[1]),ke=parseOptionalExprList(p[2]),ki=parseOptionalExprList(p[3]),kp=splitArgs(p[4]),kl=p[5]==="-"?[]:splitArgs(p[5]),km=p[6]==="-"?[]:splitArgs(p[6]),
      kc=kktCheck(asExpr(p[0]),kv,ke,ki,kp,kl,km,options.kktTol||1e-8);
    return commandResult(kc.toString(),"kkt-check",{value:kc,exact:false,symbolic:false,metadata:{operation:"kktcheck",satisfied:kc.satisfied,stationarity:kc.stationarityNorm,primal:Math.max(kc.equalityResidual,kc.inequalityViolation),dual:kc.dualViolation,complementarity:kc.complementarityResidual}});
  }

  p=parseSemicolon(raw,"lpmax");
  if(p){
    if(p.length!==3)throw new OptimizationError("ARITY_ERROR","lpmax expects lpmax(c1,c2,...; row1|row2|...; b1,b2,...) for max c^T x, Ax<=b, x>=0");
    var lp=standardLP(p[0],p[1],p[2],"max");
    return commandResult(lp.toString(),"linear-program",{value:lp.objective,metadata:{operation:"lpmax",primal:lp.primal.map(function(x){return M.formatValue(x);}),iterations:lp.iterations,method:lp.method,basis:lp.basis}});
  }

  p=parseSemicolon(raw,"lpmin");
  if(p){
    if(p.length!==3)throw new OptimizationError("ARITY_ERROR","lpmin expects lpmin(c1,c2,...; row1|row2|...; b1,b2,...) for min c^T x, Ax<=b, x>=0");
    var lpn=standardLP(p[0],p[1],p[2],"min");
    return commandResult(lpn.toString(),"linear-program",{value:lpn.objective,metadata:{operation:"lpmin",primal:lpn.primal.map(function(x){return M.formatValue(x);}),iterations:lpn.iterations,method:lpn.method,basis:lpn.basis}});
  }

  p=parseSemicolon(raw,"quadprog");
  if(p){
    if(p.length!==4)throw new OptimizationError("ARITY_ERROR","quadprog expects quadprog(f; vars; equalities|-; inequalities|-), with equality residuals =0 and inequality residuals <=0");
    var qv=parseVars(p[1]),qe=parseOptionalExprList(p[2]),qi=parseOptionalExprList(p[3]),qp=quadProg(p[0],qv,qe,qi,options);
    return commandResult(qp.toString(),"quadratic-program",{value:qp.objective,metadata:{operation:"quadprog",point:qp.point,active:qp.active,lambda:qp.lambda,mu:qp.mu,strictlyConvex:qp.strictlyConvex,kkt:true}});
  }

  if(/^opthelp\s*\(\s*\)$/i.test(raw)){
    return commandResult("U4: convexity · goldenmin · goldenmax · optmin · optmax · boxmin · boxmax · kktcheck · lpmax · lpmin · quadprog","optimization-help",{metadata:{operation:"opthelp"}});
  }
  return null;
}

global.CalcOptimization={
  VERSION:"2.3.0-u4",
  OptimizationError:OptimizationError,UnsupportedOptimizationError:UnsupportedOptimizationError,OptimizationConvergenceError:OptimizationConvergenceError,UnboundedProblemError:UnboundedProblemError,InfeasibleProblemError:InfeasibleProblemError,
  ObjectiveModel:ObjectiveModel,
  convexity:convexity,goldenSection:goldenSection,optimizeLocal:optimizeLocal,boxOptimize:boxOptimize,kktCheck:kktCheck,
  simplexMax:simplexMax,standardLP:standardLP,quadProg:quadProg,
  solveNumeric:solveNumeric,
  runCommand:runCommand
};
})(window);
