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
const T=global.CalcTools;
const CT=global.CalcCustomTools;
const N=global.CalcNotebook;

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,t,m){if(Math.abs(a-b)>t)throw new Error((m||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,m){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}

function block(id,type,source,config){
  return {id:id,type:type,source:source||"",config:config||{},status:"dirty",dependencies:[],producedSymbols:[],result:{status:"idle",kind:"none",display:"",approx:"",error:null,value:null,serialized:null,metadata:{}}};
}
function doc(blocks){
  return {schema:N.SCHEMA,id:"nb1",title:"Notebook",createdAt:1,updatedAt:1,revision:1,blocks:blocks,versions:[],settings:{autoRun:true}};
}

// Legacy migration.
const legacy={id:"legacy",title:"Old worksheet",createdAt:1,updatedAt:2,revision:3,blocks:[{id:"m1",type:"math",source:"a=5"},{id:"t1",type:"text",source:"hello"}]};
const migrated=N.normalizeNotebook(legacy);
eq(migrated.schema,N.SCHEMA,"legacy schema migration");
eq(migrated.blocks.length,2,"legacy block count");
eq(migrated.blocks[0].type,"math","legacy math type");
eq(migrated.blocks[1].type,"text","legacy text type");

// Top-down symbols and dependency graph.
let nb=doc([
  block("b1","math","a = 5"),
  block("b2","math","a * 2"),
  block("b3","math","{{block:b2}} + 1")
]);
let graph=N.buildDependencies(nb);
eq(JSON.stringify(graph.errors),JSON.stringify([]),"dependency graph has no errors");
eq(JSON.stringify(nb.blocks[1].dependencies),JSON.stringify(["b1"]),"symbol dependency inferred");
eq(JSON.stringify(nb.blocks[2].dependencies),JSON.stringify(["b2"]),"explicit block dependency");

let run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});
nb=run.document;
eq(nb.blocks[0].status,"clean","assignment block clean");
eq(nb.blocks[1].result.display,"10","downstream symbol result");
eq(nb.blocks[2].result.display,"11","typed block reference result");
eq(N.deserializeValue(nb.blocks[1].result.serialized).toString(),"10","exact result serialization");
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});
assert(run.evaluations.every(function(e){return e.cached===true||e.blockId==="b1"&&e.cached===true;}),"second evaluation reuses clean cached blocks");

// U1 CAS uses the same Worksheet Math evaluation surface.
nb=doc([
  block("cas1","math","assume(x>0; simplify(sqrt(x^2)))"),
  block("cas2","math","solve(a*x+b=0, x)")
]);
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});nb=run.document;
eq(nb.blocks[0].status,"clean","assumption-aware CAS block clean");
eq(nb.blocks[0].result.display,"x assuming x>0","assumption-aware CAS block result");
assert(nb.blocks[1].result.display.includes("a ≠ 0")&&nb.blocks[1].result.display.includes("a = 0 and b = 0"),"parameterized CAS block result");
assert(!nb.blocks[0].dependencies.includes("assume")&&!nb.blocks[1].dependencies.includes("solve"),"CAS command names are not notebook dependencies");

// U2 multivariable/vector commands share the Worksheet Math surface.
nb=doc([
  block("u2a","math","gradat(x^2+y^2; x,y; 1,2)"),
  block("u2b","math","lineint(-y,x; x,y; cos(t),sin(t); t; 0,2*pi)"),
  block("u2c","math","green(-y,x; x,y; 0,1; 0,1)")
]);
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});nb=run.document;
eq(nb.blocks[0].status,"clean","U2 gradient block clean");
eq(nb.blocks[0].result.display,"[2, 4]","U2 gradient block result");
assert(nb.blocks[1].result.display.includes("6.283"),"U2 line integral block result");
assert(nb.blocks[2].result.display.includes("residual 0"),"U2 theorem block result");
assert(!nb.blocks[0].dependencies.includes("gradat")&&!nb.blocks[1].dependencies.includes("lineint")&&!nb.blocks[2].dependencies.includes("green"),"U2 command names are not notebook dependencies");

