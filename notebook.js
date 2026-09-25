(function(global){
"use strict";

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
if(!M||!A||!C||!CAS||!MV||!ODE||!U||!LA||!ALA||!OPT||!NUM||!DISC||!S||!G||!T)throw new Error("Calc notebook dependencies must load before CalcNotebook");

const SCHEMA="calc.notebook/v2";
const MAX_BLOCKS=500;
const MAX_VERSIONS=30;
const MAX_SOURCE=200000;
const MAX_IMPORT_BYTES=16*1024*1024;
const SAFE_BLOCK_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const BLOCK_TYPES=new Set(["math","text","tool","matrix","data","graph"]);
const REF_RE=/\{\{block:([A-Za-z0-9._:-]+)\}\}/g;

class NotebookError extends M.CalcError{
  constructor(code,message,details){super(code||"NOTEBOOK_ERROR",message,undefined,undefined,details);}
}
class NotebookSchemaError extends NotebookError{constructor(message,details){super("NOTEBOOK_SCHEMA_ERROR",message,details);}}
class NotebookReferenceError extends NotebookError{constructor(message,details){super("NOTEBOOK_REFERENCE_ERROR",message,details);}}
class NotebookBlockedError extends NotebookError{constructor(message,details){super("NOTEBOOK_BLOCKED",message,details);}}
class NotebookImportError extends NotebookError{constructor(message,details){super("NOTEBOOK_IMPORT_ERROR",message,details);}}

function makeId(prefix){
  if(global.crypto&&typeof global.crypto.randomUUID==="function")return (prefix||"id")+"-"+global.crypto.randomUUID();
  return (prefix||"id")+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
}
function clone(v){return JSON.parse(JSON.stringify(v));}
function now(){return Date.now();}
function boundedString(v,max){v=String(v===undefined||v===null?"":v);if(v.length>max)throw new NotebookSchemaError("Notebook text exceeds supported size");return v;}
function blankResult(){return {status:"idle",kind:"none",display:"",approx:"",error:null,value:null,serialized:null,metadata:{}};}

function normalizeBlock(raw,index){
  raw=raw||{};const type=String(raw.type||"math");if(!BLOCK_TYPES.has(type))throw new NotebookSchemaError("Unsupported block type '"+type+"'",{index:index});
  const id=String(raw.id||makeId("block"));if(!SAFE_BLOCK_ID.test(id))throw new NotebookSchemaError("Invalid block ID '"+id+"'",{index:index});
  return {
    id:id,type:type,title:boundedString(raw.title||"",200),
    source:boundedString(raw.source||"",MAX_SOURCE),
    config:raw.config&&typeof raw.config==="object"&&!Array.isArray(raw.config)?clone(raw.config):{},
    collapsed:!!raw.collapsed,
    status:["idle","dirty","stale","clean","error","blocked"].includes(raw.status)?raw.status:"dirty",
    dependencies:Array.isArray(raw.dependencies)?raw.dependencies.map(String):[],
    producedSymbols:Array.isArray(raw.producedSymbols)?raw.producedSymbols.map(String):[],
    result:raw.result&&typeof raw.result==="object"?Object.assign(blankResult(),clone(raw.result)):blankResult(),
    updatedAt:Number(raw.updatedAt)||now()
  };
}
function newBlock(type,seed){
  seed=seed||{};const base={id:makeId("block"),type:type||"math",title:"",source:"",config:{},status:"dirty",dependencies:[],producedSymbols:[],result:blankResult(),updatedAt:now()};
  if(type==="tool")base.config={toolId:seed.toolId||"percentage-of",inputs:seed.inputs||{}};
  else if(type==="matrix")base.config={rows:seed.rows||[["1","0"],["0","1"]],operation:seed.operation||"det"};
  else if(type==="data")base.config={operation:seed.operation||"summary",x:seed.x||"",y:seed.y||"",response:seed.response||"",predictors:seed.predictors||[]};
  else if(type==="graph")base.config={viewport:seed.viewport||{xMin:-10,xMax:10,yMin:-10,yMax:10}};
  return normalizeBlock(Object.assign(base,seed),0);
}
function migrateLegacy(raw){
  if(raw&&raw.schema===SCHEMA)return raw;
  const blocks=(raw&&Array.isArray(raw.blocks)?raw.blocks:[]).map(function(b){return {id:b.id||makeId("block"),type:b.type==="text"?"text":"math",source:b.source||"",title:"",config:{},status:"dirty",dependencies:[],producedSymbols:[],result:blankResult(),updatedAt:raw.updatedAt||now()};});
  return {schema:SCHEMA,id:raw&&raw.id||makeId("notebook"),title:raw&&raw.title||"Untitled notebook",createdAt:raw&&raw.createdAt||now(),updatedAt:raw&&raw.updatedAt||now(),revision:Math.max(1,raw&&raw.revision||1),blocks:blocks.length?blocks:[newBlock("math")],versions:[],settings:{autoRun:true},recovery:null};
}
function normalizeNotebook(raw){
  raw=migrateLegacy(raw||{});
  const blocks=(raw.blocks||[]).map(normalizeBlock);if(blocks.length>MAX_BLOCKS)throw new NotebookSchemaError("Notebook supports at most "+MAX_BLOCKS+" blocks");
  const ids=new Set();for(const b of blocks){if(ids.has(b.id))throw new NotebookSchemaError("Duplicate block ID '"+b.id+"'");ids.add(b.id);}
  return {schema:SCHEMA,id:String(raw.id||makeId("notebook")),title:boundedString(raw.title||"Untitled notebook",200),createdAt:Number(raw.createdAt)||now(),updatedAt:Number(raw.updatedAt)||now(),revision:Math.max(1,Number(raw.revision)||1),blocks:blocks,versions:Array.isArray(raw.versions)?raw.versions.slice(-MAX_VERSIONS):[],settings:Object.assign({autoRun:true},raw.settings||{}),recovery:raw.recovery||null};
}
function notebookSnapshot(doc){
  const d=normalizeNotebook(doc);return {revision:d.revision,title:d.title,updatedAt:d.updatedAt,blocks:d.blocks.map(function(b){const x=clone(b);x.result=blankResult();x.status="dirty";return x;}),settings:clone(d.settings)};
}
function commitRevision(doc,reason){
  doc=normalizeNotebook(doc);doc.versions=(doc.versions||[]).concat([{reason:reason||"edit",snapshot:notebookSnapshot(doc)}]).slice(-MAX_VERSIONS);doc.revision++;doc.updatedAt=now();return doc;
}
function restoreVersion(doc,index){
  doc=normalizeNotebook(doc);const entry=doc.versions[index];if(!entry||!entry.snapshot)throw new NotebookSchemaError("Unknown notebook version");
  const restored=normalizeNotebook(Object.assign({},entry.snapshot,{id:doc.id,createdAt:doc.createdAt,revision:doc.revision+1,updatedAt:now(),versions:(doc.versions||[]).concat([{reason:"before restore",snapshot:notebookSnapshot(doc)}]).slice(-MAX_VERSIONS)}));
  restored.blocks.forEach(b=>{b.status="dirty";b.result=blankResult();});return restored;
}

function explicitRefs(text){
  const out=[];String(text||"").replace(REF_RE,function(_,id){out.push(id);return _;});return Array.from(new Set(out));
}
function assignmentInfo(source){
  const s=String(source||"").trim();let m=s.match(/^([A-Za-z_]\w*)\s*=\s*(?!=)(.+)$/s);if(m)return {symbols:[m[1]],rhs:m[2],functionDefinition:false};
  m=s.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*=\s*(?!=)(.+)$/s);if(m)return {symbols:[m[1]],rhs:m[3],functionDefinition:true,parameters:m[2].split(",").map(x=>x.trim()).filter(Boolean)};
  return {symbols:[],rhs:s,functionDefinition:false};
}
function usedIdentifiers(source){
  const info=assignmentInfo(source),exclude=new Set((info.parameters||[]).concat(info.symbols)),out=[],tokens=String(info.rhs||"").match(/[A-Za-z_][A-Za-z0-9_]*/g)||[];
  for(const name of tokens){
    if(exclude.has(name))continue;
    if(["simplify","expand","collect","factor","solve","system","psystem","inequality","substitute","assume","assuming","cashelp","diff","partial","gradient","jacobian","hessian","integrate","integral","nintegral","limit","taylor","nderivative","root","gradat","jacobianat","hessianat","totaldiff","directional","implicitdiff","tangentplane","mtaylor","mlimit","critical","classify","lagrange","div","curl","potential","conservative","lineint","arclength","scalarline","doubleint","tripleint","surfacearea","flux","green","stokes","gauss","mvhelp","separable","linearode","exactode","bernoulli","ode2hom","seriesivp","laplace","invlaplace","convolution","ivp","ivp2","ivpsystem","rk4","trajectory","equilibria","linearize","stability","directionfield","phase2","matrixexp2","linearflow2","odehelp","convexity","goldenmin","goldenmax","optmin","optmax","boxmin","boxmax","kktcheck","lpmax","lpmin","quadprog","opthelp","jordanv2","jordanchains","schur","spectral","matrixfunc","gram","orthonormalize","projector","project","bilinear","sesquilinear","quadratic","inertia","congruence","lowrank","pinvdiag","lstsqv2","condreport","similarity","basischange","u5help","floatinfo","numerror","cancellation","scalarcond","richardson","convorder","fixedpoint","rootcompare","interp","newtoninterp","hermite","spline","fdiff","quad","jacobi","gaussseidel","cg","linsysdiag","poweriter","inverseiter","rayleighiter","optcompare","odefixed","odeorder","stability","absstability","stabinterval","numhelp","choose","permute","multinomial","catalan","stirling1","stirling2","bell","derange","partitioncount","starsbars","pigeonhole","cayley","fib","egcd","modinv","modpow","crt","lincong","linrec","recseq","recgf","setunion","setintersect","setdiff","setsymdiff","cartesian","powerset","truth","equiv","cnf","dnf","relation","relclosure","equivclasses","hasse","graphinfo","shortest","mst","toposort","eulertrail","chromatic","pruferdecode","discretehelp"].includes(name))continue;
    if(M.FUNCTION_REGISTRY&&Object.prototype.hasOwnProperty.call(M.FUNCTION_REGISTRY,name))continue;
    if(M.CONSTANT_REGISTRY&&Object.prototype.hasOwnProperty.call(M.CONSTANT_REGISTRY,name))continue;
    if(U.CONSTANT_REGISTRY&&Object.prototype.hasOwnProperty.call(U.CONSTANT_REGISTRY,name))continue;
    if(U.UNIT_REGISTRY&&U.UNIT_REGISTRY.get(name))continue;
    if(!out.includes(name))out.push(name);
  }
  return out;
}
function walkStrings(v,fn){
  if(typeof v==="string")fn(v);
  else if(Array.isArray(v))v.forEach(x=>walkStrings(x,fn));
  else if(v&&typeof v==="object")Object.keys(v).forEach(k=>walkStrings(v[k],fn));
}
function buildDependencies(doc){
  doc=doc&&doc.schema===SCHEMA?doc:normalizeNotebook(doc);const indexById=new Map(),producer=new Map(),dependents=new Map(),errors=[];
  doc.blocks.forEach((b,i)=>indexById.set(b.id,i));
  doc.blocks.forEach(function(block,index){
    const deps=new Set(),refs=explicitRefs(block.source);if(block.config)walkStrings(block.config,s=>explicitRefs(s).forEach(id=>refs.push(id)));
    for(const id of refs){
      if(!indexById.has(id)){errors.push({blockId:block.id,code:"MISSING_REFERENCE",message:"Unknown block reference '"+id+"'"});continue;}
      if(indexById.get(id)>=index){errors.push({blockId:block.id,code:"FORWARD_REFERENCE",message:"Block references must point to an earlier block: "+id});continue;}
      deps.add(id);
    }
    if(block.type==="math"){
      usedIdentifiers(block.source).forEach(name=>{if(producer.has(name))deps.add(producer.get(name));});
      const info=assignmentInfo(block.source);block.producedSymbols=info.symbols.slice();info.symbols.forEach(s=>producer.set(s,block.id));
    }else block.producedSymbols=[];
    block.dependencies=Array.from(deps);block.dependencies.forEach(function(id){if(!dependents.has(id))dependents.set(id,new Set());dependents.get(id).add(block.id);});
  });
  return {document:doc,indexById:indexById,dependents:dependents,errors:errors};
}
function markDirty(doc,blockId){
  doc=normalizeNotebook(doc);
  const oldDependents=new Map();doc.blocks.forEach(function(b){(b.dependencies||[]).forEach(function(id){if(!oldDependents.has(id))oldDependents.set(id,new Set());oldDependents.get(id).add(b.id);});});
  const graph=buildDependencies(doc),queue=[blockId],seen=new Set();
  while(queue.length){
    const id=queue.shift();if(seen.has(id))continue;seen.add(id);const b=doc.blocks.find(x=>x.id===id);if(b){b.status=id===blockId?"dirty":"stale";b.updatedAt=now();}
    const sets=[oldDependents.get(id),graph.dependents.get(id)];sets.forEach(function(ds){if(ds)ds.forEach(x=>queue.push(x));});
  }
  return doc;
}

function serializeValue(v){
  if(v===undefined)return {type:"undefined"};if(v===null||typeof v==="string"||typeof v==="number"||typeof v==="boolean")return {type:"primitive",value:v};
  if(typeof v==="bigint")return {type:"bigint",value:v.toString()};if(v instanceof M.Rational||v instanceof M.Complex)return {type:"math",value:M.serializeValue(v)};
  if(v instanceof U.Quantity)return {type:"quantity",value:U.serializeQuantity(v)};if(v instanceof LA.Matrix)return {type:"matrix",value:v.toJSON()};if(v instanceof LA.Vector)return {type:"vector",value:v.toJSON()};
  if(v instanceof S.Dataset)return {type:"dataset",value:v.toJSON()};if(v instanceof A.SymbolicExpression)return {type:"symbolic",value:v.toJSON()};if(v&&v.toolResult)return {type:"tool-result",value:T.serializeToolResult(v)};
  if(Array.isArray(v))return {type:"array",value:v.map(serializeValue)};if(v&&typeof v==="object"){try{return {type:"json",value:JSON.parse(JSON.stringify(v))};}catch(e){}}
  return {type:"display",value:String(v)};
}
function deserializeValue(s){
  if(!s)return null;if(s.type==="undefined")return undefined;if(s.type==="primitive")return s.value;if(s.type==="bigint")return BigInt(s.value);if(s.type==="math")return M.deserializeValue(s.value);
  if(s.type==="quantity")return U.deserializeQuantity(s.value);if(s.type==="matrix")return LA.Matrix.fromJSON(s.value);if(s.type==="vector")return LA.Vector.fromJSON(s.value);
  if(s.type==="dataset")return S.Dataset.fromJSON(s.value);if(s.type==="symbolic")return A.SymbolicExpression.fromJSON(s.value);if(s.type==="tool-result")return T.deserializeToolResult(s.value);if(s.type==="array")return s.value.map(deserializeValue);return s.value;
}
function referenceValue(block){if(!block||block.status!=="clean")throw new NotebookReferenceError("Referenced block is not clean",{blockId:block&&block.id,status:block&&block.status});return deserializeValue(block.result.serialized);}
function scalarRefValue(v){
  if(v instanceof M.Rational)return v;if(v instanceof M.Complex){if(!M.isZero(v.im))throw new NotebookReferenceError("Complex block reference cannot be inserted into a real expression");return v.re;}if(typeof v==="number")return M.Rational.fromDecimal(String(v));if(v instanceof U.Quantity)return v;
  throw new NotebookReferenceError("This block result cannot be embedded in a scalar expression");
}
function preprocessRefs(text,blockMap,env){
  let seq=0;return String(text||"").replace(REF_RE,function(_,id){const block=blockMap.get(id);if(!block)throw new NotebookReferenceError("Unknown block reference '"+id+"'");const v=scalarRefValue(referenceValue(block)),name="__block_ref_"+(seq++);env[name]=v;return name;});
}
function displayValue(v){
  if(v instanceof U.Quantity)return U.formatQuantity(v,12);if(v instanceof M.Rational||v instanceof M.Complex)return M.formatValue(v,12);if(v instanceof LA.Matrix||v instanceof LA.Vector)return v.toString(12);if(v&&v.toolResult)return v.display||"";return String(v);
}
function resolveConfigRefs(value,blockMap){
  if(typeof value==="string"){
    const full=value.match(/^\{\{block:([A-Za-z0-9._:-]+)\}\}$/);if(full){const v=referenceValue(blockMap.get(full[1]));if(v instanceof M.Rational)return v.toNumber();if(v instanceof M.Complex)return M.toNumber(v);if(typeof v==="number"||typeof v==="string"||typeof v==="boolean")return v;if(v instanceof U.Quantity)return M.toNumber(v.displayMagnitude());return v;}
    return value.replace(REF_RE,function(_,id){return displayValue(referenceValue(blockMap.get(id)));});
  }
  if(Array.isArray(value))return value.map(x=>resolveConfigRefs(x,blockMap));if(value&&typeof value==="object"){const out={};Object.keys(value).forEach(k=>out[k]=resolveConfigRefs(value[k],blockMap));return out;}return value;
}

function evaluateMath(raw,env,options){
  options=options||{};let discrete=DISC&&DISC.runCommand(raw,{angle:options.angle||"RAD",precision:options.precision||12,domain:"real"});if(discrete)return discrete;
  let numerical=NUM&&NUM.runCommand(raw,{angle:options.angle||"RAD",precision:options.precision||12,domain:"real"});if(numerical)return numerical;
  let advancedLinear=ALA&&ALA.runCommand(raw,{angle:options.angle||"RAD",precision:options.precision||12,domain:"real"});if(advancedLinear)return advancedLinear;
  let optimization=OPT&&OPT.runCommand(raw,{angle:options.angle||"RAD",precision:options.precision||12,domain:"real"});if(optimization)return optimization;
  let ode=ODE&&ODE.runCommand(raw,{angle:options.angle||"RAD",precision:options.precision||12,domain:"real"});if(ode)return ode;
  let multivariable=MV&&MV.runCommand(raw,{angle:options.angle||"RAD",precision:options.precision||12,domain:"real"});if(multivariable)return multivariable;
  let advanced=CAS&&CAS.runCommand(raw,{angle:options.angle||"RAD",precision:options.precision||12,domain:"real"});if(advanced)return advanced;
  let calculus=C.runCommand(raw,{angle:options.angle||"RAD",precision:options.precision||12,domain:"real"});if(calculus)return calculus;
  let symbolic=A.runCommand(raw,{angle:options.angle||"RAD",precision:options.precision||12,domain:"real"});if(symbolic)return symbolic;
  const assignment=String(raw).match(/^\s*([A-Za-z_]\w*)\s*=\s*(?!=)(.+)$/s);
  if(assignment){const quantity=U.tryEvaluate(assignment[2],env,{angle:options.angle||"RAD",precision:options.precision||12,commit:false});if(quantity&&quantity.quantity){env[assignment[1]]=quantity.value;return Object.assign({},quantity,{display:assignment[1]+" = "+quantity.display,assignment:assignment[1]});}}
  const quantity=U.tryEvaluate(raw,env,{angle:options.angle||"RAD",precision:options.precision||12,commit:true});if(quantity)return quantity;
  return M.evaluate(raw,env,{angle:options.angle||"RAD",precision:options.precision||12,complex:true,commit:true});
}
function matrixResultDisplay(r,precision){
  if(r.kind==="scalar")return M.formatValue(r.value,precision||12);if(r.kind==="matrix")return r.value.toString(precision||12);if(r.kind==="basis")return r.value.toString(precision||12);if(r.kind==="polynomial")return r.value.toString();
  if(r.kind==="eigen")return r.value.mode==="exact"?r.value.solutions.toString():"eigenvalues: ["+r.value.values.map(x=>M.formatNumber(x,precision||12)).join(", ")+"]";
  if(r.kind==="decomposition")return r.label+" · "+(r.value.method||"decomposition")+(r.value.residual!==undefined?" · residual "+M.formatNumber(r.value.residual,8):"");if(r.kind==="text")return r.display||r.label||"Matrix result";return r.label||"Matrix result";
}
function evaluateBlock(block,ctx){
  const blockMap=ctx.blockMap,options=ctx.options||{},env=ctx.env;if(block.type==="text")return {kind:"text",value:null,display:"",approx:"",metadata:{}};
  if(block.type==="math"){
    const refEnv=Object.create(env),source=preprocessRefs(block.source,blockMap,refEnv),res=evaluateMath(source,refEnv,options);
    Object.keys(refEnv).forEach(function(k){if(!k.startsWith("__block_ref_"))env[k]=refEnv[k];});
    const info=assignmentInfo(block.source);if(info.symbols.length&&res.value!==undefined&&!res.functionDefinition)env[info.symbols[0]]=res.value;
    return {kind:res.kind||res.metadata&&res.metadata.numericKind||"math",value:res.value,display:res.display+(res.approx?" "+res.approx:""),approx:res.approx||"",metadata:res.metadata||{}};
  }
  if(block.type==="tool"){
    const config=resolveConfigRefs(block.config,blockMap),toolId=config.toolId;if(!toolId)throw new NotebookSchemaError("Tool block needs toolId");
    const out=T.REGISTRY.execute(toolId,config.inputs||{},options);return {kind:"tool",value:out,display:out.display,approx:"",metadata:{toolId:toolId,toolVersion:out.toolVersion}};
  }
  if(block.type==="matrix"){
    const config=resolveConfigRefs(block.config,blockMap),rows=config.rows;if(!Array.isArray(rows)||!rows.length)throw new NotebookSchemaError("Matrix block needs rows");
    const matrix=LA.Matrix.fromStrings(rows,env,{angle:options.angle||"RAD",symbolic:true}),op=config.operation||"det",r=(ALA&&ALA.supportsOperation(op)?ALA.resultSummary(op,matrix,{relTol:1e-10,rankTol:1e-10,maxIterations:3000}):LA.resultSummary(op,matrix,{relTol:1e-10,rankTol:1e-10,maxIterations:300}));
    return {kind:"matrix-"+r.kind,value:r.value,display:matrixResultDisplay(r,options.precision),approx:"",metadata:{operation:config.operation||"det",summaryKind:r.kind}};
  }
  if(block.type==="data"){
    const config=resolveConfigRefs(block.config,blockMap),dataset=S.Dataset.fromDelimited(block.source),op=config.operation||"summary";
    if(op==="dataset")return {kind:"dataset",value:dataset,display:dataset.rowCount+" rows × "+dataset.columnCount+" columns",approx:"",metadata:{}};
    if(op==="summary"){const summaries={};dataset.columns.forEach(c=>{if(c.type==="numeric")summaries[c.name]=S.describe(c);});const lines=Object.keys(summaries).map(name=>name+": n="+summaries[name].count+", mean="+M.formatNumber(summaries[name].mean,8)+", sd="+M.formatNumber(summaries[name].sdSample,8));return {kind:"data-summary",value:{dataset:dataset,summaries:summaries},display:lines.join("\n")||"No numeric columns",approx:"",metadata:{rows:dataset.rowCount}};}
    if(op==="correlation"){const r=S.pearson(dataset,config.x,config.y);return {kind:"correlation",value:r.value,display:"Pearson r = "+M.formatNumber(r.value,10)+" · n="+r.n,approx:"",metadata:r};}
    if(op==="regression"){const response=config.response||config.y,predictors=config.predictors&&config.predictors.length?config.predictors:[config.x],model=S.fitRegression(dataset,response,predictors);return {kind:"regression",value:model,display:response+" ~ "+predictors.join(" + ")+" · R²="+M.formatNumber(model.r2,8)+" · n="+model.n,approx:"",metadata:{response:response,predictors:predictors}};}
    throw new NotebookSchemaError("Unsupported Data block operation '"+op+"'");
  }
  if(block.type==="graph"){
    const config=resolveConfigRefs(block.config,blockMap),vp=config.viewport||{xMin:-10,xMax:10,yMin:-10,yMax:10},parsed=G.parseGraphText(block.source,{env:env,viewport:new G.Viewport(vp.xMin,vp.xMax,vp.yMin,vp.yMax)});
    if(parsed.errors.length)throw new NotebookSchemaError("Graph block has "+parsed.errors.length+" invalid line(s)",{errors:parsed.errors.map(e=>e.error.message)});
    return {kind:"graph-session",value:parsed.session.serialize(),display:parsed.session.series.length+" graph series"+(parsed.session.sliders.size?" · "+parsed.session.sliders.size+" slider(s)":""),approx:"",metadata:{series:parsed.session.series.length}};
  }
  throw new NotebookSchemaError("Unsupported block type '"+block.type+"'");
}
function replayCachedBlock(block,env){
  if(block.type!=="math"||!block.producedSymbols||!block.producedSymbols.length||!block.result||!block.result.serialized)return false;
  const info=assignmentInfo(block.source);if(info.functionDefinition)return false;
  try{const value=deserializeValue(block.result.serialized);block.producedSymbols.forEach(function(name){env[name]=value;});return true;}catch(e){return false;}
}
function evaluateNotebook(raw,options){
  const doc=normalizeNotebook(raw),graph=buildDependencies(doc),blockMap=new Map(doc.blocks.map(b=>[b.id,b])),env={},evaluations=[],depErrors=new Map();graph.errors.forEach(e=>depErrors.set(e.blockId,e));
  for(let i=0;i<doc.blocks.length;i++){
    const block=doc.blocks[i],dependencyFailure=block.dependencies.find(id=>{const b=blockMap.get(id);return b&&["error","blocked"].includes(b.status);});
    if(depErrors.has(block.id)){const e=depErrors.get(block.id);block.status="error";block.result={status:"error",kind:"error",display:"",approx:"",error:e.message,value:null,serialized:null,metadata:{code:e.code}};evaluations.push({blockId:block.id,status:"error"});continue;}
    if(dependencyFailure){block.status="blocked";block.result={status:"blocked",kind:"blocked",display:"",approx:"",error:"Blocked by "+dependencyFailure,value:null,serialized:null,metadata:{dependency:dependencyFailure}};evaluations.push({blockId:block.id,status:"blocked"});continue;}
    if(block.type==="text"){block.status="clean";block.result={status:"clean",kind:"text",display:"",approx:"",error:null,value:null,serialized:null,metadata:{}};evaluations.push({blockId:block.id,status:"clean"});continue;}
    if(block.status==="clean"&&block.result&&block.result.serialized){
      const info=block.type==="math"?assignmentInfo(block.source):null;
      if(block.type!=="math"||!info.functionDefinition){
        if(block.type!=="math"||!block.producedSymbols.length||replayCachedBlock(block,env)){evaluations.push({blockId:block.id,status:"clean",kind:block.result.kind,cached:true});continue;}
      }
    }
    try{const out=evaluateBlock(block,{blockMap:blockMap,env:env,options:options||{}});block.status="clean";block.result={status:"clean",kind:out.kind,display:out.display,approx:out.approx||"",error:null,value:null,serialized:serializeValue(out.value),metadata:out.metadata||{}};evaluations.push({blockId:block.id,status:"clean",kind:out.kind});}
    catch(e){block.status="error";block.result={status:"error",kind:"error",display:"",approx:"",error:e.message,value:null,serialized:null,metadata:{code:e.code||"ERROR"}};evaluations.push({blockId:block.id,status:"error",code:e.code||"ERROR"});}
  }
  doc.updatedAt=now();return {document:doc,environment:env,evaluations:evaluations,dependencyGraph:graph};
}
function applyEdit(raw,blockId,patch){
  let doc=normalizeNotebook(raw),block=doc.blocks.find(b=>b.id===blockId);if(!block)throw new NotebookSchemaError("Unknown block '"+blockId+"'");
  doc.versions=(doc.versions||[]).concat([{reason:"edit "+blockId,snapshot:notebookSnapshot(doc)}]).slice(-MAX_VERSIONS);Object.assign(block,clone(patch||{}));block.updatedAt=now();doc.revision++;doc.updatedAt=now();return markDirty(doc,blockId);
}
function addBlock(raw,type,index,seed){
  const doc=normalizeNotebook(raw),b=newBlock(type,seed),at=index===undefined?doc.blocks.length:Math.max(0,Math.min(doc.blocks.length,index));doc.versions=(doc.versions||[]).concat([{reason:"add block",snapshot:notebookSnapshot(doc)}]).slice(-MAX_VERSIONS);doc.blocks.splice(at,0,b);for(let i=at+1;i<doc.blocks.length;i++)if(doc.blocks[i].type!=="text")doc.blocks[i].status="stale";doc.revision++;doc.updatedAt=now();return doc;
}
function removeBlock(raw,id){
  const doc=normalizeNotebook(raw),i=doc.blocks.findIndex(b=>b.id===id);if(i<0)return doc;doc.versions=(doc.versions||[]).concat([{reason:"remove block",snapshot:notebookSnapshot(doc)}]).slice(-MAX_VERSIONS);doc.blocks.splice(i,1);doc.blocks.forEach(function(b){if(b.type!=="text")b.status="stale";});doc.revision++;doc.updatedAt=now();return doc;
}
function moveBlock(raw,id,toIndex){
  const doc=normalizeNotebook(raw),i=doc.blocks.findIndex(b=>b.id===id);if(i<0)return doc;const [b]=doc.blocks.splice(i,1),at=Math.max(0,Math.min(doc.blocks.length,toIndex));doc.versions=(doc.versions||[]).concat([{reason:"move block",snapshot:notebookSnapshot(doc)}]).slice(-MAX_VERSIONS);doc.blocks.splice(at,0,b);doc.revision++;doc.updatedAt=now();doc.blocks.forEach(x=>x.status=x.type==="text"?"clean":"stale");return doc;
}
function duplicateBlock(raw,id){
  const doc=normalizeNotebook(raw),i=doc.blocks.findIndex(b=>b.id===id);if(i<0)throw new NotebookSchemaError("Unknown block");const copy=clone(doc.blocks[i]);copy.id=makeId("block");copy.title=copy.title?copy.title+" copy":"";copy.status="dirty";copy.dependencies=[];copy.result=blankResult();doc.blocks.splice(i+1,0,normalizeBlock(copy,i+1));for(let j=i+2;j<doc.blocks.length;j++)if(doc.blocks[j].type!=="text")doc.blocks[j].status="stale";doc.revision++;doc.updatedAt=now();return doc;
}

function exportNotebook(raw){
  const doc=normalizeNotebook(raw),out=clone(doc);out.versions=[];out.blocks.forEach(b=>{b.status="dirty";b.result=blankResult();});return {schema:SCHEMA,exportedAt:new Date().toISOString(),notebook:out};
}
function importNotebook(text){
  text=String(text||"");const bytes=typeof TextEncoder!=="undefined"?new TextEncoder().encode(text).length:text.length;if(bytes>MAX_IMPORT_BYTES)throw new NotebookImportError("Notebook file exceeds "+MAX_IMPORT_BYTES+" bytes");
  let root;try{root=JSON.parse(text);}catch(e){throw new NotebookImportError("Invalid notebook JSON: "+e.message);}
  if(!root||root.schema!==SCHEMA||!root.notebook)throw new NotebookImportError("Unsupported notebook file");
  const n=normalizeNotebook(root.notebook);n.id=makeId("notebook");n.title=n.title+" (imported)";n.createdAt=n.updatedAt=now();n.revision=1;n.versions=[];n.blocks.forEach(b=>{b.status="dirty";b.result=blankResult();});return n;
}
function markdownExport(raw){
  const doc=normalizeNotebook(raw),lines=["# "+doc.title,""];doc.blocks.forEach(function(b){if(b.type==="text"){lines.push(b.source,"");return;}lines.push("## "+(b.title||capitalize(b.type)),"");if(b.source){lines.push("    "+b.source.split("\n").join("\n    "),"");}if(b.result&&b.result.display){lines.push("**Result**","",b.result.display,"");}});return lines.join("\n");
}
function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function recoveryNormalize(raw){
  try{return {document:normalizeNotebook(raw),recovered:false,issues:[]};}
  catch(e){
    const issues=[e.message],base={schema:SCHEMA,id:raw&&raw.id||makeId("notebook"),title:raw&&raw.title||"Recovered notebook",createdAt:raw&&raw.createdAt||now(),updatedAt:now(),revision:1,blocks:[],versions:[],settings:{autoRun:false},recovery:{safeMode:true,issues:issues}};
    const candidates=raw&&Array.isArray(raw.blocks)?raw.blocks:[];candidates.forEach(function(b,i){try{base.blocks.push(normalizeBlock(b,i));}catch(err){issues.push("Block "+(i+1)+": "+err.message);base.blocks.push(newBlock("text",{source:"Recovered invalid block "+(i+1)+": "+err.message+"\n\nRaw:\n"+JSON.stringify(b,null,2),title:"Recovery"}));}});
    if(!base.blocks.length)base.blocks.push(newBlock("text",{source:"Notebook recovery mode: original document could not be normalized.",title:"Recovery"}));return {document:base,recovered:true,issues:issues};
  }
}

global.CalcNotebook={
  VERSION:"2.0.1-notebook",SCHEMA:SCHEMA,MAX_BLOCKS:MAX_BLOCKS,MAX_IMPORT_BYTES:MAX_IMPORT_BYTES,
  NotebookError:NotebookError,NotebookSchemaError:NotebookSchemaError,NotebookReferenceError:NotebookReferenceError,NotebookBlockedError:NotebookBlockedError,NotebookImportError:NotebookImportError,
  newBlock:newBlock,normalizeBlock:normalizeBlock,normalizeNotebook:normalizeNotebook,migrateLegacy:migrateLegacy,notebookSnapshot:notebookSnapshot,commitRevision:commitRevision,restoreVersion:restoreVersion,
  explicitRefs:explicitRefs,assignmentInfo:assignmentInfo,usedIdentifiers:usedIdentifiers,buildDependencies:buildDependencies,markDirty:markDirty,
  serializeValue:serializeValue,deserializeValue:deserializeValue,referenceValue:referenceValue,evaluateMath:evaluateMath,evaluateBlock:evaluateBlock,evaluateNotebook:evaluateNotebook,
  applyEdit:applyEdit,addBlock:addBlock,removeBlock:removeBlock,moveBlock:moveBlock,duplicateBlock:duplicateBlock,
  exportNotebook:exportNotebook,importNotebook:importNotebook,markdownExport:markdownExport,recoveryNormalize:recoveryNormalize
};
})(window);