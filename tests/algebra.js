"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
const M=global.CalcMath;
const A=global.CalcAlgebra;

function assert(cond,msg){if(!cond)throw new Error(msg||"Assertion failed");}
function eq(actual,expected,msg){if(actual!==expected)throw new Error((msg||"Mismatch")+": expected "+expected+", got "+actual);}
function approx(actual,expected,tol,msg){if(Math.abs(actual-expected)>tol)throw new Error((msg||"Approx mismatch")+": expected "+expected+", got "+actual);}
function throwsCode(fn,code,msg){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((msg||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((msg||"Expected error")+": "+code);}

// Symbolic objects and canonical simplification.
eq(A.simplify("x + 0").toString(),"x","additive identity");
eq(A.simplify("x - x").toString(),"0","self subtraction");
eq(A.simplish ? "unused" : "ok","ok","API sanity");
eq(A.simplify("x*x").toString(),"x ^ 2","repeated factor");
eq(A.simplify("2 + 3/2").toString(),"7/2","exact constant folding");
eq(A.simplify("sqrt(8)").toString(),"2 * sqrt(2)","radical square-factor simplification");
eq(A.simplify("sqrt(1/8)").toString(),"1/4 * sqrt(2)","rational radical simplification");

// Rational cancellation must retain original domain restrictions.
const cancelled=A.simplify("(x^2 - 1)/(x - 1)","x");
eq(cancelled.toString(),"x + 1","rational-function cancellation");
assert(cancelled.restrictions.some(r=>r.toString().includes("x - 1")&&r.toString().includes("≠ 0")),"cancelled denominator restriction preserved");

// Expansion and polynomial recognition.
eq(A.expand("(x + 1)^3","x").toString(),"x ^ 3 + 3 * x ^ 2 + 3 * x + 1","binomial expansion");
const p=A.Polynomial.fromAst(M.parseExpression("2*x^3 - 3*x + 5"),"x");
eq(p.degree,3,"polynomial degree");
eq(p.derivative().toString(),"6 * x ^ 2 - 3","polynomial derivative");
eq(p.evaluate(new M.Rational(2n)).toString(),"15","polynomial exact evaluation");

// Factoring.
const f1=A.factor("x^2 - 1","x").toString();
assert(f1.includes("x - 1")&&f1.includes("x + 1"),"difference of squares factoring");
const f2=A.factor("x^2 - 5*x + 6","x").toString();
assert(f2.includes("x - 2")&&f2.includes("x - 3"),"quadratic rational factoring");

// Substitution.
eq(A.substitute("x^2 + y",{x:"3",y:"4"}).toString(),"13","simultaneous substitution");
eq(A.substitute("x + y",{x:"y",y:"x"}).toString(),"x + y","simultaneous substitution does not cascade");

// Linear and quadratic equations.
eq(A.solveEquation("2*x + 3 = 7","x").toString(),"x = 2","linear equation");
eq(A.solveEquation("x^2 - 5*x + 6 = 0","x").toString(),"x ∈ {3, 2}","quadratic exact roots");
const irr=A.solveEquation("x^2 - 2 = 0","x");
eq(irr.type,"finite","irrational quadratic finite roots");
eq(irr.values.length,2,"irrational quadratic two roots");
assert(irr.values.every(v=>v.verified),"quadratic candidates verified");

// Rational equation extraneous/domain protection.
const rational=A.solveEquation("(x^2 - 1)/(x - 1) = 0","x");
eq(rational.toString(),"x = -1","rational equation filters excluded point");
assert(rational.restrictions.some(r=>r.toString().includes("≠ 0")),"rational equation retains restriction");
const noSol=A.solveEquation("(x - 1)/(x - 1) = 0","x");
eq(noSol.type,"empty","cancelled identity respects excluded point");

// Absolute and radical patterns with verification.
const abs=A.solveEquation("abs(x - 3) = 2","x");
assert(abs.values.map(v=>v.toString()).sort().join(",")==="1,5","absolute value equation");
const radical=A.solveEquation("sqrt(x + 1) = 3","x");
eq(radical.toString(),"x = 8","radical equation");
eq(A.solveEquation("sqrt(x) = -1","x").type,"empty","negative square-root target has no real solution");

// Real/complex quadratic domain.
eq(A.solveEquation("x^2 + 1 = 0","x").type,"empty","negative discriminant has no real roots by default");
const complex=A.solveEquation("x^2 + 1 = 0","x",{domain:"complex"});
eq(complex.values.length,2,"complex quadratic roots");

// Linear systems.
const unique=A.solveLinearSystem(["x + y = 3","x - y = 1"]);
eq(unique.type,"unique","unique system classification");
eq(unique.values.x.toString(),"2","system x");
eq(unique.values.y.toString(),"1","system y");

const param=A.solveLinearSystem(["x + y + z = 3","x - y = 1"]);
eq(param.type,"parametric","underdetermined system classification");
assert(param.freeVariables.length===1,"one free variable");
const inconsistent=A.solveLinearSystem(["x + y = 1","x + y = 2"]);
eq(inconsistent.type,"inconsistent","inconsistent system classification");

// Inequalities.
eq(A.solveInequality("2*x - 4 >= 0","x").toString(),"[2, ∞)","linear inequality");
eq(A.solveInequality("x^2 - 1 <= 0","x").toString(),"[-1, 1]","quadratic bounded inequality");
eq(A.solveInequality("x^2 + 1 < 0","x").toString(),"∅","always-positive inequality");

// Domain restrictions from functions.
const sqrtExpr=new A.SymbolicExpression("sqrt(x - 2)");
assert(sqrtExpr.restrictions.some(r=>r.toString().includes(">= 0")||r.toString().includes("≥ 0")),"sqrt real-domain restriction");
const logExpr=new A.SymbolicExpression("ln(x)");
assert(logExpr.restrictions.some(r=>r.toString().includes("> 0")),"log real-domain restriction");

// Serialization of symbolic expressions.
const original=A.simplify("(x^2 - 1)/(x - 1)","x");
const wire=JSON.parse(JSON.stringify(original.toJSON()));
const restored=A.SymbolicExpression.fromJSON(wire);
eq(restored.toString(),original.toString(),"symbolic serialization expression");
eq(restored.restrictions.map(r=>r.toString()).join("|"),original.restrictions.map(r=>r.toString()).join("|"),"symbolic serialization restrictions");

// Calculate command surface.
const simplifyCommand=A.runCommand("simplify((x^2-1)/(x-1))");
assert(simplifyCommand.display.startsWith("x + 1")&&simplifyCommand.display.includes("≠ 0"),"simplify command surfaces domain restriction");
const solveCommand=A.runCommand("solve(x^2 - 5*x + 6 = 0, x)");
assert(solveCommand.display.includes("x ∈"),"solve command");
eq(A.runCommand("substitute(x^2 + 1, x, 3)").display,"10","substitute command");
eq(A.runCommand("inequality(x^2 - 1 <= 0, x)").display,"x ∈ [-1, 1]","inequality command");
eq(A.runCommand("2+2"),null,"ordinary input ignored by algebra command router");

// Unsupported operations fail honestly instead of claiming no solution.
throwsCode(()=>A.solveEquation("sin(x) = 0","x"),"UNSUPPORTED_SYMBOLIC","unsupported transcendental solving");
throwsCode(()=>A.solveInequality("x^3 - 1 > 0","x"),"UNSUPPORTED_SYMBOLIC","higher inequality explicitly unsupported");

// Polynomial reconstruction property checks.
let seed=0xA17EBA;
function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed;}
for(let t=0;t<150;t++){
  const coeff=[];
  for(let d=0;d<=4;d++)coeff.push(new M.Rational(BigInt((rnd()%21)-10),BigInt((rnd()%7)+1)));
  const poly=new A.Polynomial("x",coeff);
  const ast=poly.toAst();
  const parsed=A.Polynomial.fromAst(ast,"x");
  for(let x=-3;x<=3;x++){
    const xv=new M.Rational(BigInt(x));
    eq(parsed.evaluate(xv).toString(),poly.evaluate(xv).toString(),"polynomial reconstruction "+t+" @ "+x);
  }
}

console.log("Symbolic algebra certification tests passed");