// U3 ODE/dynamical commands share the Worksheet Math evaluator.
nb=doc([
  block("u3a","math","linearode(1; 1; x; y)"),
  block("u3b","math","ivp(y; x; y; 0,1; 1)"),
  block("u3c","math","stability(y,-x; x,y; 0,0)"),
  block("u3d","math","laplace(t^2; t; s)")
]);
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});nb=run.document;
eq(nb.blocks[0].status,"clean","U3 symbolic ODE block clean");
assert(nb.blocks[0].result.display.startsWith("y ="),"U3 symbolic ODE result");
assert(nb.blocks[1].result.display.includes("2.718"),"U3 adaptive IVP result");
assert(nb.blocks[2].result.display.includes("center"),"U3 stability result");
assert(nb.blocks[3].result.display.includes("s ^ 3"),"U3 Laplace result");
assert(!nb.blocks[0].dependencies.includes("linearode")&&!nb.blocks[1].dependencies.includes("ivp")&&!nb.blocks[2].dependencies.includes("stability")&&!nb.blocks[3].dependencies.includes("laplace"),"U3 command names are not notebook dependencies");

// U4 optimization commands share the Worksheet Math evaluator.
nb=doc([
  block("u4a","math","convexity(x^2+2*y^2; x,y)"),
  block("u4b","math","optmin((x-1)^2+(y+2)^2; x,y; 3,3; bfgs)"),
  block("u4c","math","lpmax(3,2; 1,1|1,0|0,1; 4,2,3)"),
  block("u4d","math","quadprog(x^2+y^2; x,y; x+y-1; -x,-y)")
]);
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});nb=run.document;
eq(nb.blocks[0].status,"clean","U4 convexity block clean");
assert(nb.blocks[0].result.display.includes("strictly convex"),"U4 convexity result");
assert(nb.blocks[1].result.display.includes("optimum"),"U4 local optimization result");
assert(nb.blocks[2].result.display.includes("objective = 10"),"U4 LP result");
assert(nb.blocks[3].result.display.includes("f = 0.5"),"U4 QP result");
assert(!nb.blocks[0].dependencies.includes("convexity")&&!nb.blocks[1].dependencies.includes("optmin")&&!nb.blocks[2].dependencies.includes("lpmax")&&!nb.blocks[3].dependencies.includes("quadprog"),"U4 command names are not notebook dependencies");

// U5 advanced linear-algebra commands share the Worksheet Math evaluator.
nb=doc([
  block("u5a","math","jordanv2(2,1,0|0,2,1|0,0,2)"),
  block("u5b","math","spectral(2,1|1,2)"),
  block("u5c","math","inertia(2,0|0,-3)"),
  block("u5d","math","condreport(1,0|0,0.001)")
]);
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});nb=run.document;
eq(nb.blocks[0].status,"clean","U5 Jordan block clean");
assert(nb.blocks[0].result.display.includes("block sizes = [3]"),"U5 Jordan result");
assert(nb.blocks[1].result.display.includes("eigenvalues"),"U5 spectral result");
assert(nb.blocks[2].result.display.includes("inertia = (1, 1, 0)"),"U5 inertia result");
assert(nb.blocks[3].result.display.includes("cond2 = 1000"),"U5 condition result");
assert(!nb.blocks[0].dependencies.includes("jordanv2")&&!nb.blocks[1].dependencies.includes("spectral")&&!nb.blocks[2].dependencies.includes("inertia")&&!nb.blocks[3].dependencies.includes("condreport"),"U5 command names are not notebook dependencies");

// U5 Matrix-block operations route through the advanced matrix layer.
nb=doc([
  block("u5m1","matrix","",{rows:[["2","1"],["1","2"]],operation:"spectral"}),
  block("u5m2","matrix","",{rows:[["2","0"],["0","-3"]],operation:"inertia"}),
  block("u5m3","matrix","",{rows:[["1","0"],["0","0.001"]],operation:"cond"})
]);
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});nb=run.document;
eq(nb.blocks[0].status,"clean","U5 spectral matrix block clean");
assert(nb.blocks[0].result.display.includes("real-symmetric-spectral-theorem"),"U5 spectral matrix-block display");
assert(nb.blocks[1].result.display.includes("inertia = (1, 1, 0)"),"U5 inertia matrix-block display");
assert(nb.blocks[2].result.display.includes("cond2 = 1000"),"U5 condition matrix-block display");

