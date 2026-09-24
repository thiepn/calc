"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../cas.js");
require("../multivariable.js");
require("../linear-algebra.js");
require("../optimization.js");

const M=global.CalcMath;
const C=global.CalcCalculus;
const O=global.CalcOptimization;

function assert(cond,msg){if(!cond)throw new Error(msg||"Assertion failed");}
function eq(a,b,msg){if(a!==b)throw new Error((msg||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,tol,msg){if(Math.abs(a-b)>tol*Math.max(1,Math.abs(a),Math.abs(b)))throw new Error((msg||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,msg){
  let ok=false;
  try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((msg||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}
  if(!ok)throw new Error((msg||"Expected error")+": "+code);
}
function n(v){return M.toNumber(v);}

// Global quadratic convexity certificates.
let cv=O.convexity("x^2+2*y^2",["x","y"]);
eq(cv.classification,"strictly convex","strict convexity");
eq(cv.matrixClass,"positive definite","positive-definite Hessian");
approx(cv.eigenvalues[0],2,1e-12,"convex eigenvalue 1");
approx(cv.eigenvalues[1],4,1e-12,"convex eigenvalue 2");

cv=O.convexity("-x^2-3*y^2",["x","y"]);
eq(cv.classification,"strictly concave","strict concavity");

cv=O.convexity("x^2",["x","y"]);
eq(cv.classification,"convex","semidefinite convexity");

cv=O.convexity("x^2-y^2",["x","y"]);
eq(cv.classification,"indefinite","indefinite quadratic");

cv=O.convexity("3*x-2*y+7",["x","y"]);
eq(cv.classification,"affine/flat (convex and concave)","affine zero-Hessian classification");
eq(cv.matrixClass,"zero","zero Hessian class");

// Pointwise Hessian information must not be mislabeled as global/local convexity proof.
cv=O.convexity("x^4+y^2",["x","y"],["0","0"]);
eq(cv.classification,"positive semidefinite Hessian at point","pointwise curvature wording");
assert(!cv.global,"pointwise curvature is not global certificate");
throwsCode(()=>O.convexity("x^4+y^2",["x","y"]), "UNSUPPORTED_OPTIMIZATION","nonconstant Hessian requires point");

// Golden-section search.
let gs=O.goldenSection("(x-2)^2+1","x","-5","5","min",{tol:1e-12});
approx(gs.point,2,2e-8,"golden minimum point");
approx(gs.value,1,1e-12,"golden minimum value");
gs=O.goldenSection("-(x-3)^2+4","x","-5","8","max",{tol:1e-12});
approx(gs.point,3,3e-8,"golden maximum point");
approx(gs.value,4,1e-12,"golden maximum value");
throwsCode(()=>O.goldenSection("x^2","x","2","-2","min",{}),"INVALID_INTERVAL","invalid golden interval");

// BFGS / Newton / gradient descent.
let opt=O.optimizeLocal("(1-x)^2+100*(y-x^2)^2",["x","y"],["-1.2","1"],"bfgs","min",{maxIterations:2000});
approx(opt.point[0],1,2e-7,"BFGS Rosenbrock x");
approx(opt.point[1],1,2e-7,"BFGS Rosenbrock y");
assert(opt.gradientNorm<1e-7,"BFGS first-order convergence");
eq(opt.secondOrder.matrixClass,"positive definite","BFGS second-order certificate");

opt=O.optimizeLocal("(x-1)^2+2*(y+2)^2",["x","y"],["5","5"],"newton","min",{});
approx(opt.point[0],1,1e-12,"Newton quadratic x");
approx(opt.point[1],-2,1e-12,"Newton quadratic y");
assert(opt.secondOrder.constantHessian,"Newton quadratic global certificate");

opt=O.optimizeLocal("x^4+y^4",["x","y"],["1","-1"],"gradient","min",{maxIterations:3000});
approx(opt.point[0],0,2e-6,"gradient quartic x");
approx(opt.point[1],0,2e-6,"gradient quartic y");
eq(opt.secondOrder.matrixClass,"positive semidefinite","quartic second-order inconclusive but nonnegative");

opt=O.optimizeLocal("-(x-1)^2-(y-2)^2+5",["x","y"],["0","0"],"bfgs","max",{});
approx(opt.point[0],1,1e-8,"maximum x");
approx(opt.point[1],2,1e-8,"maximum y");
approx(opt.objective,5,1e-10,"maximum value");

throwsCode(()=>O.optimizeLocal("x^2-y^2",["x","y"],["0","0"],"newton","min",{}),"WRONG_STATIONARY_POINT","saddle must not be labeled minimum");
throwsCode(()=>O.optimizeLocal("x^2",["x"],["1"],"bogus","min",{}),"INVALID_METHOD","invalid optimizer method");

// Projected box optimization.
let box=O.boxOptimize("(x-3)^2+(y+1)^2",["x","y"],["0","-2"],["2","2"],["1","0"],"min",{});
approx(box.point[0],2,1e-8,"box boundary x");
approx(box.point[1],-1,1e-8,"box interior y");
approx(box.objective,1,1e-10,"box min objective");
assert(box.projectedGradientNorm<1e-7,"box projected-gradient KKT condition");

box=O.boxOptimize("-(x-3)^2-(y+1)^2",["x","y"],["0","-2"],["2","2"],["1","0"],"max",{});
approx(box.point[0],2,1e-8,"box max boundary x");
approx(box.point[1],-1,1e-8,"box max y");
approx(box.objective,-1,1e-10,"box max objective");
throwsCode(()=>O.boxOptimize("x^2",["x"],["1"],["0"],["0.5"],"min",{}),"INVALID_BOUNDS","invalid box bounds");

// General KKT checker.
let kkt=O.kktCheck(
  new global.CalcAlgebra.SymbolicExpression("x^2+y^2"),
  ["x","y"],
  [new global.CalcAlgebra.SymbolicExpression("x+y-1")],
  [new global.CalcAlgebra.SymbolicExpression("-x"),new global.CalcAlgebra.SymbolicExpression("-y")],
  ["0.5","0.5"],["-1"],["0","0"],1e-9
);
assert(kkt.satisfied,"KKT should be satisfied at equality-constrained optimum");
approx(kkt.stationarityNorm,0,1e-12,"KKT stationarity");
kkt=O.kktCheck(
  new global.CalcAlgebra.SymbolicExpression("x^2+y^2"),
  ["x","y"],[],[],
  ["1","1"],[],[],1e-9
);
assert(!kkt.satisfied,"nonstationary point fails KKT");

// Exact simplex LP with primal-dual certificate.
// max 3x+2y s.t. x+y<=4, x<=2, y<=3, x,y>=0.
let lp=O.standardLP("3,2","1,1|1,0|0,1","4,2,3","max");
eq(M.formatValue(lp.primal[0]),"2","LP x");
eq(M.formatValue(lp.primal[1]),"2","LP y");
eq(M.formatValue(lp.objective),"10","LP optimum");
eq(M.formatValue(lp.dual[0]),"2","LP dual y1");
eq(M.formatValue(lp.dual[1]),"1","LP dual y2");
eq(M.formatValue(lp.dual[2]),"0","LP dual y3");
eq(M.formatValue(lp.dualObjective),"10","LP strong duality");

// Fractional exact LP.
lp=O.standardLP("1,1","2,1|1,2","4,4","max");
eq(M.formatValue(lp.primal[0]),"4/3","fractional LP x");
eq(M.formatValue(lp.primal[1]),"4/3","fractional LP y");
eq(M.formatValue(lp.objective),"8/3","fractional LP optimum");

// lpmin is certified through max(-c).
lp=O.standardLP("-1,-2","1,0|0,1","3,4","min");
eq(M.formatValue(lp.primal[0]),"3","LP min x");
eq(M.formatValue(lp.primal[1]),"4","LP min y");
eq(M.formatValue(lp.objective),"-11","LP min value");

// Unbounded standard-form problem: max x, -x <= 1, x>=0.
throwsCode(()=>O.standardLP("1","-1","1","max"),"UNBOUNDED_PROBLEM","LP unboundedness");
// Negative RHS requires phase-I, intentionally outside U4's certified simplex.
throwsCode(()=>O.standardLP("1","1","-1","max"),"UNSUPPORTED_OPTIMIZATION","LP negative RHS boundary");

// Convex quadratic programming.
// min x^2+y^2, x+y=1, x,y>=0.
let qp=O.quadProg(
  "x^2+y^2",["x","y"],
  [new global.CalcAlgebra.SymbolicExpression("x+y-1")],
  [new global.CalcAlgebra.SymbolicExpression("-x"),new global.CalcAlgebra.SymbolicExpression("-y")],
  {}
);
approx(qp.point[0],0.5,1e-12,"QP equality x");
approx(qp.point[1],0.5,1e-12,"QP equality y");
approx(qp.objective,0.5,1e-12,"QP equality objective");
assert(qp.kkt.satisfied,"QP KKT certificate");
assert(qp.strictlyConvex,"QP strict convexity");

// Active inequality optimum: unconstrained target (2,1), constrained x+y<=2, x,y>=0.
qp=O.quadProg(
  "(x-2)^2+(y-1)^2",["x","y"],[],
  [new global.CalcAlgebra.SymbolicExpression("x+y-2"),new global.CalcAlgebra.SymbolicExpression("-x"),new global.CalcAlgebra.SymbolicExpression("-y")],
  {}
);
approx(qp.point[0],1.5,1e-12,"active QP x");
approx(qp.point[1],0.5,1e-12,"active QP y");
eq(qp.active.join(","),"0","first inequality active");
assert(qp.mu[0]>0,"active inequality multiplier positive");
assert(qp.kkt.satisfied,"active QP KKT");

// Unconstrained quadratic.
qp=O.quadProg("(x-4)^2+3*(y+2)^2",["x","y"],[],[],{});
approx(qp.point[0],4,1e-12,"unconstrained QP x");
approx(qp.point[1],-2,1e-12,"unconstrained QP y");

// Nonconvex QP rejected.
throwsCode(()=>O.quadProg("x^2-y^2",["x","y"],[],[],{}),"UNSUPPORTED_OPTIMIZATION","nonconvex QP");
// Infeasible inequalities x<=0 and x>=1.
throwsCode(()=>O.quadProg("x^2",["x"],[],[
  new global.CalcAlgebra.SymbolicExpression("x"),
  new global.CalcAlgebra.SymbolicExpression("1-x")
],{}),"INFEASIBLE_PROBLEM","infeasible QP");

// Command surface.
assert(O.runCommand("convexity(x^2+y^2; x,y)").display.includes("strictly convex"),"convexity command");
assert(O.runCommand("goldenmin((x-2)^2; x; -5,5)").display.includes("x ≈"),"goldenmin command");
assert(O.runCommand("goldenmax(-(x-2)^2; x; -5,5)").display.includes("x ≈"),"goldenmax command");
assert(O.runCommand("optmin((x-1)^2+(y+2)^2; x,y; 3,3; bfgs)").display.includes("optimum"),"optmin command");
assert(O.runCommand("optmax(-(x-1)^2-(y-2)^2; x,y; 0,0; bfgs)").display.includes("optimum"),"optmax command");
assert(O.runCommand("boxmin((x-3)^2; x; 0; 2; 1)").display.includes("box KKT candidate"),"boxmin command");
assert(O.runCommand("kktcheck(x^2+y^2; x,y; x+y-1; -x,-y; 0.5,0.5; -1; 0,0)").display.startsWith("KKT satisfied"),"KKT command");
assert(O.runCommand("lpmax(3,2; 1,1|1,0|0,1; 4,2,3)").display.includes("objective = 10"),"lpmax command");
assert(O.runCommand("lpmin(-1,-2; 1,0|0,1; 3,4)").display.includes("objective = -11"),"lpmin command");
assert(O.runCommand("quadprog(x^2+y^2; x,y; x+y-1; -x,-y)").display.includes("f = 0.5"),"quadprog command");
assert(O.runCommand("opthelp()").display.includes("quadprog"),"U4 help");
eq(O.runCommand("2+2"),null,"ordinary expression ignored by U4 router");

console.log("Optimization & Mathematical Programming U4 certification tests passed");
