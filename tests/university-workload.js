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
require("../discrete-mathematics.js");
require("../statistics.js");
require("../graph.js");
require("../tools.js");
require("../custom-tools.js");
require("../notebook.js");

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
const CAS=global.CalcCAS;
const MV=global.CalcMultivariable;
const ODE=global.CalcODE;
const U=global.CalcUnits;
const LA=global.CalcLinearAlgebra;
const ALA=global.CalcAdvancedLinearAlgebra;
const OPT=global.CalcOptimization;
const NUM=global.CalcNumerical;
const DISC=global.CalcDiscrete;
const S=global.CalcStatistics;
const G=global.CalcGraph;
const T=global.CalcTools;
const N=global.CalcNotebook;

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,t,m){if(Math.abs(a-b)>t*Math.max(1,Math.abs(a),Math.abs(b)))throw new Error((m||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,m){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}

function route(raw,env){
  env=env||{};
  const opts={angle:"RAD",precision:12,domain:"real"};
  for(const engine of [DISC,NUM,ALA,OPT,ODE,MV,CAS,C,A]){
    const out=engine&&engine.runCommand&&engine.runCommand(raw,opts);
    if(out)return out;
  }
  const quantity=U.tryEvaluate(raw,env,{angle:"RAD",precision:12,commit:true});
  if(quantity)return quantity;
  return M.evaluate(raw,env,{angle:"RAD",precision:12,complex:true,commit:true});
}

function block(id,source){
  return {id:id,type:"math",title:"",source:source,config:{},status:"dirty",dependencies:[],producedSymbols:[],result:{status:"idle",kind:"none",display:"",approx:"",error:null,value:null,serialized:null,metadata:{}},updatedAt:1};
}
function notebook(blocks){
  return {schema:N.SCHEMA,id:"u8-cert",title:"U8 certification",createdAt:1,updatedAt:1,revision:1,blocks:blocks,versions:[],settings:{autoRun:true}};
}

// Versioned university engines must all be present.
eq(CAS.VERSION,"2.0.0-u1","U1 version");
eq(MV.VERSION,"2.1.0-u2","U2 version");
eq(ODE.VERSION,"2.2.0-u3","U3 version");
eq(OPT.VERSION,"2.3.0-u4","U4 version");
eq(ALA.VERSION,"2.4.0-u5","U5 version");
eq(NUM.VERSION,"2.5.0-u6","U6 version");
eq(DISC.VERSION,"2.6.0-u7","U7 version");

// Core exact arithmetic remains the base contract.
let r=route("0.1 + 0.2");
eq(r.display,"3/10","exact decimal arithmetic");
assert(r.exact,"core exactness flag");

// Router ownership across U1-U7.
r=route("assume(x>0; simplify(sqrt(x^2)))");
eq(r.display,"x","U1 assumption-aware simplification");
assert(r.symbolic,"U1 symbolic flag");

r=route("gradat(x^2+y^2; x,y; 1,2)");
eq(r.display,"[2, 4]","U2 gradient");

r=route("stability(y,-x; x,y; 0,0)");
assert(r.display.includes("center (linearized)")&&r.metadata.u3===true,"U3 owns dynamical stability");

r=route("lpmax(3,2; 1,1|1,0|0,1; 4,2,3)");
assert(r.display.includes("objective = 10")&&r.metadata.u4===true,"U4 exact LP");

r=route("matrixfunc(4,0|0,9; sqrt)");
eq(r.display,"[[2, 0], [0, 3]]","U5 matrix function");
assert(r.metadata.u5===true,"U5 metadata");

r=route("quad(x^4; x; 0; 1; 10; simpson)");
approx(M.toNumber(r.value),0.2,1e-10,"U6 quadrature");
assert(r.exact===false&&r.metadata.u6===true,"U6 approximate semantics");

r=route("choose(52; 5)");
eq(r.display,"2598960","U7 exact combinatorics");
assert(r.exact===true&&r.metadata.u7===true&&r.value instanceof M.Rational,"U7 exact semantics");

// Collision-sensitive commands keep their intended owners.
r=route("absstability(rk4; -2; 0)");
assert(r.metadata.u6===true&&!r.metadata.u3,"absolute stability stays U6");
r=route("stability(y,-x; x,y; 0,0)");
assert(r.metadata.u3===true&&!r.metadata.u6,"dynamical stability stays U3");

// Independent engines agree on overlapping mathematics.
eq(route("ncr(10,3)").display,route("choose(10; 3)").display,"core/U7 binomial parity");
eq(route("fib(20)").display,route("linrec(1,1; 0,1; 20)").display,"U7 Fibonacci/recurrence parity");
eq(new LA.Matrix([[1,2],[3,4]]).determinant().toString(),"-2","linear algebra exact determinant");
eq(ALA.runCommand("matrixfunc(4,0|0,9; sqrt)").display,"[[2, 0], [0, 3]]","advanced LA spectral function");
approx(NUM.quadratureDiagnostic("x^2","x",0,1,20,"simpson").value,1/3,1e-12,"numerical integration vs exact analytic value");

// Foundational probability/statistics, units, graphing and tools remain healthy.
approx(new S.Normal(0,1).cdf(0),0.5,1e-12,"standard normal center");
eq(M.formatValue(U.convert(1,"mi","km")),"25146/15625","exact unit conversion");
assert(T.validateRegistry()===true,"specialized tool registry");
let parsed=G.parseGraphText("sin(x)\nimplicit(x^2+y^2-1)\nineq(y<=x^2)",{env:{}});
eq(parsed.errors.length,0,"graph parser integration");
eq(parsed.session.series.length,3,"graph series integration");

// Worksheet composition: exact U7 values and approximate U6 values must survive
// serialization, block references, normalization, and cached re-evaluation.
let doc=notebook([
  block("d1","choose(10; 3)"),
  block("d2","{{block:d1}} / 10"),
  block("n1","interp(0,1,2; 0,1,4; 1.5)"),
  block("n2","{{block:n1}} + 1/4"),
  block("c1","assume(x>0; simplify(sqrt(x^2)))"),
  block("m1","gradat(x^2+y^2; x,y; 1,2)"),
  block("o1","lpmax(3,2; 1,1|1,0|0,1; 4,2,3)"),
  block("g1","chromatic(a,b,c; a-b,b-c,c-a)")
]);
let run=N.evaluateNotebook(doc,{precision:12,angle:"RAD"});
doc=run.document;
assert(doc.blocks.every(b=>b.status==="clean"),"mixed university notebook evaluates cleanly");
eq(doc.blocks[1].result.display,"12","exact U7 block reference");
eq(doc.blocks[3].result.display,"5/2","U6 numeric block reference canonicalizes safely");
assert(doc.blocks[4].result.display.includes("x"),"U1 worksheet result");
assert(doc.blocks[5].result.display.includes("[2, 4]"),"U2 worksheet result");
assert(doc.blocks[6].result.display.includes("objective = 10"),"U4 worksheet result");
assert(doc.blocks[7].result.display.includes("χ = 3"),"U7 graph worksheet result");

// Persisted notebook payloads must remain JSON-safe across all tested result metadata.
const json=JSON.stringify(doc);
assert(json.length>100,"university notebook JSON serialization");
doc=N.normalizeNotebook(JSON.parse(json));
run=N.evaluateNotebook(doc,{precision:12,angle:"RAD"});
assert(run.evaluations.every(e=>e.cached===true),"normalized university notebook reuses cached results");

// Unsupported or unsafe requests fail explicitly.
throwsCode(()=>CAS.runCommand("integrate(exp(-x^2), x)"),"UNSUPPORTED_CAS","U1 unsupported non-elementary integral");
throwsCode(()=>DISC.truthTable("a&b&c&d&e&f&g&h&i"),"DISCRETE_COMPLEXITY_LIMIT","U7 truth-table limit");
throwsCode(()=>DISC.shortestPath(["a","b"],"a-b:-1","a","b",false),"NEGATIVE_EDGE","Dijkstra negative-weight honesty");
throwsCode(()=>NUM.conjugateGradient([[1,2],[2,1]],[1,1],[0,0],{}),"UNSUPPORTED_NUMERICAL_METHOD","U6 SPD requirement");

// Command routers must not consume ordinary arithmetic.
for(const engine of [DISC,NUM,ALA,OPT,ODE,MV,CAS,C,A])assert(engine.runCommand("2+2")===null,"router boundary for "+(engine.VERSION||"engine"));

console.log("U8 final university-workload deterministic certification passed");