// U6 numerical-analysis commands share the Worksheet Math evaluator.
nb=doc([
  block("u6a","math","floatinfo(1)"),
  block("u6b","math","rootcompare(cos(x)-x; x; 0,1; 0.5,1)"),
  block("u6c","math","quad(x^4; x; 0; 1; 10; simpson)"),
  block("u6d","math","cg(4,1|1,3; 1,2; 0,0; 20)"),
  block("u6e","math","odeorder(y; x; y; 0; 1; 1; 10; rk4)")
]);
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});nb=run.document;
eq(nb.blocks[0].status,"clean","U6 float block clean");
assert(nb.blocks[0].result.display.includes("2.22044604925031308e-16"),"U6 float result");
assert(nb.blocks[1].result.display.includes("hybrid"),"U6 root comparison result");
assert(nb.blocks[2].result.display.includes("I ≈ 0.2"),"U6 quadrature result");
assert(nb.blocks[3].result.display.includes("iterations = 2"),"U6 CG result");
assert(nb.blocks[4].result.display.includes("observed p"),"U6 ODE convergence result");
assert(!nb.blocks[0].dependencies.includes("floatinfo")&&!nb.blocks[1].dependencies.includes("rootcompare")&&!nb.blocks[2].dependencies.includes("quad")&&!nb.blocks[3].dependencies.includes("cg")&&!nb.blocks[4].dependencies.includes("odeorder"),"U6 command names are not notebook dependencies");

// Approximate numerical block references must remain approximate instead of
// being promoted to exact Rational values from their decimal string.
nb=doc([
  block("u6ref1","math","interp(0,1,2; 0,1,4; 1.5)"),
  block("u6ref2","math","{{block:u6ref1}} + 1/4")
]);
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});nb=run.document;
eq(nb.blocks[0].result.metadata.exact,false,"U6 source result remains approximate");
eq(nb.blocks[1].result.metadata.exact,false,"approximate block reference preserves provenance");
eq(nb.blocks[1].result.serialized.type,"primitive","approximate downstream result stays a real primitive");
approx(N.deserializeValue(nb.blocks[1].result.serialized),2.5,1e-12,"approximate reference arithmetic");
assert(!nb.blocks[1].result.display.includes("/2500000000000000"),"approximate reference is not exposed as a false exact rational");

// Quantity assignment + typed reference preserves units.
nb=doc([
  block("q1","math","d = 5 km"),
  block("q2","math","{{block:q1}} / 2")
]);
run=N.evaluateNotebook(nb,{precision:12,angle:"RAD"});nb=run.document;
assert(nb.blocks[0].result.display.includes("d = 5 km"),"quantity assignment display");
assert(nb.blocks[1].result.display.includes("5/2 km"),"quantity reference stays quantity");

// Forward and missing references are explicit errors.
nb=doc([
  block("f1","math","{{block:f2}} + 1"),
  block("f2","math","2")
]);
run=N.evaluateNotebook(nb,{});nb=run.document;
eq(nb.blocks[0].status,"error","forward reference error");
assert(nb.blocks[0].result.error.includes("earlier block"),"forward reference message");

nb=doc([block("m","math","{{block:nope}}+1")]);
run=N.evaluateNotebook(nb,{});nb=run.document;
eq(nb.blocks[0].status,"error","missing reference error");

// Dirty/stale propagation.
nb=doc([
  block("a","math","x=2"),
  block("b","math","x+1"),
  block("c","math","{{block:b}}*3"),
  block("d","math","100")
]);
run=N.evaluateNotebook(nb,{});nb=run.document;
nb=N.markDirty(nb,"a");
eq(nb.blocks[0].status,"dirty","edited source dirty");
eq(nb.blocks[1].status,"stale","symbol dependent stale");
eq(nb.blocks[2].status,"stale","transitive dependent stale");
eq(nb.blocks[3].status,"clean","independent block remains clean");

// Removing an old symbol definition still invalidates its former dependents.
nb=doc([
  block("s1","math","a=5"),
  block("s2","math","a+1")
]);
run=N.evaluateNotebook(nb,{});nb=run.document;
nb.blocks[0].source="z=5";
nb=N.markDirty(nb,"s1");
eq(nb.blocks[1].status,"stale","old dependency edge preserved during invalidation");

