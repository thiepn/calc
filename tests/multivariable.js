"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../cas.js");
require("../multivariable.js");

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
const MV=global.CalcMultivariable;

function assert(cond,msg){if(!cond)throw new Error(msg||"Assertion failed");}
function eq(actual,expected,msg){if(actual!==expected)throw new Error((msg||"Mismatch")+": expected "+expected+", got "+actual);}
function approx(actual,expected,tol,msg){if(Math.abs(actual-expected)>tol)throw new Error((msg||"Approx mismatch")+": expected "+expected+", got "+actual);}
function throwsCode(fn,code,msg){
  let ok=false;
  try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((msg||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}
  if(!ok)throw new Error((msg||"Expected error")+": "+code);
}
function evalSym(expr,env){return M.toNumber(M.evaluateAst(expr.ast,env||{}, {complex:false,angle:"RAD"},0));}

// Point-evaluated differential objects.
eq(MV.runCommand("gradat(x^2+y^2; x,y; 1,2)").display,"[2, 4]","gradient at point");
eq(MV.runCommand("jacobianat(x^2+y,x*y; x,y; 2,3)").display,"[[4, 1], [3, 2]]","Jacobian at point");
eq(MV.runCommand("hessianat(x^2+3*x*y+y^2; x,y; 2,3)").display,"[[2, 3], [3, 2]]","Hessian at point");

const td=MV.totalDifferential("x^2*y+sin(y)",["x","y"]);
eq(td.partials[0].toString(),"2 * x * y","total differential x partial");
eq(td.partials[1].toString(),"cos(y) + x ^ 2","total differential y partial");
assert(td.toString().includes("dx")&&td.toString().includes("dy"),"total differential notation");

const dir=MV.directionalDerivative("x^2+y^2",["x","y"],["1","2"],["3","4"]);
eq(dir.toString(),"22/5","directional derivative normalizes direction");

const imp=MV.implicitDerivative("x^2+y^2-1","y","x");
for(const [x,y] of [[0.3,Math.sqrt(0.91)],[-0.6,0.8]]){
  approx(evalSym(imp.expression,{x,y}),-x/y,1e-12,"implicit derivative @ "+x+","+y);
}

const tp=MV.tangentPlane("x^2+y^2",["x","y"],["1","2"]);
eq(evalSym(tp.expression,{x:1,y:2}),5,1e-12,"tangent plane touches surface");
eq(evalSym(C.differentiate(tp.expression,"x"),{}),2,1e-12,"tangent plane x slope");
eq(evalSym(C.differentiate(tp.expression,"y"),{}),4,1e-12,"tangent plane y slope");

// Multivariable Taylor expansion.
const mt=MV.multiTaylor("x^2+x*y+y^2+x+2*y+3",["x","y"],["0","0"],2);
for(const [x,y] of [[-1,2],[0.2,-0.4],[3,1]]){
  approx(evalSym(mt.expression,{x,y}),x*x+x*y+y*y+x+2*y+3,1e-12,"quadratic Taylor exactness");
}
throwsCode(()=>MV.multiTaylor("exp(x+y)",["x","y"],["0","0"],4),"INVALID_ORDER","Taylor order cap");

// Multivariable limits: continuity certification and path witnesses.
eq(MV.runCommand("mlimit((x^2+y^2)/(1+x^2+y^2); x,y; 0,0)").display,"0","continuous multivariable limit");
throwsCode(()=>MV.multivariableLimit("x*y/(x^2+y^2)",["x","y"],["0","0"]),"MULTIVARIABLE_LIMIT_DNE","path-dependent limit");
throwsCode(()=>MV.multivariableLimit("(x^2*y)/(x^4+y^2)",["x","y"],["0","0"]),"MULTIVARIABLE_LIMIT_DNE","parabolic path witness");

// Critical points and Hessian classification.
const cp=MV.criticalPoints("x^2+2*y^2-4*x+8*y",["x","y"]);
eq(cp.solution.values.x.toString(),"2","critical point x");
eq(cp.solution.values.y.toString(),"-2","critical point y");
eq(MV.classifyCriticalPoint("x^2+y^2",["x","y"],["0","0"]).classification,"local minimum","Hessian min");
eq(MV.classifyCriticalPoint("-x^2-y^2",["x","y"],["0","0"]).classification,"local maximum","Hessian max");
eq(MV.classifyCriticalPoint("x^2-y^2",["x","y"],["0","0"]).classification,"saddle point","Hessian saddle");
eq(MV.classifyCriticalPoint("x^4+y^4",["x","y"],["0","0"]).classification,"inconclusive","degenerate Hessian");

const lag=MV.lagrangeLinearConstraint("x^2+y^2","x+y","1",["x","y"]);
eq(lag.solution.values.x.toString(),"1/2","Lagrange x");
eq(lag.solution.values.y.toString(),"1/2","Lagrange y");
eq(lag.solution.values.lambda.toString(),"1","Lagrange multiplier");
throwsCode(()=>MV.lagrangeLinearConstraint("x^2+y^2","x^2+y^2","1",["x","y"]),"UNSUPPORTED_MULTIVARIABLE","nonlinear constraint boundary");

// Vector differential operators.
const radial=new MV.VectorField(["x^2","y^2","z^2"],["x","y","z"]);
eq(radial.divergence().toString(),"2 * x + 2 * y + 2 * z","divergence");
const curl=new MV.VectorField(["-y","x","0"],["x","y","z"]).curl();
eq(curl[0].toString(),"0","curl x");
eq(curl[1].toString(),"0","curl y");
eq(curl[2].toString(),"2","curl z");

const pot=MV.potential(new MV.VectorField(["2*x","2*y"],["x","y"]));
for(const [x,y] of [[-2,1],[0.5,3]]){
  approx(evalSym(C.differentiate(pot,"x"),{x,y}),2*x,1e-12,"potential x derivative");
  approx(evalSym(C.differentiate(pot,"y"),{x,y}),2*y,1e-12,"potential y derivative");
}
assert(MV.conservative(new MV.VectorField(["y","x"],["x","y"])).conservative,"conservative field");
assert(!MV.conservative(new MV.VectorField(["-y","x"],["x","y"])).conservative,"non-conservative field");

const pot3=MV.potential(new MV.VectorField(["2*x*y+z","x^2+2*y","x"],["x","y","z"]));
for(const env of [{x:1,y:2,z:3},{x:-0.5,y:1.2,z:-2}]){
  approx(evalSym(C.differentiate(pot3,"x"),env),2*env.x*env.y+env.z,1e-10,"3D potential x");
  approx(evalSym(C.differentiate(pot3,"y"),env),env.x*env.x+2*env.y,1e-10,"3D potential y");
  approx(evalSym(C.differentiate(pot3,"z"),env),env.x,1e-10,"3D potential z");
}

// Curve calculus.
const circle=MV.parametricCurve(["cos(t)","sin(t)"],"t");
const circleField=new MV.VectorField(["-y","x"],["x","y"]);
const circulation=MV.lineIntegralVector(circleField,circle,"0","2*pi",{absTol:1e-10,relTol:1e-10});
approx(M.toNumber(circulation.result.value),2*Math.PI,1e-8,"circle circulation");
const length=MV.arcLength(circle,"0","2*pi",{absTol:1e-10,relTol:1e-10});
approx(M.toNumber(length.result.value),2*Math.PI,1e-8,"circle arc length");
const scalarLine=MV.scalarLineIntegral("x",["x","y"],MV.parametricCurve(["t","0"],"t"),"0","1",{});
approx(M.toNumber(scalarLine.result.value),0.5,1e-12,"scalar line integral");

// Multiple integrals.
const dbl=MV.doubleIntegralNumeric("x+y","x",0,1,"y",0,1,{}, {absTol:1e-10,relTol:1e-10});
approx(dbl.value,1,1e-9,"double integral");
const tri=MV.tripleIntegralNumeric("x+y+z","x",0,1,"y",0,1,"z",0,1,{}, {absTol:1e-9,relTol:1e-9});
approx(tri.value,1.5,1e-8,"triple integral");

// Parameterized surfaces.
const plane=MV.parametricSurface(["u","v","0"],"u","v");
const area=MV.surfaceArea(plane,"0","1","0","1",{absTol:1e-10,relTol:1e-10});
approx(area.result.value,1,1e-9,"unit-square surface area");
const flux=MV.surfaceFlux(new MV.VectorField(["0","0","1"],["x","y","z"]),plane,"0","1","0","1",{absTol:1e-10,relTol:1e-10});
approx(flux.result.value,1,1e-9,"unit-square upward flux");

// Integral theorem verification.
const green=MV.greenTheorem("-y","x","x","y","0","1","0","1",{absTol:1e-10,relTol:1e-10});
approx(green.boundary.value,2,1e-9,"Green boundary");
approx(green.interior.value,2,1e-9,"Green interior");
assert(green.residual<1e-8,"Green residual");

const stokes=MV.stokesPlane(new MV.VectorField(["-y","x","0"],["x","y","z"]),"0","1","0","1","0",{absTol:1e-10,relTol:1e-10});
approx(stokes.boundary.value,2,1e-9,"Stokes boundary");
approx(stokes.surface.value,2,1e-9,"Stokes surface");
assert(stokes.residual<1e-8,"Stokes residual");

const gauss=MV.divergenceTheorem(new MV.VectorField(["x","y","z"],["x","y","z"]),[["0","1"],["0","1"],["0","1"]],{absTol:1e-9,relTol:1e-9});
approx(gauss.volume.value,3,1e-8,"Gauss volume");
approx(gauss.flux.value,3,1e-8,"Gauss surface");
assert(gauss.residual<1e-7,"Gauss residual");

// Numerical failure semantics.
throwsCode(()=>MV.adaptiveSimpsonFn(x=>Math.exp(x),0,1,{maxDepth:0,absTol:1e-30,relTol:1e-30}),"INTEGRATION_CONVERGENCE","integration exhaustion is explicit");

// Command surface.
assert(MV.runCommand("totaldiff(x*y; x,y)").display.includes("dx"),"totaldiff command");
eq(MV.runCommand("directional(x^2+y^2; x,y; 1,2; 3,4)").display,"22/5","directional command");
assert(MV.runCommand("implicitdiff(x^2+y^2-1; y; x)").display.includes("dy/dx"),"implicitdiff command");
assert(MV.runCommand("tangentplane(x^2+y^2; x,y; 1,2)").display.startsWith("z ="),"tangentplane command");
eq(MV.runCommand("critical(x^2+2*y^2-4*x+8*y; x,y)").display,"x = 2, y = -2","critical command");
assert(MV.runCommand("lagrange(x^2+y^2; x+y; 1; x,y)").display.includes("x = 1/2"),"lagrange command");
eq(MV.runCommand("div(x^2,y^2,z^2; x,y,z)").display,"2 * x + 2 * y + 2 * z","div command");
eq(MV.runCommand("curl(-y,x,0; x,y,z)").display,"[0, 0, 2]","curl command");
assert(MV.runCommand("potential(2*x,2*y; x,y)").display.includes("x ^ 2 + y ^ 2"),"potential command");
assert(MV.runCommand("lineint(-y,x; x,y; cos(t),sin(t); t; 0,2*pi)").display.includes("6.283"),"line integral command");
assert(MV.runCommand("surfacearea(u,v,0; u,v; 0,1; 0,1)").display.includes("1"),"surface area command");
assert(MV.runCommand("green(-y,x; x,y; 0,1; 0,1)").display.includes("residual"),"Green command");
assert(MV.runCommand("stokes(-y,x,0; x,y,z; 0,1; 0,1; 0)").display.includes("residual"),"Stokes command");
assert(MV.runCommand("gauss(x,y,z; x,y,z; 0,1; 0,1; 0,1)").display.includes("residual"),"Gauss command");
assert(MV.runCommand("mvhelp()").display.includes("directional"),"U2 help");
eq(MV.runCommand("2+2"),null,"ordinary expression ignored by U2 router");

console.log("Multivariable Calculus & Vector Analysis U2 certification tests passed");
