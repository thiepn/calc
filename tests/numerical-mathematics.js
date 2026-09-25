"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../cas.js");
require("../multivariable.js");
require("../ode.js");
require("../units.js");
require("../linear-algebra.js");
require("../advanced-linear-algebra.js");
require("../optimization.js");
require("../numerical-mathematics.js");

const M=global.CalcMath;
const L=global.CalcLinearAlgebra;
const N=global.CalcNumerical;

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,t,m){if(Math.abs(a-b)>t*Math.max(1,Math.abs(a),Math.abs(b)))throw new Error((m||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,m){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}

// Floating-point spacing and elementary error metrics.
eq(N.nextUp(1),1+Number.EPSILON,"nextUp(1)");
assert(N.nextDown(1)<1,"nextDown(1)");
eq(N.ulp(1),Number.EPSILON,"ulp(1)");
eq(N.ulp(0),Number.MIN_VALUE,"ulp(0)");

let fi=N.floatInfo(1);
eq(fi.ulp,Number.EPSILON,"float info ulp");
assert(fi.nextUp>1&&fi.nextDown<1,"float neighbors");

let er=N.errorMetrics(1,0.999);
approx(er.absoluteError,0.001,1e-15,"absolute error");
approx(er.relativeError,0.001,1e-15,"relative error");
assert(er.correctDigits>2.9&&er.correctDigits<3.1,"correct digit estimate");

let cd=N.cancellationDiagnostic(1.000000000001,1);
assert(cd.estimatedLostDecimalDigits>11.9,"cancellation diagnostic");

let cond=N.scalarCondition("exp(x)","x",1);
approx(cond.relativeCondition,1,1e-7,"relative condition exp at 1");
cond=N.scalarCondition("x^2","x",2);
approx(cond.relativeCondition,2,1e-6,"relative condition x^2");

// Richardson and observed order.
let rr=N.richardsonExtrapolation(1.04,1.01,2,2);
approx(rr.extrapolated,1,1e-14,"Richardson exact cancellation");
approx(rr.errorEstimate,0.01,1e-14,"Richardson error estimate");
let oo=N.observedOrder(1.1,1.025,1.00625,2);
approx(oo.order,2,1e-12,"observed second order");
throwsCode(()=>N.observedOrder(1,1,1,2),"ORDER_UNDEFINED","undefined observed order");

// Root finding.
let fp=N.fixedPoint("cos(x)","x",0.5,{maxIterations:200});
approx(fp.fixedPoint,0.7390851332151607,1e-9,"fixed point cos");
assert(fp.localContraction<1,"fixed point contraction");

let roots=N.rootComparison("cos(x)-x","x",0,1,0.5,1,{});
const successful=roots.results.filter(r=>r.converged);
eq(successful.length,4,"all root methods converge");
successful.forEach(r=>approx(r.root,0.7390851332151607,1e-8,"root comparison"));
assert(successful.find(r=>r.method==="hybrid").residual<1e-8,"hybrid residual");

// Interpolation.
let ip=N.barycentricInterpolation([0,1,2],[0,1,4],1.5);
approx(ip.value,2.25,1e-13,"barycentric x^2");
let ni=N.newtonInterpolation([0,1,2],[0,1,4],1.5);
approx(ni.value,2.25,1e-13,"Newton interpolation x^2");
eq(ni.coefficients.join(","),"0,1,1","Newton divided differences");
let hi=N.hermiteInterpolation([0,1],[0,1],[0,2],0.5);
approx(hi.value,0.25,1e-13,"Hermite x^2");
let sp=N.naturalCubicSpline([0,1,2],[0,1,2],1.5);
approx(sp.value,1.5,1e-13,"natural spline linear data");
throwsCode(()=>N.barycentricInterpolation([0,0],[1,2],0.2),"DUPLICATE_NODE","duplicate interpolation node");
throwsCode(()=>N.naturalCubicSpline([0,2,1],[0,1,2],1),"NODE_ORDER","spline node order");

// Finite differences.
let fd=N.finiteDifferenceDiagnostic("sin(x)","x",0,0.1,"fivepoint",1);
approx(fd.extrapolated,1,5e-9,"five-point first derivative");
assert(fd.errorEstimate>0&&fd.actualFineError!==null,"finite-difference error diagnostics");
fd=N.finiteDifferenceDiagnostic("exp(x)","x",0,0.05,"fivepoint",2);
approx(fd.extrapolated,1,5e-8,"five-point second derivative");
throwsCode(()=>N.finiteDifference("x^2","x",1,0.1,"forward",2),"UNSUPPORTED_NUMERICAL_METHOD","unsupported second-derivative forward formula");

// Quadrature.
let q=N.quadratureDiagnostic("x^4","x",0,1,10,"simpson");
approx(q.value,0.2,1e-10,"Simpson x^4");
assert(q.errorEstimate>0,"Simpson Richardson error");
q=N.quadratureDiagnostic("x^9","x",0,1,1,"gauss5");
approx(q.value,0.1,1e-13,"Gauss-5 degree 9 exactness");
q=N.quadratureDiagnostic("sin(x)","x",0,Math.PI,8,"adaptive");
approx(q.value,2,1e-10,"adaptive Simpson sin");
q=N.quadratureDiagnostic("exp(x)","x",0,1,2,"gauss4");
approx(q.value,Math.E-1,1e-10,"composite Gauss exp");
throwsCode(()=>N.compositeQuadrature("x","x",0,1,3,"simpson"),"INVALID_GRID","Simpson even panels");

// Iterative linear systems.
let js=N.stationarySolve([[4,1],[2,3]],[1,2],[0,0],"jacobi",{maxIterations:200});
approx(js.solution[0],0.1,1e-8,"Jacobi x1");
approx(js.solution[1],0.6,1e-8,"Jacobi x2");
assert(js.diagonalDominance.strict,"Jacobi DD certificate");

let gs=N.stationarySolve([[4,1],[2,3]],[1,2],[0,0],"gauss-seidel",{maxIterations:200});
approx(gs.solution[0],0.1,1e-8,"GS x1");
approx(gs.solution[1],0.6,1e-8,"GS x2");
assert(gs.iterations<js.iterations,"GS faster on test system");

let cg=N.conjugateGradient([[4,1],[1,3]],[1,2],[0,0],{maxIterations:20});
approx(cg.solution[0],1/11,1e-12,"CG x1");
approx(cg.solution[1],7/11,1e-12,"CG x2");
eq(cg.iterations,2,"CG terminates in dimension");
throwsCode(()=>N.conjugateGradient([[1,2],[2,1]],[1,1],[0,0],{}),"UNSUPPORTED_NUMERICAL_METHOD","CG SPD requirement");
throwsCode(()=>N.stationarySolve([[1,2],[2,1]],[1,1],[0,0],"jacobi",{maxIterations:20}),"NUMERICAL_CONVERGENCE","Jacobi divergence");

let ld=N.linearSystemDiagnostics([[4,1],[1,3]],[1,2],[1/11,7/11]);
assert(ld.residualNorm<1e-12&&ld.normwiseBackwardError<1e-12,"linear-system backward error");
assert(Number.isFinite(ld.conditionNumber),"linear-system condition finite");
throwsCode(()=>N.linearSystemDiagnostics([[1,2],[3,4]],[1,2],[1]),"MATRIX_SHAPE_ERROR","linear diagnostic shape");

// Eigenvalue iteration.
let pw=N.powerIteration([[2,1],[1,2]],[1,0],{tol:1e-11,maxIterations:100});
approx(pw.eigenvalue,3,1e-9,"power dominant eigenvalue");
assert(pw.residual<1e-9,"power residual");

let inv=N.inverseIteration([[2,0],[0,5]],[1,1],2.1,{tol:1e-11,maxIterations:100});
approx(inv.eigenvalue,2,1e-9,"inverse shifted eigenvalue");
assert(inv.residual<1e-9,"inverse residual");

let rq=N.rayleighQuotientIteration([[2,1],[1,2]],[1,0.2],{tol:1e-12,maxIterations:50});
approx(rq.eigenvalue,3,1e-10,"RQI eigenvalue");
assert(rq.residual<1e-10,"RQI residual");
throwsCode(()=>N.powerIteration([[1,2,3],[4,5,6]],[1,1],{}),"MATRIX_SHAPE_ERROR","power shape");

// Optimization bridge.
let oc=N.optimizationComparison("(x-1)^2+(y+2)^2",["x","y"],["3","3"],{});
eq(oc.results.filter(r=>r.converged).length,3,"all optimization methods converge");
oc.results.filter(r=>r.converged).forEach(r=>approx(r.objective,0,1e-12,"optimizer comparison objective"));

// Fixed-step ODEs and order estimation.
let od=N.fixedScalarIVP("y","x","y",0,1,1,100,"rk4");
approx(od.value,Math.E,1e-8,"RK4 exponential IVP");
eq(od.formalOrder,4,"RK4 formal order");

let eu=N.fixedScalarIVP("y","x","y",0,1,1,1000,"euler");
approx(eu.value,Math.E,2e-3,"Euler exponential IVP");
eq(eu.formalOrder,1,"Euler formal order");

let odo=N.odeOrderDiagnostic("y","x","y",0,1,1,10,"rk4");
assert(odo.observedOrder>3.7&&odo.observedOrder<4.2,"RK4 observed order");
assert(odo.errorEstimate>0,"RK4 Richardson error estimate");

// Absolute stability.
let st=N.stabilityAmplification("euler",-2,0);
assert(st.stable&&Math.abs(st.magnitude-1)<1e-12,"Euler boundary stable");
assert(!N.stabilityAmplification("euler",-2.1,0).stable,"Euler outside interval unstable");
assert(N.stabilityAmplification("backward-euler",-100,0).stable,"backward Euler A-stable on negative real axis");
let si=N.negativeRealStabilityLimit("rk4");
approx(si.left,-2.7852935634,1e-8,"RK4 negative-real stability boundary");
eq(N.negativeRealStabilityLimit("implicit-midpoint").left,-Infinity,"implicit midpoint negative-real interval");

// Command surface.
assert(N.runCommand("floatinfo(1)").display.includes("2.22044604925031308e-16"),"floatinfo command");
assert(N.runCommand("numerror(1; 0.999)").display.includes("relative error"),"numerror command");
assert(N.runCommand("scalarcond(exp(x); x; 1)").display.includes("κ_rel"),"condition command");
assert(N.runCommand("richardson(1.04; 1.01; 2)").display.includes("extrapolated"),"Richardson command");
assert(N.runCommand("convorder(1.1; 1.025; 1.00625)").display.includes("p ≈ 2"),"order command");
assert(N.runCommand("rootcompare(cos(x)-x; x; 0,1; 0.5,1)").display.includes("hybrid"),"root comparison command");
assert(N.runCommand("interp(0,1,2; 0,1,4; 1.5)").display.includes("2.25"),"interpolation command");
assert(N.runCommand("hermite(0,1; 0,1; 0,2; 0.5)").display.includes("0.25"),"Hermite command");
assert(N.runCommand("spline(0,1,2; 0,1,2; 1.5)").display.includes("1.5"),"spline command");
assert(N.runCommand("fdiff(sin(x); x; 0; 0.1; fivepoint; 1)").display.includes("D ≈"),"finite diff command");
assert(N.runCommand("quad(x^4; x; 0; 1; 10; simpson)").display.includes("I ≈ 0.2"),"quadrature command");
assert(N.runCommand("jacobi(4,1|2,3; 1,2; 0,0; 200)").display.includes("iterations"),"Jacobi command");
assert(N.runCommand("cg(4,1|1,3; 1,2; 0,0; 20)").display.includes("||r||2"),"CG command");
assert(N.runCommand("poweriter(2,1|1,2; 1,0; 100)").display.includes("λ ≈ 3"),"power command");
assert(N.runCommand("rayleighiter(2,1|1,2; 1,0.2; 50)").display.includes("λ ≈ 3"),"RQI command");
assert(N.runCommand("optcompare((x-1)^2+(y+2)^2; x,y; 3,3)").display.includes("bfgs"),"optimization comparison command");
assert(N.runCommand("odefixed(y; x; y; 0; 1; 1; 100; rk4)").display.includes("2.718"),"fixed ODE command");
assert(N.runCommand("odeorder(y; x; y; 0; 1; 1; 10; rk4)").display.includes("observed p"),"ODE order command");
assert(N.runCommand("stability(rk4; -2; 0)").display.includes("stable"),"stability command");
assert(N.runCommand("stabinterval(rk4)").display.includes("-2.785"),"stability interval command");
assert(N.runCommand("numhelp()").display.includes("hermite")&&N.runCommand("numhelp()").display.includes("rayleighiter"),"U6 help");
eq(N.runCommand("2+2"),null,"ordinary expression ignored by U6 router");

console.log("Numerical Mathematics U6 certification tests passed");