// Error blocks block explicit dependents but independent later blocks continue.
nb=doc([
  block("e1","math","1/0"),
  block("e2","math","{{block:e1}}+2"),
  block("e3","math","7")
]);
run=N.evaluateNotebook(nb,{});nb=run.document;
eq(nb.blocks[0].status,"error","upstream error");
eq(nb.blocks[1].status,"blocked","dependent block blocked");
eq(nb.blocks[2].status,"clean","independent block still runs");
eq(nb.blocks[2].result.display,"7","independent result");

// Tool block, including a custom tool by stable ID.
const customDraft=CT.normalizeManifest({
  id:"nb-custom",name:"Double",mode:"formula",status:"draft",
  variables:[{name:"x",type:"number",default:1}],expression:"x*2",output:{type:"scalar"},
  tests:[{inputs:{x:3},expected:{value:6}}]
});
const customActive=CT.activate(customDraft).manifest;
CT.installActive(customActive,T.REGISTRY);

nb=doc([
  block("v","math","21"),
  block("tool","tool","",{toolId:"custom."+customActive.id,inputs:{x:"{{block:v}}"}})
]);
run=N.evaluateNotebook(nb,{precision:12});nb=run.document;
eq(nb.blocks[1].status,"clean","custom tool block clean");
eq(nb.blocks[1].result.display,"42","custom tool block result");
CT.uninstall(customActive,T.REGISTRY);

// Matrix block with exact output and block reference.
nb=doc([
  block("m1","matrix","",{rows:[["1","2"],["3","4"]],operation:"det"}),
  block("m2","math","{{block:m1}} + 3")
]);
run=N.evaluateNotebook(nb,{});nb=run.document;
eq(nb.blocks[0].result.display,"-2","matrix determinant block");
eq(nb.blocks[1].result.display,"1","matrix scalar result reference");

// Data blocks.
nb=doc([
  block("data","data","x,y\n1,2\n2,4\n3,6",{operation:"summary"}),
  block("corr","data","x,y\n1,2\n2,4\n3,6",{operation:"correlation",x:"x",y:"y"}),
  block("reg","data","x,y\n1,3\n2,5\n3,7",{operation:"regression",x:"x",response:"y",predictors:["x"]})
]);
run=N.evaluateNotebook(nb,{});nb=run.document;
assert(nb.blocks[0].result.display.includes("x: n=3"),"data summary block");
assert(nb.blocks[1].result.display.includes("Pearson r = 1"),"data correlation block");
assert(nb.blocks[2].result.display.includes("R²=1"),"data regression block");

// Graph block.
nb=doc([
  block("g","graph","sin(x)\nslider(a;1;-2;2;0.1)\na*x",{viewport:{xMin:-5,xMax:5,yMin:-5,yMax:5}})
]);
run=N.evaluateNotebook(nb,{});nb=run.document;
eq(nb.blocks[0].status,"clean","graph block clean");
assert(nb.blocks[0].result.display.includes("2 graph series"),"graph session summary");

// Block references inside config.
nb=doc([
  block("n","math","200"),
  block("p","tool","",{toolId:"percentage-of",inputs:{value:"{{block:n}}",percent:15}})
]);
run=N.evaluateNotebook(nb,{});nb=run.document;
eq(nb.blocks[1].result.display,"30","tool config block reference");

// Edit transaction and versioning.
nb=doc([block("x","math","1"),block("y","math","{{block:x}}+1")]);
run=N.evaluateNotebook(nb,{});nb=run.document;
const beforeRevision=nb.revision;
nb=N.applyEdit(nb,"x",{source:"2"});
eq(nb.revision,beforeRevision+1,"edit increments revision");
eq(nb.versions.length,1,"edit creates snapshot");
eq(nb.blocks[0].status,"dirty","edited block dirty after transaction");
eq(nb.blocks[1].status,"stale","dependent stale after transaction");

const restored=N.restoreVersion(nb,0);
eq(restored.title,"Notebook","version restore title");
assert(restored.revision>nb.revision,"restore creates newer revision");
assert(restored.blocks.every(b=>b.status==="dirty"),"restored computational blocks dirty");

