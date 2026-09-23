"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../cas.js");

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
const CAS=global.CalcCAS;

function assert(cond,msg){if(!cond)throw new Error(msg||"Assertion failed");}
function eq(actual,expected,msg){if(actual!==expected)throw new Error((msg||"Mismatch")+": expected "+expected+", got "+actual);}
function approx(actual,expected,tol,msg){if(Math.abs(actual-expected)>tol)throw new Error((msg||"Approx mismatch")+": expected "+expected+", got "+actual);}
function throwsCode(fn,code,msg){
  let ok=false;
  try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((msg||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}
  if(!ok)throw new Error((msg||"Expected error")+": "+code);
}
function evalSym(expr,env){return M.toNumber(M.evaluateAst(expr.ast,env||{}, {complex:false,angle:"RAD"},0));}

// Assumption-aware simplification and domain pruning.
eq(CAS.runCommand("assume(x>0; simplify(sqrt(x^2)))").display,"x","positive square-root simplification");
eq(CAS.runCommand("assume(x<0; simplify(abs(x)))").display,"-x","negative absolute-value simplification");
eq(CAS.runCommand("assume(x>0; simplify(exp(ln(x))))").display,"x","positive log/exp composition");
throwsCode(()=>CAS.runCommand("assume(x>0; x<0; simplify(x))"),"CONTRADICTORY_ASSUMPTIONS","contradictory assumptions rejected");
eq(CAS.runCommand("assume(x>0; solve(x^2=4, x))").display,"x = 2","assumptions filter exact roots");

// Parameterized and stronger exact equation solving.
const parameterLine=CAS.runCommand("solve(a*x+b=0, x)");
assert(parameterLine.display.includes("a ≠ 0")&&parameterLine.display.includes("a = 0 and b = 0")&&parameterLine.display.includes("a = 0 and b ≠ 0"),"linear parameter branches");

const parameterQuadratic=CAS.runCommand("solve(a*x^2+b*x+c=0, x)");
assert(parameterQuadratic.display.includes("/ (2 * a)"),"quadratic symbolic denominator keeps precedence");
assert(parameterQuadratic.display.includes("b ^ 2 - 4 * a * c > 0"),"real discriminant branches");

const even=CAS.runCommand("solve(x^4-2=0, x)");
assert(even.display.includes("sqrt(sqrt(2))")&&even.display.includes("-sqrt(sqrt(2))"),"biquadratic exact substitution");

const trig0=CAS.runCommand("solve(sin(2*x)=0, x)");
assert(trig0.display.includes("k ∈ ℤ")&&trig0.display.includes("pi"),"canonical trigonometric family");
const trigGeneral=CAS.runCommand("solve(sin(x)=1/2, x)");
assert(trigGeneral.display.includes("asin(1/2)")&&trigGeneral.display.includes("or")&&trigGeneral.display.includes("k ∈ ℤ"),"general sine solution families");
const tanGeneral=CAS.runCommand("solve(tan(3*x+1)=2, x)");
assert(tanGeneral.display.includes("atan(2)")&&tanGeneral.display.includes("k ∈ ℤ"),"general tangent family");
eq(CAS.runCommand("solve(sin(x)=2, x)").display,"∅","out-of-range real trig target");

throwsCode(()=>CAS.runCommand("solve(sin(x)+x=0, x)"),"UNSUPPORTED_CAS","unsupported transcendental equation remains explicit");

// Advanced systems.
const nonlinear=CAS.runCommand("system(x+y=3; x*y=2)");
assert(nonlinear.display.includes("{x = 2, y = 1}")&&nonlinear.display.includes("{x = 1, y = 2}"),"two-variable nonlinear substitution system");

const ps=CAS.runCommand("psystem(x,y; a*x+y=1; x+a*y=2)");
assert(ps.display.includes("a ^ 2 - 1 ≠ 0"),"parameter system generic determinant branch");
assert(ps.display.includes("x = (a - 2) / (a ^ 2 - 1)")&&ps.display.includes("y = (2 * a - 1) / (a ^ 2 - 1)"),"parameter system Cramer solution");
assert(ps.display.includes("a = 1: No solution")&&ps.display.includes("a = -1: No solution"),"parameter singular branches");

const psFree=CAS.runCommand("psystem(x,y; a*x+y=1; x+a*y=1)");
assert(psFree.display.includes("a = 1:")&&psFree.display.includes("free: y"),"parameter singular infinite-family branch");

// Polynomial and rational inequality sign charts.
eq(CAS.runCommand("inequality(x^3-x>0, x)").display,"x ∈ (-1, 0) ∪ (1, ∞)","cubic inequality");
eq(CAS.runCommand("inequality(x^4-1<=0, x)").display,"x ∈ [-1, 1]","quartic inequality");
eq(CAS.runCommand("inequality((x+1)/(x-2)>=0, x)").display,"x ∈ (−∞, -1] ∪ (2, ∞)","rational inequality excludes pole");

// Advanced symbolic integration remains verified before exposure.
const ibp=CAS.integrateAdvanced("x*exp(x)","x");
assert(ibp.verification.verified&&ibp.method==="u1-cas","integration-by-parts candidate certified");
for(const x of [-2,-0.5,0.5,2])approx(evalSym(C.differentiate(ibp.expression,"x"),{x}),x*Math.exp(x),1e-9,"IBP derivative parity @ "+x);

const trigInt=CAS.integrateAdvanced("x*sin(x)","x");
assert(trigInt.verification.verified,"polynomial-trig antiderivative certified");
for(const x of [-2,-0.5,0.5,2])approx(evalSym(C.differentiate(trigInt.expression,"x"),{x}),x*Math.sin(x),1e-9,"trig integral derivative parity @ "+x);

const rationalInt=CAS.integrateAdvanced("1/(x^2+1)","x");
assert(rationalInt.toString().includes("atan(x)")&&rationalInt.verification.verified,"quadratic rational integral");
for(const x of [-2,-0.5,0,0.5,2])approx(evalSym(C.differentiate(rationalInt.expression,"x"),{x}),1/(x*x+1),1e-9,"rational integral derivative parity @ "+x);

const mixedRational=CAS.integrateAdvanced("(2*x+3)/(x^2+x+1)","x");
assert(mixedRational.verification.verified,"linear-over-quadratic rational integral certified");

throwsCode(()=>CAS.runCommand("integrate(exp(-x^2), x)"),"UNSUPPORTED_CAS","unsupported non-elementary integral remains explicit");

// Router boundaries and help.
assert(CAS.runCommand("cashelp()").display.includes("U1 CAS"),"CAS help surface");
eq(CAS.runCommand("2+2"),null,"ordinary input ignored by CAS router");

console.log("Advanced CAS U1 certification tests passed");
