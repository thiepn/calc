"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../units.js");
require("../tools.js");
require("../custom-tools.js");

const M=global.CalcMath;
const U=global.CalcUnits;
const T=global.CalcTools;
const CT=global.CalcCustomTools;

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,t,m){if(Math.abs(a-b)>t)throw new Error((m||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,m){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}

// Formula draft and staged validation.
let draft=CT.newFormulaDraft();
eq(draft.schema,CT.SCHEMA,"schema");
eq(draft.status,"draft","new draft status");
let report=CT.validationReport(draft);
assert(report.ok,"default formula draft validates: "+JSON.stringify(report.stages)+" tests="+JSON.stringify(report.tests));
assert(report.stages.every(s=>s.pass),"all default validation stages pass");

let result=CT.executeManifest(draft,{x:7},{precision:12});
eq(M.toNumber(result.value),14,"formula execution");
eq(result.display,"14","formula display");

// Exact numeric formula.
const exact=CT.normalizeManifest({
  id:"exact-test",name:"Exact third",mode:"formula",status:"draft",
  variables:[{name:"x",type:"number",default:1}],
  expression:"x/3",output:{type:"scalar"},
  tests:[{inputs:{x:3},expected:{value:1}}]
});
const exactResult=CT.executeManifest(exact,{x:1},{});
eq(M.formatValue(exactResult.value),"1/3","numeric custom formula keeps Rational exactness");

// Constraints.
const constrained=CT.normalizeManifest({
  id:"constraints",name:"Constraints",mode:"formula",status:"draft",
  variables:[{name:"x",type:"number",positive:true,nonzero:true,min:1,max:10,default:2}],
  expression:"sqrt(x)",output:{type:"scalar"},
  tests:[{inputs:{x:4},expected:{value:2}}]
});
assert(CT.validationReport(constrained).ok,"constraint formula validates");
throwsCode(()=>CT.executeManifest(constrained,{x:0},{}),"CUSTOM_TOOL_VALIDATION_ERROR","positive/nonzero enforced");
throwsCode(()=>CT.executeManifest(constrained,{x:11},{}),"CUSTOM_TOOL_VALIDATION_ERROR","max constraint enforced");

// Quantity formula and dimension conversion.
const speed=CT.normalizeManifest({
  id:"speed",name:"Speed",mode:"formula",status:"draft",
  variables:[
    {name:"distance",label:"Distance",type:"quantity",unit:"km",default:100,positive:true},
    {name:"time",label:"Time",type:"quantity",unit:"hr",default:2,positive:true}
  ],
  expression:"distance/time",
  output:{type:"quantity",unit:"km/hr",label:"Speed"},
  tests:[{name:"100 km / 2h",inputs:{distance:100,time:2},expected:{display:"50 km/hr"}}]
});
report=CT.validationReport(speed);
assert(report.ok,"quantity formula dimensionally validates");
result=CT.executeManifest(speed,{distance:36,time:0.5},{});
eq(result.display,"72 km/hr","quantity formula output conversion");
assert(result.value instanceof U.Quantity,"quantity formula returns Quantity");

const badDimension=Object.assign({},speed,{id:"bad-dim",output:{type:"quantity",unit:"kg"}});
report=CT.validationReport(badDimension,{skipTests:true});
assert(!report.ok,"dimension mismatch blocked");
assert(report.stages.some(s=>s.stage==="semantic"&&!s.pass),"dimension mismatch semantic stage");

// Scalar relation solving with exactly one blank.
const relation=CT.normalizeManifest({
  id:"distance-rel",name:"Distance relation",mode:"relation",status:"draft",
  variables:[
    {name:"d",label:"Distance",type:"number",required:false,default:""},
    {name:"v",label:"Speed",type:"number",required:false,default:10},
    {name:"t",label:"Time",type:"number",required:false,default:2}
  ],
  relation:"d = v*t",
  tests:[{name:"solve d",inputs:{d:"",v:10,t:2},expected:{value:20}}]
});
assert(CT.validationReport(relation).ok,"relation validates");
result=CT.executeManifest(relation,{d:"",v:12,t:3},{});
eq(M.toNumber(result.value),36,"relation solves missing target");
eq(result.target,"d","relation target name");
throwsCode(()=>CT.executeManifest(relation,{d:"",v:"",t:3},{}),"CUSTOM_TOOL_VALIDATION_ERROR","relation requires exactly one missing");

const quantityRelation=Object.assign({},relation,{id:"quantity-rel",variables:[
  {name:"d",type:"quantity",unit:"m",required:false},
  {name:"v",type:"number",required:false},
  {name:"t",type:"number",required:false}
]});
report=CT.validationReport(quantityRelation,{skipTests:true});
assert(!report.ok,"quantity relation explicitly unsupported");

// AST allowlist / sandbox behavior.
const unknown=CT.normalizeManifest({
  id:"unknown",name:"Unknown",mode:"formula",status:"draft",
  variables:[{name:"x",type:"number",default:1}],
  expression:"fetch(x)",output:{type:"scalar"},
  tests:[{inputs:{x:1},expected:{value:1}}]
});
report=CT.validationReport(unknown,{skipTests:true});
assert(!report.ok,"unknown function rejected");

const proto=CT.normalizeManifest({
  id:"proto",name:"Proto",mode:"formula",status:"draft",
  variables:[{name:"x",type:"number",default:1}],
  expression:"constructor+x",output:{type:"scalar"},
  tests:[{inputs:{x:1},expected:{value:1}}]
});
report=CT.validationReport(proto,{skipTests:true});
assert(!report.ok,"forbidden identifier rejected");

// Activation requires at least one passing test.
const noTests=CT.normalizeManifest({
  id:"no-tests",name:"No tests",mode:"formula",status:"draft",
  variables:[{name:"x",type:"number",default:1}],expression:"x+1",output:{type:"scalar"},tests:[]
});
throwsCode(()=>CT.activate(noTests),"CUSTOM_TOOL_VALIDATION_ERROR","activation requires tests");

const badTest=CT.normalizeManifest({
  id:"bad-test",name:"Bad test",mode:"formula",status:"draft",
  variables:[{name:"x",type:"number",default:1}],expression:"x+1",output:{type:"scalar"},
  tests:[{inputs:{x:1},expected:{value:99}}]
});
report=CT.validationReport(badTest);
assert(!report.ok&&report.tests[0].pass===false,"failing test blocks activation");

const activated=CT.activate(draft);
eq(activated.manifest.status,"active","activation status");
assert(activated.report.ok,"activation report");
assert(activated.manifest.revision===draft.revision+1,"activation increments revision");
assert(activated.manifest.history.length===1,"activation snapshot");

// Dynamic registry installation and execution.
const installed=CT.installActive(activated.manifest,T.REGISTRY);
assert(installed&&installed.id==="custom."+draft.id,"custom tool installed");
const regOut=T.REGISTRY.execute(installed.id,{x:5},{});
eq(regOut.display,"10","installed custom formula executes through ToolRegistry");
CT.uninstall(activated.manifest,T.REGISTRY);
assert(!T.REGISTRY.get(installed.id),"custom tool uninstalled");

// Revision and archive lifecycle.
const revised=CT.revise(activated.manifest,{name:"My formula revised",expression:"x*3"});
eq(revised.status,"draft","editing returns to draft");
eq(revised.revision,activated.manifest.revision+1,"revision increments");
assert(revised.history.length===2,"revision snapshot retained");
const archived=CT.archive(revised);
eq(archived.status,"archived","archive status");
assert(archived.history.length===3,"archive snapshot retained");

// Built-in duplication is a safe proxy, not copied JavaScript.
const proxy=CT.duplicateBuiltIn("percentage-of");
eq(proxy.mode,"builtin-proxy","built-in duplicate proxy mode");
eq(proxy.status,"draft","duplicate begins draft");
assert(CT.validationReport(proxy).ok,"proxy parity test passes");
const proxyActive=CT.activate(proxy).manifest;
CT.installActive(proxyActive,T.REGISTRY);
const proxyOut=T.REGISTRY.execute("custom."+proxy.id,{value:300,percent:10},{});
eq(proxyOut.display,"30","proxy delegates to certified built-in runtime");
CT.uninstall(proxyActive,T.REGISTRY);
throwsCode(()=>CT.duplicateBuiltIn("unit-converter"),"CUSTOM_TOOL_VALIDATION_ERROR","specialized built-in proxy blocked");

// Strict export/import.
const exported=CT.exportManifest(activated.manifest);
eq(exported.schema,CT.SCHEMA,"export schema");
eq(exported.tool.status,"draft","export never carries active status");
assert(!("history" in exported.tool),"export omits revision history");
const imported=CT.importManifest(JSON.stringify(exported));
eq(imported.status,"draft","import forced draft");
assert(imported.id!==activated.manifest.id,"import receives new ID");
assert(CT.validationReport(imported).ok,"imported manifest validates");

const malicious=JSON.parse(JSON.stringify(exported));
malicious.evil=true;
throwsCode(()=>CT.importManifest(JSON.stringify(malicious)),"CUSTOM_TOOL_IMPORT_ERROR","unknown import root key rejected");

const badSchema=JSON.parse(JSON.stringify(exported));badSchema.schema="other/v9";
throwsCode(()=>CT.importManifest(JSON.stringify(badSchema)),"CUSTOM_TOOL_IMPORT_ERROR","unknown schema rejected");

throwsCode(()=>CT.importManifest("{nope"),"CUSTOM_TOOL_IMPORT_ERROR","invalid JSON rejected");
throwsCode(()=>CT.importManifest(JSON.stringify({schema:CT.SCHEMA,tool:{name:"x",mode:"formula",variables:[],expression:"fetch(1)",output:{type:"scalar"}}})),"CUSTOM_TOOL_IMPORT_ERROR","semantic-invalid import rejected");

// Library behavior.
const library=new CT.CustomToolLibrary([activated.manifest,imported]);
eq(library.list().length,2,"library count");
eq(library.list("active").length,1,"library status filter");
library.installAll(T.REGISTRY);
assert(T.REGISTRY.get("custom."+activated.manifest.id),"library installs active tools");
CT.uninstall(activated.manifest,T.REGISTRY);

// Compiler does not use Function/eval and formula source remains declarative.
const compiled=CT.compile(activated.manifest,{skipTests:true});
assert(compiled.tool instanceof T.ToolDefinition,"compiler returns ToolDefinition");
eq(compiled.manifest.expression,"x*2","declarative formula retained");

console.log("Custom Formula Builder certification tests passed");