// Add/remove/move/duplicate.
nb=doc([block("a","math","1"),block("b","math","2"),block("t","text","note")]);
run=N.evaluateNotebook(nb,{});nb=run.document;
eq(nb.blocks[1].status,"clean","structural fixture starts clean");
nb=N.addBlock(nb,"matrix",1,{rows:[["1"]],operation:"det"});
eq(nb.blocks[1].type,"matrix","add block at index");
eq(nb.blocks[2].status,"stale","insertion invalidates downstream computation");
const matrixId=nb.blocks[1].id;
nb=N.duplicateBlock(nb,matrixId);
eq(nb.blocks[2].type,"matrix","duplicate block");
assert(nb.blocks[2].id!==matrixId,"duplicate new ID");
nb=N.moveBlock(nb,nb.blocks[2].id,0);
eq(nb.blocks[0].type,"matrix","move block");
nb=N.removeBlock(nb,matrixId);
assert(!nb.blocks.some(b=>b.id===matrixId),"remove block");
assert(nb.blocks.filter(function(b){return b.type!=="text";}).every(function(b){return b.status==="stale"||b.status==="dirty";}),"removal invalidates remaining computational blocks");

// Structured export/import.
nb=doc([block("a","math","1/3"),block("t","text","hello")]);
run=N.evaluateNotebook(nb,{});nb=run.document;
const exported=N.exportNotebook(nb);
eq(exported.schema,N.SCHEMA,"export schema");
eq(exported.notebook.versions.length,0,"export strips versions");
assert(exported.notebook.blocks.every(b=>b.result.serialized===null),"export strips cached results");
const imported=N.importNotebook(JSON.stringify(exported));
assert(imported.id!==nb.id,"import new notebook ID");
assert(imported.title.includes("(imported)"),"import title marker");
assert(imported.blocks.every(b=>b.status==="dirty"),"import blocks dirty");

// Markdown export is readable and includes results.
const md=N.markdownExport(nb);
assert(md.includes("# Notebook"),"markdown title");
assert(md.includes("1/3"),"markdown source/result");

// Recovery safe mode isolates invalid blocks.
const broken={schema:N.SCHEMA,id:"broken",title:"Broken",blocks:[
  {id:"ok",type:"math",source:"2+2"},
  {id:"bad",type:"not-a-type",source:"x"}
]};
const recovery=N.recoveryNormalize(broken);
assert(recovery.recovered,"recovery triggered");
assert(recovery.document.recovery.safeMode,"safe mode marked");
eq(recovery.document.blocks.length,2,"recovery preserves block count");
eq(recovery.document.blocks[1].type,"text","invalid block quarantined as text");

// Serialization codec.
const r=new M.Rational(1n,7n);
eq(N.deserializeValue(N.serializeValue(r)).toString(),"1/7","Rational codec");
const q=global.CalcUnits.quantityFromUnit(new M.Rational(5n),"km");
eq(global.CalcUnits.formatQuantity(N.deserializeValue(N.serializeValue(q))),"5 km","Quantity codec");

// Max block bound.
const tooMany={schema:N.SCHEMA,id:"many",title:"Many",blocks:Array.from({length:N.MAX_BLOCKS+1},(_,i)=>block("b"+i,"text","x"))};
throwsCode(()=>N.normalizeNotebook(tooMany),"NOTEBOOK_SCHEMA_ERROR","block budget enforced");

// Imported block IDs become DOM-selector keys in the UI; reject unsafe syntax.
throwsCode(()=>N.normalizeBlock({id:'bad"]#selector',type:"math",source:"1+1"},0),"NOTEBOOK_SCHEMA_ERROR","unsafe block ID rejected");
const safeImported=N.importNotebook(JSON.stringify({schema:N.SCHEMA,notebook:{schema:N.SCHEMA,id:"source",title:"Safe import",blocks:[{id:"block-safe_1:ok",type:"math",source:"1+1"}]}}));
eq(safeImported.blocks[0].id,"block-safe_1:ok","safe imported block ID preserved");
assert(N.MAX_IMPORT_BYTES>=1024*1024,"notebook import limit exported");

console.log("Worksheets and Notebooks V2 certification tests passed");
