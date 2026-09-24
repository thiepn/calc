"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../cas.js");
require("../multivariable.js");
require("../ode.js");

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
const MV=global.CalcMultivariable;
const O=global.CalcODE;

function assert(cond,msg){if(!cond)throw new Error(msg||"Assertion failed");}
function eq(a,b,msg){if(a!==b)throw new Error((msg||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,tol,msg){if(Math.abs(a-b)>tol*Math.max(1,Math.abs(a),Math.abs(b)))throw new Error((msg||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,msg){
  let ok=false;
  try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((msg||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}
  if(!ok)throw new Error((msg||"Expected error")+": "+code);
}
function evalExpr(e,env){return M.toNumber(M.evaluateAst(e.ast,env||{}, {complex:false,angle:"RAD"},0));}
function residualAt(expr,env){return Math.abs(evalExpr(expr,env));}

// Separable equations expose a verified implicit integral relation.
const sep=O.solveSeparable("x","y","x","y");
assert(sep.toString().includes("y ^ 2")&&sep.toString().includes("x ^ 2"),"separable relation");

// Exact differential equations use the U2 conservative-field verifier.
const ex=O.solveExactFirstOrder("2*x*y","x^2+2*y","x","y");
eq(ex.expression.toString(),"x ^ 2 * y + y ^ 2","exact potential");
for(const env of [{x:0.4,y:-0.8},{x:2,y:3}]){
  approx(evalExpr(C.differentiate(ex.expression,"x"),env),2*env.x*env.y,1e-12,"exact potential M");
  approx(evalExpr(C.differentiate(ex.expression,"y"),env),env.x*env.x+2*env.y,1e-12,"exact potential N");
}
throwsCode(()=>O.solveExactFirstOrder("y","-x","x","y"),"NOT_EXACT","non-exact form rejected");

// First-order linear equation: y' + y = 1.
const lin=O.solveLinearFirstOrder("1","1","x","y"),linD=C.differentiate(lin.expression,"x");
for(const C1 of [-2,0.25,3]){
  for(const x of [-1,-0.2,0.7,2]){
    const env={x,C1},res=evalExpr(linD,env)+evalExpr(lin.expression,env)-1;
    approx(res,0,1e-9,"linear ODE residual");
  }
}

// Bernoulli transformation is certified through its linearized equation.
const ber=O.solveBernoulli("1","1","2","x","y");
assert(ber.toString().startsWith("y ^ -1 ="),"Bernoulli transformed relation");
const u=ber.metadata.transformed,uD=C.differentiate(u,"x");
for(const x of [-0.5,0.2,1]){
  const env={x,C1:1.7};
  approx(evalExpr(uD,env)-evalExpr(u,env),-1,1e-8,"Bernoulli transformed linear residual");
}
throwsCode(()=>O.solveBernoulli("1","1","1","x","y"),"DEGENERATE_BERNOULLI","Bernoulli degeneracy explicit");

// Constant-coefficient second-order homogeneous families.
for(const spec of [
  ["1","-3","2"], // distinct real roots
  ["1","2","1"],  // repeated root
  ["1","0","4"]   // complex roots
]){
  const sol=O.solveSecondOrderHomogeneous(spec[0],spec[1],spec[2],"x","y"),d1=C.differentiate(sol.expression,"x"),d2=C.differentiate(d1,"x"),
    a=Number(spec[0]),b=Number(spec[1]),c=Number(spec[2]);
  for(const x of [-0.6,0,0.8]){
    const env={x,C1:1.2,C2:-0.7},r=a*evalExpr(d2,env)+b*evalExpr(d1,env)+c*evalExpr(sol.expression,env);
    approx(r,0,1e-8,"second-order homogeneous residual");
  }
}
throwsCode(()=>O.solveSecondOrderHomogeneous("0","1","1","x","y"),"DEGENERATE_ORDER","zero leading coefficient");

// ODE Taylor series uses repeated total differentiation along the flow.
const series=O.odeTaylorSeries("x+y","x","y","0","1",5);
for(const x of [-0.08,0.04,0.1]){
  const exact=2*Math.exp(x)-x-1,got=evalExpr(series.expression,{x});
  approx(got,exact,2e-7,"ODE Taylor local solution");
}
throwsCode(()=>O.odeTaylorSeries("x+y","x","y","0","1",9),"INVALID_ORDER","series order cap");

// Laplace transform table.
eq(O.laplaceTransform("1","t","s").toString(),"1 / s","Laplace constant");
eq(O.laplaceTransform("t^2","t","s").toString(),"2 / s ^ 3","Laplace polynomial");
assert(O.laplaceTransform("exp(3*t)","t","s").toString().includes("s - 3"),"Laplace exponential");
assert(O.laplaceTransform("sin(2*t)","t","s").toString().includes("s ^ 2 + 4"),"Laplace sine");
assert(O.laplaceTransform("3*cos(2*t)+t","t","s").toString().includes("3 * s"),"Laplace linearity");
throwsCode(()=>O.laplaceTransform("t*sin(t)","t","s"),"UNSUPPORTED_ODE","unsupported Laplace product explicit");

// Inverse Laplace rational families.
const il1=O.inverseLaplace("1/(s-2)","s","t");
for(const t of [0,0.4,1])approx(evalExpr(il1,{t}),Math.exp(2*t),1e-10,"inverse Laplace linear pole");
const il2=O.inverseLaplace("s/(s^2+4)","s","t");
for(const t of [0,0.4,1])approx(evalExpr(il2,{t}),Math.cos(2*t),1e-10,"inverse Laplace oscillatory");
const il3=O.inverseLaplace("1/(s^2-1)","s","t");
for(const t of [0.2,0.8])approx(evalExpr(il3,{t}),Math.sinh(t),1e-10,"inverse Laplace real poles");

// Convolution theorem primitive.
const conv=O.convolutionAt("1","t","t","2",{absTol:1e-11,relTol:1e-11});
approx(conv.value,2,1e-10,"convolution 1*t at t=2");
throwsCode(()=>O.convolutionAt("1","1","t","-1",{}),"INVALID_TIME","negative Laplace convolution time");

// Dormand-Prince scalar IVP y'=y, y(0)=1.
const iv=O.solveScalarIVP("y","x","y","0","1","1",{absTol:1e-11,relTol:1e-10});
approx(iv.value,Math.E,2e-9,"adaptive scalar IVP");
assert(iv.result.steps>0&&iv.result.rejectedSteps>=0,"RK45 metadata");

// Backward integration.
const back=O.solveScalarIVP("y","x","y","1",String(Math.E),"0",{absTol:1e-11,relTol:1e-10});
approx(back.value,1,3e-9,"backward RK45");

// Fixed-step RK4.
const fn=O.compileSystem(["y"],"x",["y"]),rk4=O.rk4System(fn,0,[1],1,200);
approx(rk4.state[0],Math.E,2e-9,"RK4 exponential");

// Explicit convergence and singularity semantics.
const hard=O.compileSystem(["y"],"x",["y"]);
throwsCode(()=>O.rk45System(hard,0,[1],10,{maxSteps:1,absTol:1e-14,relTol:1e-14}),"ODE_CONVERGENCE","RK45 step budget");
const singular=O.compileSystem(["1/(x-x)"],"x",["y"]);
throwsCode(()=>O.rk45System(singular,0,[0],1,{absTol:1e-10,relTol:1e-9}),"ODE_SINGULARITY","immediately singular RHS");
const pole=O.compileSystem(["1/(x-0.5)"],"x",["y"]);
throwsCode(()=>O.rk45System(pole,0,[0],1,{absTol:1e-10,relTol:1e-9}),"ODE_CONVERGENCE","un-crossable pole produces convergence failure");

// Second-order IVP y''=-y gives sin(x).
const iv2=O.solveSecondOrderIVP("-y","x","y","v","0","0","1","pi/2",{absTol:1e-11,relTol:1e-10});
approx(iv2.value,1,3e-9,"second-order IVP value");
approx(iv2.derivative,0,3e-9,"second-order IVP derivative");

// Forced oscillator y''+y=sin(x), y(0)=y'(0)=0.
const forced=O.solveSecondOrderIVP("sin(x)-y","x","y","v","0","0","0","pi",{absTol:1e-10,relTol:1e-9});
approx(forced.value,Math.PI/2,2e-8,"resonant forced oscillator");

// System IVP: clockwise harmonic oscillator.
const sys=O.solveSystemIVP(["y","-x"],"t",["x","y"],"0",["1","0"],"pi/2",{absTol:1e-11,relTol:1e-10});
approx(sys.result.state[0],0,3e-9,"system IVP x");
approx(sys.result.state[1],-1,3e-9,"system IVP y");

// Sampled trajectories.
const traj=O.sampleTrajectory(["y","-x"],"t",["x","y"],"0",["1","0"],String(2*Math.PI),17,{absTol:1e-10,relTol:1e-9});
eq(traj.points.length,17,"trajectory sample count");
approx(traj.points[16].state[0],1,2e-8,"closed trajectory x");
approx(traj.points[16].state[1],0,2e-8,"closed trajectory y");

// Equilibria and linearization.
const eqp=O.equilibria2("x-y","x+y","x","y");
assert(eqp.toString().includes("x = 0")&&eqp.toString().includes("y = 0"),"linear equilibrium");
const J=O.jacobianAt2("y","-x","x","y","0","0");
eq(J[0][0].toString(),"0","Jacobian 00");
eq(J[0][1].toString(),"1","Jacobian 01");
eq(J[1][0].toString(),"-1","Jacobian 10");
eq(J[1][1].toString(),"0","Jacobian 11");

// Stability classification: hyperbolic cases are conclusive, center remains nonlinear-inconclusive.
eq(O.classifyLinearization2("-x","-2*y","x","y","0","0").classification,"stable node","stable node");
eq(O.classifyLinearization2("x","2*y","x","y","0","0").classification,"unstable node","unstable node");
eq(O.classifyLinearization2("x","-y","x","y","0","0").classification,"saddle","saddle");
eq(O.classifyLinearization2("-x-y","x-y","x","y","0","0").classification,"stable spiral","stable spiral");
const center=O.classifyLinearization2("y","-x","x","y","0","0");
eq(center.classification,"center (linearized)","center classification");
eq(center.stability,"nonlinear stability inconclusive","center nonlinear caution");
throwsCode(()=>O.classifyLinearization2("y","-x","x","y","1","0"),"NOT_EQUILIBRIUM","non-equilibrium rejected");

// Direction fields skip singular grid samples instead of inventing vectors.
const df=O.directionField("y-x","x","y",[-1,1],[-1,1],[5,5]);
eq(df.points.length,25,"finite direction field");
const dfs=O.directionField("1/x","x","y",[-1,1],[-1,1],[5,5]);
assert(dfs.points.length<25&&dfs.points.length>0,"singular direction samples omitted");
throwsCode(()=>O.directionField("z","x","y",[-1,1],[-1,1],[5,5]),"UNSUPPORTED_ODE","unknown direction variable");

// Phase portrait combines normalized field vectors with a certified trajectory.
const phase=O.phasePortrait2("y","-x","x","y",[-2,2],[-2,2],[5,5],["1","0"],["0",String(2*Math.PI)],13,{absTol:1e-10,relTol:1e-9});
eq(phase.vectors.length,25,"phase vector grid");
eq(phase.trajectory.points.length,13,"phase trajectory samples");
approx(phase.trajectory.points[12].state[0],1,2e-8,"phase trajectory closes");

// 2x2 matrix exponential: rotation generator.
const me=O.matrixExponential2("0","-1","1","0","t");
for(const t of [-0.7,0,1.2]){
  approx(evalExpr(me.matrix[0][0],{t}),Math.cos(t),1e-10,"matrix exp cos");
  approx(evalExpr(me.matrix[0][1],{t}),-Math.sin(t),1e-10,"matrix exp -sin");
  approx(evalExpr(me.matrix[1][0],{t}),Math.sin(t),1e-10,"matrix exp sin");
  approx(evalExpr(me.matrix[1][1],{t}),Math.cos(t),1e-10,"matrix exp cos2");
}
const flow=O.linearFlow2("0","-1","1","0","1","0","t");
for(const t of [0,0.3,1]){approx(evalExpr(flow.state[0],{t}),Math.cos(t),1e-10,"linear flow x");approx(evalExpr(flow.state[1],{t}),Math.sin(t),1e-10,"linear flow y");}

// Matrix exponential repeated-eigenvalue/Jordan case.
const jordan=O.matrixExponential2("2","1","0","2","t");
for(const t of [0,0.4]){
  approx(evalExpr(jordan.matrix[0][0],{t}),Math.exp(2*t),1e-10,"Jordan exp diag");
  approx(evalExpr(jordan.matrix[0][1],{t}),t*Math.exp(2*t),1e-10,"Jordan exp superdiag");
}

// Command surface.
assert(O.runCommand("separable(x; y; x; y)").display.includes("+ C"),"separable command");
assert(O.runCommand("exactode(2*x*y; x^2+2*y; x; y)").display.includes("= C"),"exactode command");
assert(O.runCommand("linearode(1; 1; x; y)").display.startsWith("y ="),"linearode command");
assert(O.runCommand("bernoulli(1; 1; 2; x; y)").display.includes("y ^ -1"),"bernoulli command");
assert(O.runCommand("ode2hom(1; 0; 4; x; y)").display.startsWith("y ="),"ode2hom command");
assert(O.runCommand("seriesivp(x+y; x; y; 0,1; 4)").display.includes("O(("),"seriesivp command");
assert(O.runCommand("laplace(t^2; t; s)").display.includes("s ^ 3"),"Laplace command");
assert(O.runCommand("invlaplace(1/(s-2); s; t)").display.includes("exp"),"inverse Laplace command");
assert(O.runCommand("ivp(y; x; y; 0,1; 1)").display.includes("2.718"),"IVP command");
assert(O.runCommand("ivp2(-y; x; y; v; 0,0,1; pi/2)").display.includes("y("),"IVP2 command");
assert(O.runCommand("ivpsystem(y,-x; t; x,y; 0; 1,0; pi/2)").display.includes("y("),"system IVP command");
assert(O.runCommand("rk4(y; x; y; 0; 1; 1; 100)").display.includes("2.718"),"RK4 command");
assert(O.runCommand("trajectory(y,-x; t; x,y; 0,1; 1,0; 5)").display.includes("5 samples"),"trajectory command");
assert(O.runCommand("equilibria(x-y,x+y; x,y)").display.includes("x = 0"),"equilibria command");
assert(O.runCommand("linearize(y,-x; x,y; 0,0)").display.includes("[[0, 1]"),"linearize command");
assert(O.runCommand("stability(y,-x; x,y; 0,0)").display.includes("center"),"stability command");
assert(O.runCommand("directionfield(y-x; x,y; -1,1; -1,1; 5,5)").display.includes("25"),"direction field command");
assert(O.runCommand("phase2(y,-x; x,y; -2,2; -2,2; 5,5; 1,0; 0,1; 5)").display.includes("trajectory 5"),"phase portrait command");
assert(O.runCommand("matrixexp2(0,-1,1,0; t)").display.includes("cos"),"matrix exponential command");
assert(O.runCommand("linearflow2(0,-1,1,0; 1,0; t)").display.includes("sin"),"linear flow command");
assert(O.runCommand("odehelp()").display.includes("bernoulli"),"U3 help");
eq(O.runCommand("2+2"),null,"ordinary expression ignored by U3 router");

console.log("Differential Equations & Dynamical Systems U3 certification tests passed");
