"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../units.js");
require("../linear-algebra.js");
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
nb=doc([block("a","math","1"),block("b","text","note")]);
nb=N.addBlock(nb,"matrix",1,{rows:[["1"]],operation:"det"});
eq(nb.blocks[1].type,"matrix","add block at index");
const matrixId=nb.blocks[1].id;
nb=N.duplicateBlock(nb,matrixId);
eq(nb.blocks[2].type,"matrix","duplicate block");
assert(nb.blocks[2].id!==matrixId,"duplicate new ID");
nb=N.moveBlock(nb,nb.blocks[2].id,0);
eq(nb.blocks[0].type,"matrix","move block");
nb=N.removeBlock(nb,matrixId);
assert(!nb.blocks.some(b=>b.id===matrixId),"remove block");

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

console.log("Worksheets and Notebooks V2 certification tests passed");
