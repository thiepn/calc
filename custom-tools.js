(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
const U=global.CalcUnits;
const T=global.CalcTools;
if(!M||!A||!U||!T)throw new Error("CalcMath, CalcAlgebra, CalcUnits and CalcTools must load before CalcCustomTools");

const SCHEMA="calc.custom-tool/v1";
const MAX_JSON_BYTES=100000;
const MAX_EXPRESSION=4000;
const MAX_VARIABLES=24;
const MAX_TESTS=50;
const MAX_HISTORY=25;
const SAFE_NAME=/^[A-Za-z_][A-Za-z0-9_]*$/;
const FORBIDDEN_NAMES=new Set(["__proto__","prototype","constructor"]);
const MODES=new Set(["formula","relation","builtin-proxy"]);
const STATUSES=new Set(["draft","active","archived"]);
const VARIABLE_TYPES=new Set(["number","integer","percent","quantity"]);

class CustomToolError extends M.CalcError{
  constructor(code,message,details){super(code||"CUSTOM_TOOL_ERROR",message,undefined,undefined,details);}
}
class CustomToolSchemaError extends CustomToolError{constructor(message,details){super("CUSTOM_TOOL_SCHEMA_ERROR",message,details);}}
class CustomToolValidationError extends CustomToolError{constructor(message,details){super("CUSTOM_TOOL_VALIDATION_ERROR",message,details);}}
class CustomToolTestError extends CustomToolError{constructor(message,details){super("CUSTOM_TOOL_TEST_ERROR",message,details);}}
class CustomToolImportError extends CustomToolError{constructor(message,details){super("CUSTOM_TOOL_IMPORT_ERROR",message,details);}}

function clone(v){return JSON.parse(JSON.stringify(v));}
function now(){return Date.now();}
function makeId(){
  if(global.crypto&&typeof global.crypto.randomUUID==="function")return global.crypto.randomUUID();
  return "ct-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
}
function plainNumber(v,name){
  const n=Number(v);if(!Number.isFinite(n))throw new CustomToolValidationError((name||"Value")+" must be finite");return n;
}
function sourceNumber(v){
  if(v instanceof M.Rational||v instanceof M.Complex)return M.formatValue(v,17);
  const n=Number(v);if(!Number.isFinite(n))throw new CustomToolValidationError("Relation inputs must be finite scalars");
  return Number.isInteger(n)?String(n):M.formatNumber(n,17);
}
function splitRelation(source){
  source=String(source||"");let depth=0,at=-1;
  for(let i=0;i<source.length;i++){
    if(source[i]==="(")depth++;
    else if(source[i]===")")depth--;
    else if(source[i]==="="&&depth===0&&source[i-1]!=="<"&&source[i-1]!==">"&&source[i-1]!=="!"&&source[i+1]!=="="){
      if(at>=0)throw new CustomToolSchemaError("Relation mode requires exactly one top-level '='");
      at=i;
    }
  }
  if(depth!==0||at<1||at>=source.length-1)throw new CustomToolSchemaError("Relation mode requires 'left = right'");
  return {left:source.slice(0,at).trim(),right:source.slice(at+1).trim()};
}
function walkAst(ast,visit){
  if(!ast)return;visit(ast);
  if(ast.type==="unary"||ast.type==="postfix")walkAst(ast.arg,visit);
  else if(ast.type==="binary"){walkAst(ast.left,visit);walkAst(ast.right,visit);}
  else if(ast.type==="call")(ast.args||[]).forEach(a=>walkAst(a,visit));
}
function builtinConstant(name){
  return !!(M.CONSTANT_REGISTRY&&Object.prototype.hasOwnProperty.call(M.CONSTANT_REGISTRY,name))||
    !!(U.CONSTANT_REGISTRY&&Object.prototype.hasOwnProperty.call(U.CONSTANT_REGISTRY,name));
}
function validateAst(ast,variableNames){
  const unknown=[],functions=[],identifiers=[];
  walkAst(ast,function(node){
    if(node.type==="identifier"){
      const name=node.name;identifiers.push(name);
      if(FORBIDDEN_NAMES.has(name))unknown.push(name);
      else if(!variableNames.has(name)&&!builtinConstant(name)&&!U.UNIT_REGISTRY.get(name))unknown.push(name);
    }else if(node.type==="call"){
      const name=node.name;functions.push(name);
      if(FORBIDDEN_NAMES.has(name)||!(M.FUNCTION_REGISTRY&&Object.prototype.hasOwnProperty.call(M.FUNCTION_REGISTRY,name)))unknown.push(name+"()");
    }else if(!["literal","identifier","unary","postfix","binary","call"].includes(node.type)){
      unknown.push("<"+node.type+">");
    }
  });
  if(unknown.length)throw new CustomToolValidationError("Formula contains unsupported identifiers/functions",{unknown:Array.from(new Set(unknown))});
  return {identifiers:Array.from(new Set(identifiers)),functions:Array.from(new Set(functions))};
}
function variableInputSchema(v,relationMode){
  let type=v.type==="integer"?"integer":v.type==="percent"?"percent":"number";
  const out={id:v.name,label:v.label||v.name+(v.type==="quantity"&&v.unit?" ("+v.unit+")":v.type==="percent"?" (%)":""),type:type,required:relationMode?false:v.required!==false,default:v.default};
  if(v.min!==null&&v.min!==undefined)out.min=v.min;
  if(v.max!==null&&v.max!==undefined)out.max=v.max;
  return out;
}
function normalizeVariable(v,index){
  if(!v||typeof v!=="object")throw new CustomToolSchemaError("Variable "+(index+1)+" must be an object");
  const name=String(v.name||"").trim();if(!SAFE_NAME.test(name)||FORBIDDEN_NAMES.has(name))throw new CustomToolSchemaError("Invalid variable name '"+name+"'");
  const type=String(v.type||"number");if(!VARIABLE_TYPES.has(type))throw new CustomToolSchemaError("Unsupported variable type '"+type+"'");
  const out={name:name,label:String(v.label||name),type:type,required:v.required!==false,default:v.default===undefined?"":v.default,unit:v.unit?String(v.unit).trim():null,min:v.min===undefined||v.min===null||v.min===""?null:Number(v.min),max:v.max===undefined||v.max===null||v.max===""?null:Number(v.max),nonzero:!!v.nonzero,positive:!!v.positive,description:String(v.description||"")};
  if(out.min!==null&&!Number.isFinite(out.min))throw new CustomToolSchemaError(name+" min must be finite");
  if(out.max!==null&&!Number.isFinite(out.max))throw new CustomToolSchemaError(name+" max must be finite");
  if(out.min!==null&&out.max!==null&&out.max<out.min)throw new CustomToolSchemaError(name+" max must be >= min");
  if(type==="quantity"){if(!out.unit)throw new CustomToolSchemaError("Quantity variable '"+name+"' needs a unit");try{U.parseQuantityExpression("1*("+out.unit+")",{},{});}catch(e){throw new CustomToolSchemaError("Invalid unit for '"+name+"': "+e.message);}}
  return out;
}
function normalizeTest(t,index){
  if(!t||typeof t!=="object"||Array.isArray(t))throw new CustomToolSchemaError("Test "+(index+1)+" must be an object");
  if(!t.inputs||typeof t.inputs!=="object"||Array.isArray(t.inputs))throw new CustomToolSchemaError("Test "+(index+1)+" needs an inputs object");
  const expected=t.expected&&typeof t.expected==="object"?clone(t.expected):{};
  if(expected.value===undefined&&expected.display===undefined)throw new CustomToolSchemaError("Test "+(index+1)+" needs expected.value or expected.display");
  return {name:String(t.name||("Test "+(index+1))),inputs:clone(t.inputs),expected:expected,tolerance:t.tolerance===undefined?1e-9:Number(t.tolerance)};
}
function normalizeManifest(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new CustomToolSchemaError("Custom tool manifest must be an object");
  const mode=String(raw.mode||"formula"),status=String(raw.status||"draft").toLowerCase();
  if(!MODES.has(mode))throw new CustomToolSchemaError("Unsupported custom-tool mode '"+mode+"'");
  if(!STATUSES.has(status))throw new CustomToolSchemaError("Unsupported custom-tool status '"+status+"'");
  const vars=(raw.variables||[]).map(normalizeVariable);if(vars.length>MAX_VARIABLES)throw new CustomToolSchemaError("Custom tools support at most "+MAX_VARIABLES+" variables");
  const names=new Set();for(const v of vars){if(names.has(v.name))throw new CustomToolSchemaError("Duplicate variable '"+v.name+"'");names.add(v.name);}
  const tests=(raw.tests||[]).map(normalizeTest);if(tests.length>MAX_TESTS)throw new CustomToolSchemaError("Custom tools support at most "+MAX_TESTS+" tests");
  const m={
    schema:SCHEMA,
    id:String(raw.id||makeId()),
    name:String(raw.name||"Untitled custom tool").trim().slice(0,120),
    description:String(raw.description||"").slice(0,1000),
    aliases:Array.isArray(raw.aliases)?raw.aliases.map(String).slice(0,20):[],
    mode:mode,status:status,variables:vars,tests:tests,
    expression:mode==="formula"?String(raw.expression||"").trim():null,
    relation:mode==="relation"?String(raw.relation||"").trim():null,
    output:mode==="formula"?Object.assign({type:"scalar",unit:null,label:"Result"},raw.output||{}):null,
    baseToolId:mode==="builtin-proxy"?String(raw.baseToolId||""):null,
    createdAt:Number(raw.createdAt)||now(),updatedAt:Number(raw.updatedAt)||now(),
    revision:Math.max(1,Number(raw.revision)||1),
    history:Array.isArray(raw.history)?raw.history.slice(-MAX_HISTORY):[]
  };
  if(!m.name)throw new CustomToolSchemaError("Custom tool name is required");
  if(mode==="formula"&&(!m.expression||m.expression.length>MAX_EXPRESSION))throw new CustomToolSchemaError("Formula expression is required and limited to "+MAX_EXPRESSION+" characters");
  if(mode==="relation"&&(!m.relation||m.relation.length>MAX_EXPRESSION))throw new CustomToolSchemaError("Relation expression is required and limited to "+MAX_EXPRESSION+" characters");
  if(mode==="builtin-proxy"&&!m.baseToolId)throw new CustomToolSchemaError("Built-in proxy requires baseToolId");
  if(m.output&&m.output.type!=="scalar"&&m.output.type!=="quantity")throw new CustomToolSchemaError("Formula output type must be scalar or quantity");
  if(m.output&&m.output.type==="quantity"&&!m.output.unit)throw new CustomToolSchemaError("Quantity output requires an output unit");
  return m;
}
function sampleRaw(v){
  if(v.default!==undefined&&v.default!==null&&v.default!=="")return v.default;
  if(v.positive)return 1;
  if(v.nonzero)return 1;
  if(v.min!==null&&v.min>0)return v.min;
  return 1;
}
function parseRuntimeInputs(manifest,raw,relationMode){
  const out={};
  for(const v of manifest.variables){
    let value=raw[v.name];
    const blank=value===undefined||value===null||value==="";
    if(blank){
      if(relationMode){out[v.name]=null;continue;}
      if(v.required!==false&&v.default==="")throw new CustomToolValidationError(v.label+" is required",{variable:v.name});
      value=v.default;
    }
    if(value===undefined||value===null||value===""){out[v.name]=null;continue;}
    let n=plainNumber(value,v.label);
    if(v.type==="integer"&&!Number.isInteger(n))throw new CustomToolValidationError(v.label+" must be an integer");
    if(v.type==="percent")n/=100;
    const constraintValue=v.type==="percent"?n*100:n;
    if(v.min!==null&&constraintValue<v.min)throw new CustomToolValidationError(v.label+" must be >= "+v.min);
    if(v.max!==null&&constraintValue>v.max)throw new CustomToolValidationError(v.label+" must be <= "+v.max);
    if(v.nonzero&&n===0)throw new CustomToolValidationError(v.label+" must be nonzero");
    if(v.positive&&n<=0)throw new CustomToolValidationError(v.label+" must be positive");
    out[v.name]=n;
  }
  return out;
}
function formulaEnv(manifest,parsed){
  const env={};
  for(const v of manifest.variables){
    const value=parsed[v.name];
    if(value===null)continue;
    env[v.name]=v.type==="quantity"?U.quantityFromUnit(value,v.unit):M.Rational.fromDecimal(String(value));
  }
  return env;
}
function formatFormulaResult(manifest,value,context){
  context=context||{};const p=context.precision||12;
  if(manifest.output.type==="quantity"){
    if(!(value instanceof U.Quantity))throw new CustomToolValidationError("Formula output is not a quantity");
    const converted=U.convertQuantity(value,manifest.output.unit);
    return {value:converted,display:U.formatQuantity(converted,p),approx:U.approxQuantity(converted,p),exact:converted.exact};
  }
  if(value instanceof U.Quantity)throw new CustomToolValidationError("Formula produced a quantity but output is declared scalar");
  return {value:value,display:M.formatValue(value,p),approx:M.approxString(value,p),exact:M.isExactValue(value)};
}
function executeFormula(manifest,rawInputs,context){
  const parsed=parseRuntimeInputs(manifest,rawInputs,false),env=formulaEnv(manifest,parsed),options={angle:context&&context.angle||"RAD",precision:context&&context.precision||12,commit:false};
  let res=U.tryEvaluate(manifest.expression,env,options);
  if(res)return Object.assign(formatFormulaResult(manifest,res.value,context),{parsedInputs:parsed});
  res=M.evaluate(manifest.expression,env,{angle:options.angle,precision:options.precision,commit:false,complex:false});
  return Object.assign(formatFormulaResult(manifest,res.value,context),{parsedInputs:parsed});
}
function executeRelation(manifest,rawInputs,context){
  const parsed=parseRuntimeInputs(manifest,rawInputs,true),missing=manifest.variables.filter(v=>parsed[v.name]===null);
  if(missing.length!==1)throw new CustomToolValidationError("Relation tools require exactly one blank variable",{missing:missing.map(v=>v.name)});
  const target=missing[0],mapping={};for(const v of manifest.variables)if(v.name!==target.name)mapping[v.name]=sourceNumber(parsed[v.name]);
  const parts=splitRelation(manifest.relation),left=A.substitute(parts.left,mapping),right=A.substitute(parts.right,mapping),solutions=A.solveEquation(left.toString()+" = "+right.toString(),target.name,{domain:"real"});
  if(solutions.type!=="finite"||solutions.values.length!==1)throw new CustomToolValidationError("Relation did not produce exactly one real solution",{solutionType:solutions.type,count:solutions.values&&solutions.values.length});
  const sv=solutions.values[0],value=M.evaluateAst(sv.expression.ast,{}, {complex:false,angle:"RAD"},0);
  return {value:value,display:target.label+" = "+M.formatValue(value,context&&context.precision||12),approx:M.approxString(value,context&&context.precision||12),exact:M.isExactValue(value),target:target.name,parsedInputs:parsed};
}
function executeProxy(manifest,rawInputs,context){
  const base=T.REGISTRY.get(manifest.baseToolId);if(!base||String(base.id).startsWith("custom."))throw new CustomToolValidationError("Proxy base tool is unavailable");
  const merged={};for(const v of manifest.variables){let x=rawInputs[v.name];if(x===undefined||x===null||x==="")x=v.default;merged[v.name]=x;}
  return T.REGISTRY.execute(base.id,merged,context||{});
}
function executeManifest(manifest,rawInputs,context){
  if(manifest.mode==="formula")return executeFormula(manifest,rawInputs,context||{});
  if(manifest.mode==="relation")return executeRelation(manifest,rawInputs,context||{});
  return executeProxy(manifest,rawInputs,context||{});
}
function validateFormulaSemantics(manifest,report){
  const vars=new Set(manifest.variables.map(v=>v.name)),ast=M.parseExpression(manifest.expression),astInfo=validateAst(ast,vars);report.ast=astInfo;
  const sample={};manifest.variables.forEach(v=>sample[v.name]=sampleRaw(v));
  try{
    const res=executeFormula(manifest,sample,{precision:12,angle:"RAD"});
    report.sampleResult=res.display;
  }catch(e){throw new CustomToolValidationError("Formula semantic/dimensional validation failed: "+e.message,{cause:e.code||e.message});}
}
function validateRelationSemantics(manifest,report){
  if(manifest.variables.some(v=>v.type==="quantity"))throw new CustomToolValidationError("Relation mode is scalar-only in custom-tools v1");
  const vars=new Set(manifest.variables.map(v=>v.name)),parts=splitRelation(manifest.relation);
  report.leftAst=validateAst(M.parseExpression(parts.left),vars);report.rightAst=validateAst(M.parseExpression(parts.right),vars);
}
function validateProxy(manifest,report){
  const base=T.REGISTRY.get(manifest.baseToolId);if(!base)throw new CustomToolValidationError("Unknown base tool '"+manifest.baseToolId+"'");
  if(base.specialized)throw new CustomToolValidationError("Specialized built-ins cannot be duplicated as proxies in v1");
  if(String(base.id).startsWith("custom."))throw new CustomToolValidationError("Custom tools cannot proxy other custom tools");
  report.baseTool={id:base.id,name:base.name,version:base.version};
}
function compareExpected(actual,expected,tolerance){
  if(expected.display!==undefined)return String(actual.display)===String(expected.display)?{pass:true}:{pass:false,message:"expected display '"+expected.display+"', got '"+actual.display+"'"};
  const av=actual.value instanceof M.Rational?actual.value.toNumber():typeof actual.value==="number"?actual.value:Number(actual.value);
  const ev=Number(expected.value);if(!Number.isFinite(av)||!Number.isFinite(ev))return {pass:false,message:"numeric expected comparison requires finite scalar result"};
  const tol=Number.isFinite(Number(tolerance))?Number(tolerance):1e-9,ok=Math.abs(av-ev)<=tol*Math.max(1,Math.abs(ev));return ok?{pass:true}:{pass:false,message:"expected "+ev+" ± "+tol+", got "+av};
}
function runTests(manifest){
  const results=[];for(let i=0;i<manifest.tests.length;i++){
    const test=manifest.tests[i];try{const actual=executeManifest(manifest,test.inputs,{precision:14,angle:"RAD"}),cmp=compareExpected(actual,test.expected,test.tolerance);results.push({name:test.name,pass:cmp.pass,message:cmp.message||"",actual:actual.display});}
    catch(e){results.push({name:test.name,pass:false,message:e.message,code:e.code||"ERROR"});}
  }return results;
}
function validationReport(raw,options){
  options=options||{};const report={ok:false,stages:[],warnings:[],tests:[]};let manifest;
  try{manifest=normalizeManifest(raw);report.stages.push({stage:"schema",pass:true});}
  catch(e){report.stages.push({stage:"schema",pass:false,message:e.message});report.error=e;return report;}
  try{
    if(manifest.mode==="formula")validateFormulaSemantics(manifest,report);
    else if(manifest.mode==="relation")validateRelationSemantics(manifest,report);
    else validateProxy(manifest,report);
    report.stages.push({stage:"semantic",pass:true});
  }catch(e){report.stages.push({stage:"semantic",pass:false,message:e.message});report.error=e;report.manifest=manifest;return report;}
  if(!options.skipTests){
    report.tests=runTests(manifest);
    const all=report.tests.length>0&&report.tests.every(t=>t.pass);
    report.stages.push({stage:"tests",pass:all,message:report.tests.length?undefined:"At least one test is required for activation"});
    if(!all){report.manifest=manifest;return report;}
  }
  report.ok=true;report.manifest=manifest;return report;
}
function compile(raw,options){
  options=options||{};const report=validationReport(raw,{skipTests:!!options.skipTests});if(!report.ok&&!options.allowInvalid)throw report.error||new CustomToolValidationError("Custom tool validation failed",{report:report});
  const manifest=report.manifest||normalizeManifest(raw),relationMode=manifest.mode==="relation";let inputs;
  if(manifest.mode==="builtin-proxy"){
    const base=T.REGISTRY.get(manifest.baseToolId);inputs=base.inputs.map(input=>{const override=manifest.variables.find(v=>v.name===input.id);return Object.assign({},input,override&&override.default!==""?{default:override.default}:{});});
  }else inputs=manifest.variables.map(v=>variableInputSchema(v,relationMode));
  const tool=new T.ToolDefinition({
    id:"custom."+manifest.id,name:manifest.name,category:"Custom",description:manifest.description,aliases:manifest.aliases,version:manifest.revision,enabled:manifest.status==="active",inputs:inputs,
    run:function(parsedInputs,context){const out=executeManifest(manifest,parsedInputs,context||{});return {display:out.display,value:out.value,details:{customToolId:manifest.id,revision:manifest.revision,mode:manifest.mode,target:out.target||null},warnings:[]};}
  });
  return {manifest:manifest,tool:tool,report:report};
}

function snapshot(manifest){
  const c=clone(manifest);delete c.history;return {revision:manifest.revision,status:manifest.status,updatedAt:manifest.updatedAt,manifest:c};
}
function revise(raw,patch){
  const current=normalizeManifest(raw),history=(current.history||[]).concat([snapshot(current)]).slice(-MAX_HISTORY),next=Object.assign({},current,clone(patch||{}),{revision:current.revision+1,updatedAt:now(),status:"draft",history:history});return normalizeManifest(next);
}
function activate(raw){
  const manifest=normalizeManifest(raw),report=validationReport(manifest);if(!report.ok)throw new CustomToolValidationError("Custom tool cannot be activated until every validation stage passes",{report:report});
  const history=(manifest.history||[]).concat([snapshot(manifest)]).slice(-MAX_HISTORY),next=normalizeManifest(Object.assign({},manifest,{status:"active",revision:manifest.revision+1,updatedAt:now(),history:history}));
  return {manifest:next,compiled:compile(next,{skipTests:true}),report:report};
}
function archive(raw){
  const manifest=normalizeManifest(raw),history=(manifest.history||[]).concat([snapshot(manifest)]).slice(-MAX_HISTORY);return normalizeManifest(Object.assign({},manifest,{status:"archived",revision:manifest.revision+1,updatedAt:now(),history:history}));
}
function newFormulaDraft(){
  return normalizeManifest({id:makeId(),name:"My formula",description:"",mode:"formula",status:"draft",variables:[{name:"x",label:"x",type:"number",default:1}],expression:"x*2",output:{type:"scalar",label:"Result"},tests:[{name:"Example",inputs:{x:2},expected:{value:4},tolerance:1e-9}]});
}
function duplicateBuiltIn(toolId){
  const base=T.REGISTRY.get(toolId);if(!base)throw new CustomToolValidationError("Unknown built-in tool '"+toolId+"'");if(base.specialized||String(base.id).startsWith("custom."))throw new CustomToolValidationError("This tool cannot be duplicated in custom-tools v1");
  return normalizeManifest({id:makeId(),name:base.name+" copy",description:"Based on "+base.name,mode:"builtin-proxy",status:"draft",baseToolId:base.id,variables:base.inputs.map(i=>({name:i.id,label:i.label,type:i.type==="integer"?"integer":i.type==="percent"?"percent":"number",default:i.default===undefined?"":i.default,required:i.required!==false,min:i.min,max:i.max})),tests:[{name:"Built-in parity",inputs:Object.fromEntries(base.inputs.filter(i=>i.default!==undefined).map(i=>[i.id,i.default])),expected:{display:T.REGISTRY.execute(base.id,Object.fromEntries(base.inputs.filter(i=>i.default!==undefined).map(i=>[i.id,i.default])),{}).display}}]});
}
function installActive(manifest,registry){
  registry=registry||T.REGISTRY;manifest=normalizeManifest(manifest);const id="custom."+manifest.id;
  if(manifest.status!=="active"){if(registry.get(id))registry.unregister(id);return null;}
  const compiled=compile(manifest,{skipTests:true});return registry.replaceCustom(compiled.tool);
}
function uninstall(manifest,registry){registry=registry||T.REGISTRY;const id="custom."+normalizeManifest(manifest).id;if(registry.get(id))registry.unregister(id);}

function strictKeys(obj,allowed,path){
  for(const k of Object.keys(obj))if(!allowed.has(k))throw new CustomToolImportError("Unknown field '"+path+k+"'");
}
function exportManifest(raw){
  const m=normalizeManifest(raw),clean=clone(m);delete clean.history;clean.status="draft";
  return {schema:SCHEMA,exportedAt:new Date().toISOString(),tool:clean};
}
function importManifest(text){
  text=String(text||"");if(new TextEncoder().encode(text).length>MAX_JSON_BYTES)throw new CustomToolImportError("Custom tool file exceeds "+MAX_JSON_BYTES+" bytes");
  let doc;try{doc=JSON.parse(text);}catch(e){throw new CustomToolImportError("Invalid JSON: "+e.message);}
  if(!doc||typeof doc!=="object"||Array.isArray(doc))throw new CustomToolImportError("Import root must be an object");
  strictKeys(doc,new Set(["schema","exportedAt","tool"]),"");if(doc.schema!==SCHEMA)throw new CustomToolImportError("Unsupported custom-tool schema");
  if(!doc.tool||typeof doc.tool!=="object"||Array.isArray(doc.tool))throw new CustomToolImportError("Import needs a tool object");
  const raw=clone(doc.tool);raw.id=makeId();raw.status="draft";raw.revision=1;raw.history=[];raw.createdAt=now();raw.updatedAt=now();
  const m=normalizeManifest(raw),report=validationReport(m,{skipTests:true});
  if(!report.stages.find(s=>s.stage==="semantic"&&s.pass))throw new CustomToolImportError("Imported tool failed semantic validation",{report:report});
  return m;
}

class CustomToolLibrary{
  constructor(items){this.items=new Map();(items||[]).forEach(x=>this.items.set(normalizeManifest(x).id,normalizeManifest(x)));}
  list(status){return Array.from(this.items.values()).filter(x=>!status||x.status===status).sort((a,b)=>b.updatedAt-a.updatedAt);}
  get(id){return this.items.get(id)||null;}
  put(raw){const m=normalizeManifest(raw);this.items.set(m.id,m);return m;}
  remove(id){return this.items.delete(id);}
  installAll(registry){registry=registry||T.REGISTRY;for(const m of this.items.values())installActive(m,registry);}
}

global.CalcCustomTools={
  VERSION:"1.0.0-custom-tools",SCHEMA:SCHEMA,
  CustomToolError:CustomToolError,CustomToolSchemaError:CustomToolSchemaError,CustomToolValidationError:CustomToolValidationError,CustomToolTestError:CustomToolTestError,CustomToolImportError:CustomToolImportError,
  normalizeManifest:normalizeManifest,validationReport:validationReport,compile:compile,executeManifest:executeManifest,runTests:runTests,
  revise:revise,activate:activate,archive:archive,newFormulaDraft:newFormulaDraft,duplicateBuiltIn:duplicateBuiltIn,installActive:installActive,uninstall:uninstall,
  exportManifest:exportManifest,importManifest:importManifest,CustomToolLibrary:CustomToolLibrary
};
})(window);