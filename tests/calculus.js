"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;

function assert(cond,msg){if(!cond)throw new Error(msg||"Assertion failed");}
function eq(actual,expected,msg){if(actual!==expected)throw new Error((msg||"Mismatch")+": expected "+expected+", got "+actual);}
function approx(actual,expected,tol,msg){if(Math.abs(actual-expected)>tol)throw new Error((msg||"Approx mismatch")+": expected "+expected+", got "+actual);}
function throwsCode(fn,code,msg){
  let ok=false;
  try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((msg||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}
  if(!ok)throw new Error((msg||"Expected error")+": "+code);
}
function evalSym(expr,env){return M.toNumber(M.evaluateAst(expr.ast,env||{}, {complex:false,angle:"RAD"},0));}

// Symbolic differentiation.
eq(C.differentiate("x^3","x").toString(),"3 * x ^ 2","power rule");
eq(C.differentiate("sin(x)","x").toString(),"cos(x)","sin derivative");
eq(C.differentiate("cos(x)","x").toString(),"-sin(x)","cos derivative");
eq(C.differentiate("ln(x)","x").toString(),"1 / x","log derivative");
eq(C.differentiate("x^5","x",3).toString(),"60 * x ^ 2","higher derivative");

const product=C.differentiate("x^2 * sin(x)","x");
for(const x of [-2,-1,-0.5,0.5,1,2]){
  const got=evalSym(product,{x});
  const expected=2*x*Math.sin(x)+x*x*Math.cos(x);
  approx(got,expected,1e-10,"product rule @ "+x);
}

const partial=C.partialDerivative("x^2*y + y^3","x");
approx(evalSym(partial,{x:2,y:3}),12,1e-12,"partial derivative");

const grad=C.gradient("x^2 + y^2",["x","y"]);
approx(evalSym(grad[0],{x:2,y:3}),4,1e-12,"gradient x");
approx(evalSym(grad[1],{x:2,y:3}),6,1e-12,"gradient y");

const jac=C.jacobian(["x^2+y","x*y"],["x","y"]);
approx(evalSym(jac[0][0],{x:2,y:3}),4,1e-12,"jacobian 00");
approx(evalSym(jac[0][1],{x:2,y:3}),1,1e-12,"jacobian 01");
approx(evalSym(jac[1][0],{x:2,y:3}),3,1e-12,"jacobian 10");
approx(evalSym(jac[1][1],{x:2,y:3}),2,1e-12,"jacobian 11");

const hes=C.hessian("x^2 + 3*x*y + y^2",["x","y"]);
const hev=hes.map(row=>row.map(e=>evalSym(e,{x:2,y:3})));
eq(JSON.stringify(hev),JSON.stringify([[2,3],[3,2]]),"hessian");

const absD=C.differentiate("abs(x)","x");
assert(absD.restrictions.some(r=>r.toString().includes("≠ 0")),"abs derivative restriction");
const sqrtD=C.differentiate("sqrt(x)","x");
assert(sqrtD.restrictions.some(r=>r.toString().includes("> 0")),"sqrt derivative strict restriction");

// Controlled symbolic integration and mandatory verification.
const ip=C.integrate("x^2 + 2*x + 1","x");
assert(ip.verification.verified,"polynomial antiderivative verified");
for(const x of [-2,-1,0,1,2])approx(evalSym(C.differentiate(ip.expression,"x"),{x}),x*x+2*x+1,1e-12,"polynomial antiderivative derivative");

const ix=C.integrate("1/x","x");
assert(ix.toString().includes("ln(abs(x))"),"integral 1/x uses ln abs");
assert(ix.verification.verified,"1/x antiderivative verified");

const isin=C.integrate("sin(2*x)","x");
for(const x of [-1,-0.25,0.5,1.5])approx(evalSym(C.differentiate(isin.expression,"x"),{x}),Math.sin(2*x),1e-10,"sin linear substitution integral");

const iexp=C.integrate("exp(3*x+1)","x");
for(const x of [-1,0,1])approx(evalSym(C.differentiate(iexp.expression,"x"),{x}),Math.exp(3*x+1),1e-9,"exp linear substitution integral");

throwsCode(()=>C.integrate("exp(-x^2)","x"),"UNSUPPORTED_INTEGRAL","unsupported Gaussian antiderivative");

// Definite integrals: exact FTC and numerical fallback.
const exactInt=C.definiteIntegral("x^2","x","0","3");
eq(M.formatValue(exactInt.value),"9","exact definite integral");
assert(exactInt.exact&&exactInt.method==="fundamental-theorem","FTC metadata");

const gauss=C.definiteIntegral("exp(-x^2)","x","0","1");
approx(gauss.value,0.7468241328124271,5e-9,"adaptive Gaussian integral fallback");
assert(!gauss.exact&&gauss.method==="adaptive-simpson","numerical fallback metadata");

const reversed=C.definiteIntegral("x","x","2","0");
eq(M.formatValue(reversed.value),"-2","reversed exact bounds");

throwsCode(()=>C.adaptiveSimpson("1/x","x",-1,1),"SINGULARITY_DETECTED","singular ordinary integral");
throwsCode(()=>C.adaptiveSimpson("sin(1000*x)","x",0,1,{maxDepth:0,absTol:1e-16,relTol:1e-16}),"CONVERGENCE_FAILURE","integration depth exhaustion reports failure");

throwsCode(()=>C.definiteIntegral("exp(-x^2)","x","0","inf"),"UNSUPPORTED_INTEGRAL","improper integrals explicit unsupported");

// Compiled numerical function parity.
const fn=new C.CompiledNumericFunction("sin(x)+x^2","x");
for(const x of [-2,-0.5,0,1.2]){
  approx(fn.evaluate(x),M.evaluateNumber("sin("+x+")+("+x+")^2",{}, {angle:"RAD"}),1e-12,"compiled evaluator parity");
}

// Numerical derivative.
const nd=C.numericalDerivative("sin(x)","x",0);
approx(nd.value,1,1e-8,"numerical derivative sin at 0");
assert(nd.errorEstimate>=0&&nd.method==="central-richardson","numerical derivative metadata");

// Limits.
const removable=C.limit("(x^2-1)/(x-1)","x","1");
eq(removable.toString(),"2","removable rational limit");
assert(removable.exact,"removable limit exact");

const std=C.limit("sin(x)/x","x","0");
eq(std.toString(),"1","standard sin x / x limit");
assert(std.exact,"standard limit exact");

const infLim=C.limit("(2*x^2+1)/(x^2-3)","x","inf");
eq(infLim.toString(),"2","rational infinity limit");

throwsCode(()=>C.limit("1/x","x","0"),"LIMIT_DOES_NOT_EXIST","two-sided pole limit DNE");
const leftPole=C.limit("1/x","x","0","left");
eq(leftPole.toString(),"−∞","left pole limit");
const rightPole=C.limit("1/x","x","0","right");
eq(rightPole.toString(),"∞","right pole limit");
throwsCode(()=>C.limit("sin(1/x)","x","0"),"UNSUPPORTED_LIMIT","unstable numerical sampling is not certified");


// Taylor series.
const tay=C.taylor("exp(x)","x","0",4);
const coeffs=tay.terms.map(t=>M.toNumber(t.coefficient));
approx(coeffs[0],1,1e-12,"taylor c0");
approx(coeffs[1],1,1e-12,"taylor c1");
approx(coeffs[2],0.5,1e-12,"taylor c2");
approx(coeffs[3],1/6,1e-12,"taylor c3");
approx(coeffs[4],1/24,1e-12,"taylor c4");
const tv=evalSym(tay.expression,{x:0.1});
approx(tv,1+0.1+0.1**2/2+0.1**3/6+0.1**4/24,1e-12,"taylor polynomial evaluation");

// Root solvers.
const bis=C.bisection("x^2-2","x",0,2);
approx(bis.root,Math.SQRT2,1e-9,"bisection root");
assert(bis.residual<1e-8,"bisection residual");

throwsCode(()=>C.bisection("x^2+1","x",-1,1),"INVALID_BRACKET","invalid bracket");

const nr=C.newton("cos(x)-x","x",0.5);
approx(nr.root,0.7390851332151607,1e-9,"newton root");
assert(nr.residual<1e-8,"newton residual");

const sr=C.secant("cos(x)-x","x",0,1);
approx(sr.root,0.7390851332151607,1e-9,"secant root");

const hr=C.hybridRoot("cos(x)-x","x",0,1);
approx(hr.root,0.7390851332151607,1e-9,"hybrid root");
assert(hr.method==="hybrid-newton-bisection"&&hr.residual<1e-8,"hybrid metadata");

const token=new C.CancellationToken();token.cancel();
throwsCode(()=>C.bisection("x^2-2","x",0,2,{token}),"CANCELLED","numerical cancellation token");

// Command surface.
eq(C.runCommand("diff(x^3, x)").display,"3 * x ^ 2","diff command");
eq(C.runCommand("gradient(x^2+y^2, x, y)").display,"[2 * x, 2 * y]","gradient command");
eq(C.runCommand("jacobian(x^2+y; x*y, x, y)").display,"[[2 * x, 1], [y, x]]","jacobian command");
eq(C.runCommand("hessian(x^2+3*x*y+y^2, x, y)").display,"[[2, 3], [3, 2]]","hessian command");

assert(C.runCommand("integrate(1/x, x)").display.includes("ln(abs(x))"),"integrate command");
eq(C.runCommand("integral(x^2, x, 0, 3)").display,"9","definite integral command");
eq(C.runCommand("limit(sin(x)/x, x, 0)").display,"1","limit command");
assert(C.runCommand("taylor(exp(x), x, 0, 3)").display.includes("x"),"taylor command");
const rc=C.runCommand("root(cos(x)-x, x, 0, 1)");
approx(rc.value,0.7390851332151607,1e-9,"root command value");
const nc=C.runCommand("nderivative(sin(x), x, 0)");
approx(nc.value,1,1e-8,"numerical derivative command");
const nic=C.runCommand("nintegral(exp(-x^2), x, 0, 1)");
approx(nic.value,0.7468241328124271,5e-9,"numerical integral command");
eq(C.runCommand("2+2"),null,"ordinary expression ignored by calculus command router");

// Unsupported cases remain explicit.
throwsCode(()=>C.differentiate("ncr(x,2)","x"),"UNSUPPORTED_DERIVATIVE","unsupported discrete function derivative");

console.log("Calculus and numerical methods certification tests passed");
