(function(){
"use strict";
const M=window.CalcMath;
const A=window.CalcAlgebra;
const C=window.CalcCalculus;
const U=window.CalcUnits;
const LA=window.CalcLinearAlgebra;
const S=window.CalcStatistics;
const $=function(s,r){return (r||document).querySelector(s);};
const $$=function(s,r){return Array.from((r||document).querySelectorAll(s));};
const uid=function(){return crypto.randomUUID?crypto.randomUUID():"id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);};

const VIEW_META={
  calculate:["Calculate","Exact when possible. Approximate when necessary."],
  graph:["Graph","Interactive 2D plotting and analysis."],
  matrix:["Matrix","Exact matrix arithmetic and row reduction."],
  data:["Data","Datasets, distributions, inference, regression and statistical models."],
  tools:["Tools","Focused calculators built on the shared math core."],
  worksheet:["Worksheet","Persistent multi-step mathematical work."],
  history:["History","Your local calculation history."]
};

const state={
  view:"calculate",angle:localStorage.getItem("calc.angle")||"RAD",precision:12,
  env:{},lastResult:null,theme:localStorage.getItem("calc.theme")||"system",
  installPrompt:null,history:[],worksheets:[],activeWorksheet:null,
  graph:{xMin:-10,xMax:10,yMin:-10,yMax:10,asts:[],lines:[],drag:null,pointers:new Map()},
  selectedTool:"percent",dataset:null,statisticsWorker:null,dataRevision:0
};

function toast(msg){
  var el=$("#toast");el.textContent=msg;el.classList.add("show");
  clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove("show");},1800);
}
function errorMessage(e){return e&&e.message?e.message:String(e);}
function setTheme(theme){
  state.theme=theme;localStorage.setItem("calc.theme",theme);
  var root=document.documentElement;
  if(theme==="graphite"||theme==="oled")root.dataset.theme=theme;
  else if(theme==="light")root.removeAttribute("data-theme");
  else{
    var dark=matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme=dark?"graphite":"";
    if(!dark)root.removeAttribute("data-theme");
  }
  var meta=$('meta[name="theme-color"]');
  if(meta)meta.content=getComputedStyle(root).getPropertyValue("--bg").trim()||"#111317";
  if(state.view==="graph")requestAnimationFrame(drawGraph);
}
function cycleTheme(){
  var order=["system","light","graphite","oled"],i=order.indexOf(state.theme);
  setTheme(order[(i+1)%order.length]);toast("Theme: "+state.theme);
}
matchMedia("(prefers-color-scheme: dark)").addEventListener&&matchMedia("(prefers-color-scheme: dark)").addEventListener("change",function(){if(state.theme==="system")setTheme("system");});

let dbPromise=null;
function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise(function(resolve,reject){
    if(!("indexedDB" in window)){reject(new Error("Local database is unavailable"));return;}
    var req=indexedDB.open("calc-db",1);
    req.onupgradeneeded=function(){
      var db=req.result;
      if(!db.objectStoreNames.contains("history"))db.createObjectStore("history",{keyPath:"id"});
      if(!db.objectStoreNames.contains("worksheets"))db.createObjectStore("worksheets",{keyPath:"id"});
      if(!db.objectStoreNames.contains("settings"))db.createObjectStore("settings",{keyPath:"key"});
    };
    req.onsuccess=function(){resolve(req.result);};
    req.onerror=function(){reject(req.error||new Error("Could not open local database"));};
  });
  return dbPromise;
}
async function dbTx(store,mode,fn){
  var db=await openDb();
  return new Promise(function(resolve,reject){
    var tx=db.transaction(store,mode),os=tx.objectStore(store),result;
    try{result=fn(os);}catch(e){reject(e);return;}
    tx.oncomplete=function(){resolve(result&&result.result!==undefined?result.result:result);};
    tx.onerror=function(){reject(tx.error||new Error("Database transaction failed"));};
    tx.onabort=function(){reject(tx.error||new Error("Database transaction aborted"));};
  });
}
function dbPut(store,value){return dbTx(store,"readwrite",function(os){return os.put(value);});}
function dbDelete(store,key){return dbTx(store,"readwrite",function(os){return os.delete(key);});}
function dbClear(store){return dbTx(store,"readwrite",function(os){return os.clear();});}
async function dbAll(store){
  var db=await openDb();
  return new Promise(function(resolve,reject){
    var req=db.transaction(store,"readonly").objectStore(store).getAll();
    req.onsuccess=function(){resolve(req.result||[]);};req.onerror=function(){reject(req.error);};
  });
}

function switchView(view){
  if(!VIEW_META[view])return;
  state.view=view;
  if(location.hash!=="#"+view)history.replaceState(null,"","#"+view);
  $("[data-view-panel]").forEach(function(el){el.classList.toggle("active",el.dataset.viewPanel===view);});
  $$(".nav-item").forEach(function(el){el.classList.toggle("active",el.dataset.view===view);});
  $("#viewTitle").textContent=VIEW_META[view][0];$("#viewSubtitle").textContent=VIEW_META[view][1];
  closeMobileNav();
  if(view==="graph")setTimeout(function(){resizeGraph();drawGraph();},20);
  if(view==="history")renderHistory();
  if(view==="worksheet")renderWorksheetArea();
}
function closeMobileNav(){
  $("#sidebar").classList.remove("open");$("#mobileNavBackdrop").classList.add("hidden");
}
function openMobileNav(){
  $("#sidebar").classList.add("open");$("#mobileNavBackdrop").classList.remove("hidden");
}

function insertExpression(text){
  var input=$("#expressionInput"),start=input.selectionStart,end=input.selectionEnd;
  input.setRangeText(text,start,end,"end");input.focus();previewExpression();
}
function clearExpression(){$("#expressionInput").value="";$("#exactResult").textContent="0";$("#approxResult").textContent="";$("#calcStatus").textContent="";$("#expressionInput").focus();}
function backspaceExpression(){
  var input=$("#expressionInput"),s=input.selectionStart,e=input.selectionEnd;
  if(s!==e)input.setRangeText("",s,e,"end");
  else if(s>0)input.setRangeText("",s-1,s,"end");
  input.focus();previewExpression();
}
function calcOptions(commit){return {angle:state.angle,precision:state.precision,complex:true,commit:commit};}
function evaluateInput(raw,env,commit){
  var calculus=C&&C.runCommand(raw,{angle:state.angle,precision:state.precision,domain:"real"});
  if(calculus)return calculus;
  var symbolic=A&&A.runCommand(raw,{angle:state.angle,precision:state.precision,domain:"real"});
  if(symbolic)return symbolic;
  if(U){
    var assignment=String(raw).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?!=)(.+)$/s);
    if(assignment){
      var quantityAssigned=U.tryEvaluate(assignment[2],env,{angle:state.angle,precision:state.precision,commit:false});
      if(quantityAssigned&&quantityAssigned.quantity){
        if(commit)env[assignment[1]]=quantityAssigned.value;
        return Object.assign({},quantityAssigned,{display:assignment[1]+" = "+quantityAssigned.display,assignment:assignment[1],metadata:Object.assign({},quantityAssigned.metadata,{assignment:assignment[1]})});
      }
    }
    var quantity=U.tryEvaluate(raw,env,{angle:state.angle,precision:state.precision,commit:commit});
    if(quantity)return quantity;
  }
  return M.evaluate(raw,env,calcOptions(commit));
}
function setCalcResult(res,preview){
  $("#exactResult").textContent=res.display;
  $("#approxResult").textContent=res.approx||"";
  $("#calcStatus").textContent=preview?"Preview":(res.symbolic?"Symbolic":(res.quantity?"Quantity":(res.exact?"Exact":"Approximate")));
  var graphAction=$('[data-result-action="graph"]'),saveAction=$('[data-result-action="save"]'),op=res.metadata&&res.metadata.operation;
  var graphBlocked=!!res.symbolic||!!res.quantity||["integral","nintegral","nderivative","root","limit"].indexOf(op)>=0;
  if(graphAction)graphAction.disabled=graphBlocked;
  if(saveAction)saveAction.disabled=!!res.symbolic;
}
let previewTimer=null;
function previewExpression(){
  clearTimeout(previewTimer);
  previewTimer=setTimeout(function(){
    var raw=$("#expressionInput").value.trim();
    if(!raw){$("#calcStatus").textContent="";return;}
    try{var res=evaluateInput(raw,Object.create(state.env),false);setCalcResult(res,true);}
    catch(e){$("#calcStatus").textContent="";$("#approxResult").textContent="";}
  },90);
}
async function evaluateCurrent(){
  var input=$("#expressionInput"),raw=input.value.trim();if(!raw)return;
  try{
    var res=evaluateInput(raw,state.env,true);
    if(!res.functionDefinition&&!res.symbolic){state.env.ans=res.value;state.lastResult=res;}
    else if(res.symbolic)state.lastResult=null;
    setCalcResult(res,false);
    if(!res.functionDefinition)await addHistory(raw,res);
  }catch(e){
    $("#calcStatus").textContent="Error";$("#exactResult").textContent=errorMessage(e);$("#approxResult").textContent="";
  }
}
async function addHistory(expression,res,source){
  var item={id:uid(),time:Date.now(),expression:expression,result:res.display,approx:res.approx||"",source:source||"calculate"};
  state.history.unshift(item);if(state.history.length>500)state.history.length=500;
  try{await dbPut("history",item);}catch(e){}
}
function copyText(text){
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(function(){toast("Copied");}).catch(function(){fallbackCopy(text);});
  else fallbackCopy(text);
}
function fallbackCopy(text){
  var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();
  try{document.execCommand("copy");toast("Copied");}finally{ta.remove();}
}
function graphCurrent(){
  var raw=$("#expressionInput").value.trim();if(!raw||/=/.test(raw)&&/^[A-Za-z_]\w*\s*=/.test(raw))return;
  $("#graphExpressions").value=raw;switchView("graph");plotGraph();
}

const graphCanvas=$("#graphCanvas"),gctx=graphCanvas.getContext("2d");
function resizeGraph(){
  var rect=graphCanvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,3);
  var w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(graphCanvas.width!==w||graphCanvas.height!==h){graphCanvas.width=w;graphCanvas.height=h;}
  gctx.setTransform(dpr,0,0,dpr,0,0);
}
function graphSize(){var r=graphCanvas.getBoundingClientRect();return {w:r.width,h:r.height};}
function worldToScreen(x,y){
  var s=graphSize(),g=state.graph;
  return [(x-g.xMin)/(g.xMax-g.xMin)*s.w,s.h-(y-g.yMin)/(g.yMax-g.yMin)*s.h];
}
function screenToWorld(px,py){
  var s=graphSize(),g=state.graph;
  return [g.xMin+px/s.w*(g.xMax-g.xMin),g.yMax-py/s.h*(g.yMax-g.yMin)];
}
function niceStep(span,target){
  var raw=span/target,p=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/p;
  return (n<1.5?1:n<3?2:n<7?5:10)*p;
}
function css(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}
function drawGraph(){
  resizeGraph();var s=graphSize(),g=state.graph,ctx=gctx;
  ctx.clearRect(0,0,s.w,s.h);ctx.fillStyle=css("--surface");ctx.fillRect(0,0,s.w,s.h);
  var xStep=niceStep(g.xMax-g.xMin,10),yStep=niceStep(g.yMax-g.yMin,8);
  ctx.lineWidth=1;ctx.strokeStyle=css("--line");ctx.fillStyle=css("--muted");ctx.font="11px "+getComputedStyle(document.body).fontFamily;
  ctx.beginPath();
  for(var x=Math.ceil(g.xMin/xStep)*xStep;x<=g.xMax;x+=xStep){var sx=worldToScreen(x,0)[0];ctx.moveTo(sx,0);ctx.lineTo(sx,s.h);}
  for(var y=Math.ceil(g.yMin/yStep)*yStep;y<=g.yMax;y+=yStep){var sy=worldToScreen(0,y)[1];ctx.moveTo(0,sy);ctx.lineTo(s.w,sy);}
  ctx.stroke();
  ctx.strokeStyle=css("--line-strong");ctx.lineWidth=1.2;ctx.beginPath();
  if(g.xMin<=0&&g.xMax>=0){var ax=worldToScreen(0,0)[0];ctx.moveTo(ax,0);ctx.lineTo(ax,s.h);}
  if(g.yMin<=0&&g.yMax>=0){var ay=worldToScreen(0,0)[1];ctx.moveTo(0,ay);ctx.lineTo(s.w,ay);}
  ctx.stroke();

  var palette=[css("--accent"),"#e45649","#2f9e67","#a264d8","#dc8b21","#17a2b8"];
  g.asts.forEach(function(ast,index){
    ctx.strokeStyle=palette[index%palette.length];ctx.lineWidth=2;ctx.beginPath();
    var started=false,prevY=null,samples=Math.max(320,Math.floor(s.w*1.2));
    for(var i=0;i<=samples;i++){
      var px=i/samples*s.w,wx=screenToWorld(px,0)[0],wy;
      try{wy=M.toNumber(M.evaluateAst(ast,Object.assign(Object.create(state.env),{x:new M.Rational(BigInt(Math.round(wx*1e9)),1000000000n)}),calcOptions(false),0));}
      catch(e){wy=NaN;}
      if(!Number.isFinite(wy)){started=false;prevY=null;continue;}
      var py=worldToScreen(wx,wy)[1];
      var jump=prevY!==null&&Math.abs(py-prevY)>s.h*1.5;
      if(!started||jump){ctx.moveTo(px,py);started=true;}else ctx.lineTo(px,py);
      prevY=py;
    }
    ctx.stroke();
  });
}
function plotGraph(){
  var lines=$("#graphExpressions").value.split(/\n/).map(function(x){return x.trim();}).filter(Boolean),asts=[],valid=[];
  lines.forEach(function(line){try{asts.push(M.parseExpression(line.replace(/^\s*[A-Za-z_]\w*\s*\(x\)\s*=\s*/,"")));valid.push(line);}catch(e){toast("Graph: "+errorMessage(e));}});
  state.graph.asts=asts;state.graph.lines=valid;renderGraphLegend();drawGraph();
}
function renderGraphLegend(){
  var box=$("#graphLegend");box.innerHTML="";
  state.graph.lines.forEach(function(line){var d=document.createElement("div");d.className="legend-item";var sw=document.createElement("span");sw.className="legend-swatch";var t=document.createElement("span");t.textContent=line;d.append(sw,t);box.appendChild(d);});
}
function resetGraph(){Object.assign(state.graph,{xMin:-10,xMax:10,yMin:-10,yMax:10});drawGraph();}

function matrixValues(){
  var rows=parseInt($("#matrixRows").value,10),cols=parseInt($("#matrixCols").value,10),grid=[];
  for(var r=0;r<rows;r++){var row=[];for(var cc=0;cc<cols;cc++){var el=$('[data-mcell="'+r+'-'+cc+'"]');row.push(el?el.value||"0":"0");}grid.push(row);}
  return LA.Matrix.fromStrings(grid,state.env,{angle:state.angle,symbolic:true});
}
function renderMatrixGrid(preserve){
  var rows=Math.max(1,Math.min(10,parseInt($("#matrixRows").value,10)||1)),cols=Math.max(1,Math.min(10,parseInt($("#matrixCols").value,10)||1));
  $("#matrixRows").value=rows;$("#matrixCols").value=cols;
  var old={};if(preserve)$$("[data-mcell]").forEach(function(el){old[el.dataset.mcell]=el.value;});
  var grid=$("#matrixGrid");grid.innerHTML="";
  for(var r=0;r<rows;r++){
    var row=document.createElement("div");row.className="matrix-row";row.style.gridTemplateColumns="repeat("+cols+", 92px)";
    for(var cc=0;cc<cols;cc++){
      var input=document.createElement("input");input.className="matrix-cell";input.dataset.mcell=r+"-"+cc;input.dataset.row=r;input.dataset.col=cc;input.setAttribute("aria-label","Row "+(r+1)+", column "+(cc+1));
      input.value=old[r+"-"+cc]!==undefined?old[r+"-"+cc]:(r===cc?"1":"0");row.appendChild(input);
    }
    grid.appendChild(row);
  }
  bindMatrixCellInteractions();
}
function focusMatrixCell(r,c){
  var rows=parseInt($("#matrixRows").value,10),cols=parseInt($("#matrixCols").value,10);
  r=Math.max(0,Math.min(rows-1,r));c=Math.max(0,Math.min(cols-1,c));
  var el=$('[data-mcell="'+r+'-'+c+'"]');if(el){el.focus();el.select();}
}
function bindMatrixCellInteractions(){
  $$("[data-mcell]").forEach(function(input){
    input.addEventListener("keydown",function(e){
      var r=Number(input.dataset.row),c=Number(input.dataset.col);
      if(e.key==="ArrowUp"){e.preventDefault();focusMatrixCell(r-1,c);}
      else if(e.key==="ArrowDown"||e.key==="Enter"){e.preventDefault();focusMatrixCell(r+1,c);}
      else if(e.key==="ArrowLeft"&&input.selectionStart===0&&input.selectionEnd===0){e.preventDefault();focusMatrixCell(r,c-1);}
      else if(e.key==="ArrowRight"&&input.selectionStart===input.value.length&&input.selectionEnd===input.value.length){e.preventDefault();focusMatrixCell(r,c+1);}
    });
    input.addEventListener("paste",function(e){
      var text=e.clipboardData&&e.clipboardData.getData("text/plain");if(!text||(!/[\t\n,]/.test(text)))return;
      var raw=text.replace(/\r\n?/g,"\n").trim();if(!raw)return;
      var lines=raw.split("\n"),parsed=lines.map(function(line){return line.indexOf("\t")>=0?line.split("\t"):line.split(",");});
      if(parsed.length===1&&parsed[0].length===1)return;
      e.preventDefault();
      var sr=Number(input.dataset.row),sc=Number(input.dataset.col),needRows=Math.min(10,Math.max(parseInt($("#matrixRows").value,10),sr+parsed.length)),needCols=Math.min(10,Math.max(parseInt($("#matrixCols").value,10),sc+Math.max.apply(null,parsed.map(function(r){return r.length;}))));
      var snapshot={};$$("[data-mcell]").forEach(function(el){snapshot[el.dataset.mcell]=el.value;});
      $("#matrixRows").value=needRows;$("#matrixCols").value=needCols;renderMatrixGrid(false);
      Object.keys(snapshot).forEach(function(k){var el=$('[data-mcell="'+k+'"]');if(el)el.value=snapshot[k];});
      parsed.forEach(function(row,ri){row.forEach(function(value,ci){var rr=sr+ri,cc=sc+ci;if(rr<needRows&&cc<needCols){var el=$('[data-mcell="'+rr+'-'+cc+'"]');if(el)el.value=value.trim();}});});
      focusMatrixCell(sr,sc);
    });
  });
}
function matrixHtml(A){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);
  var rows=LA.formatMatrix(A,state.precision),wrap=document.createElement("div");wrap.className="matrix-render";
  rows.forEach(function(vals){var r=document.createElement("div");r.className="matrix-render-row";vals.forEach(function(v){var s=document.createElement("span");s.textContent=v;r.appendChild(s);});wrap.appendChild(r);});
  return wrap;
}
function matrixResultSection(box,title,content){
  var section=document.createElement("div");section.style.marginBottom="18px";
  var h=document.createElement("div");h.style.fontWeight="700";h.style.fontSize="12px";h.style.marginBottom="8px";h.textContent=title;section.appendChild(h);
  if(content instanceof LA.Matrix)section.appendChild(matrixHtml(content));
  else if(content instanceof LA.Vector){var pre=document.createElement("div");pre.textContent=content.toString(state.precision);pre.style.fontFamily="monospace";section.appendChild(pre);}
  else{var pre2=document.createElement("div");pre2.textContent=String(content);pre2.style.whiteSpace="pre-wrap";pre2.style.fontFamily="monospace";section.appendChild(pre2);}
  box.appendChild(section);
}
function renderDecomposition(box,d){
  ["P","L","U","Q","R","S","V","D","J"].forEach(function(k){if(d[k] instanceof LA.Matrix)matrixResultSection(box,k,d[k]);});
  if(d.singularValues)matrixResultSection(box,"Singular values","["+d.singularValues.map(function(x){return M.formatNumber(x,state.precision);}).join(", ")+"]");
  var meta=[];["rank","residual","residual1","residual2","orthogonalityResidual","threshold","method"].forEach(function(k){if(d[k]!==undefined)meta.push(k+": "+(typeof d[k]==="number"?M.formatNumber(d[k],state.precision):d[k]));});
  if(meta.length)matrixResultSection(box,"Diagnostics",meta.join("\n"));
}
function renderEigenResult(box,e){
  if(e.mode==="numeric-symmetric"){
    matrixResultSection(box,"Eigenvalues","["+e.values.map(function(x){return M.formatNumber(x,state.precision);}).join(", ")+"]");
    matrixResultSection(box,"Eigenvectors",e.eigenvectors);
    matrixResultSection(box,"Diagnostics","method: "+e.method+"\nresidual: "+M.formatNumber(e.residual,state.precision));
    return;
  }
  matrixResultSection(box,"Characteristic polynomial",e.characteristicPolynomial.toString());
  matrixResultSection(box,"Eigenvalues",e.solutions.toString());
  matrixResultSection(box,"Diagonalizable",e.diagonalizable?"Yes":"No");
  e.eigenspaces.forEach(function(item){
    var label="λ = "+item.value.toString()+" · algebraic "+item.algebraicMultiplicity+" · geometric "+item.geometricMultiplicity;
    matrixResultSection(box,label,item.space.toString(state.precision));
  });
}
function runMatrix(op){
  var box=$("#matrixResult");try{
    var matrix=matrixValues(),result=LA.resultSummary(op,matrix,{relTol:1e-10,rankTol:1e-10,maxIterations:300});
    box.innerHTML="";box.classList.remove("muted","ws-error");
    if(result.kind==="scalar")matrixResultSection(box,result.label,M.formatValue(result.value,state.precision));
    else if(result.kind==="matrix")matrixResultSection(box,result.label,result.value);
    else if(result.kind==="basis"){
      matrixResultSection(box,result.label,result.value.toString(state.precision));
      matrixResultSection(box,"Dimension",String(result.value.dimension()));
      if(result.value.sourceColumns)matrixResultSection(box,"Original pivot columns",result.value.sourceColumns.map(function(x){return x+1;}).join(", "));
    }else if(result.kind==="polynomial")matrixResultSection(box,result.label,result.value.toString());
    else if(result.kind==="eigen")renderEigenResult(box,result.value);
    else if(result.kind==="decomposition")renderDecomposition(box,result.value);
    if(result.metadata){
      var meta=[];if(result.metadata.pivots)meta.push("pivot columns: "+result.metadata.pivots.map(function(x){return x+1;}).join(", "));
      if(result.metadata.operations)meta.push("row operations: "+result.metadata.operations.length);
      ["residual1","residual2","rank","method"].forEach(function(k){if(result.metadata[k]!==undefined)meta.push(k+": "+result.metadata[k]);});
      if(meta.length)matrixResultSection(box,"Metadata",meta.join("\n"));
    }
  }catch(e){
    box.innerHTML="";box.textContent=errorMessage(e);box.classList.add("ws-error");
  }
}

function dataNumber(x){
  return Number.isFinite(Number(x))?M.formatNumber(Number(x),state.precision):"—";
}
function formatProbabilityValue(p){
  p=p instanceof S.Probability?p.value:Number(p);
  if(!Number.isFinite(p))return "—";
  if(p!==0&&p<1e-4)return p.toExponential(4);
  return M.formatNumber(p,8);
}
function statisticsWorker(){
  if(!state.statisticsWorker&&S&&typeof Worker!=="undefined")state.statisticsWorker=new S.StatisticsWorkerClient("./statistics-worker.js");
  return state.statisticsWorker;
}
function currentNumericColumns(){
  return state.dataset?state.dataset.columns.filter(function(c){return c.type==="numeric";}):[];
}
function fillDataSelect(select,names,preferred){
  if(!select)return;var old=preferred||select.value;select.innerHTML="";
  names.forEach(function(name){var o=document.createElement("option");o.value=name;o.textContent=name;if(name===old)o.selected=true;select.appendChild(o);});
}
function populateDataControls(){
  var names=currentNumericColumns().map(function(c){return c.name;});
  fillDataSelect($("#dataXSelect"),names,names[0]);
  fillDataSelect($("#dataYSelect"),names,names[Math.min(1,names.length-1)]);
  fillDataSelect($("#testColumnSelect"),names,names[0]);
  ["#pearsonBtn","#spearmanBtn","#regressionBtn","#histogramBtn","#boxplotBtn","#meanCiBtn","#oneSampleTBtn"].forEach(function(sel){var b=$(sel);if(b)b.disabled=!names.length;});
}
function renderDataSummary(dataset,summaries){
  var box=$("#dataSummary");box.innerHTML="";box.classList.remove("muted","ws-error");
  var numeric=dataset.columns.filter(function(c){return c.type==="numeric";});
  if(numeric.length){
    var table=document.createElement("table");table.className="summary-table";
    table.innerHTML="<thead><tr><th>Column</th><th>n</th><th>Missing</th><th>Mean</th><th>Median</th><th>SD</th><th>Q1</th><th>Q3</th><th>Min</th><th>Max</th></tr></thead>";
    var tb=document.createElement("tbody");
    numeric.forEach(function(col){
      var st=summaries[col.name],tr=document.createElement("tr");
      [col.name,st.count,st.missing,dataNumber(st.mean),dataNumber(st.median),dataNumber(st.sdSample),dataNumber(st.q1),dataNumber(st.q3),dataNumber(st.min),dataNumber(st.max)].forEach(function(v){var td=document.createElement("td");td.textContent=v;tr.appendChild(td);});
      tb.appendChild(tr);
    });
    table.appendChild(tb);box.appendChild(table);
  }else{
    var none=document.createElement("div");none.className="muted";none.textContent="No numeric columns detected.";box.appendChild(none);
  }
  var badges=document.createElement("div");badges.className="data-badge-row";
  [
    dataset.rowCount+" rows",
    dataset.columnCount+" columns",
    numeric.length+" numeric",
    dataset.columns.reduce(function(n,c){return n+c.missingCount();},0)+" missing",
    "quantiles: R7"
  ].forEach(function(t){var b=document.createElement("span");b.className="data-badge";b.textContent=t;badges.appendChild(b);});
  box.appendChild(badges);
}
async function analyzeData(){
  var box=$("#dataSummary"),revision=++state.dataRevision;
  try{
    var dataset=S.Dataset.fromDelimited($("#dataInput").value);
    if(!dataset.rowCount)throw new S.DatasetError("No data rows found");
    state.dataset=dataset;populateDataControls();
    box.classList.remove("ws-error");box.classList.add("muted");box.textContent=dataset.rowCount>5000?"Analyzing large dataset…":"Analyzing…";
    var summaries={};
    if(dataset.rowCount>5000&&typeof Worker!=="undefined"){
      try{summaries=await statisticsWorker().run("describeDataset",{dataset:dataset.toJSON()});}
      catch(e){dataset.columns.forEach(function(col){if(col.type==="numeric")summaries[col.name]=S.describe(col);});}
    }else dataset.columns.forEach(function(col){if(col.type==="numeric")summaries[col.name]=S.describe(col);});
    if(revision!==state.dataRevision)return;
    renderDataSummary(dataset,summaries);
    $("#dataAnalysisResult").textContent="Choose columns and an analysis.";
    $("#dataAnalysisResult").className="data-analysis-result muted";
    $("#inferenceResult").textContent="Choose a numeric column.";
    $("#inferenceResult").className="data-analysis-result muted";
  }catch(e){
    state.dataset=null;populateDataControls();box.textContent=errorMessage(e);box.classList.add("ws-error");box.classList.remove("muted");
  }
}
function requireDataset(){if(!state.dataset)throw new S.DatasetError("Analyze a dataset first");return state.dataset;}
function selectedDataColumns(){
  var x=$("#dataXSelect").value,y=$("#dataYSelect").value;if(!x||!y)throw new S.DatasetError("Choose numeric columns");return {x:x,y:y};
}
function setAnalysisText(lines){
  var box=$("#dataAnalysisResult");box.innerHTML="";box.classList.remove("muted","ws-error");
  var pre=document.createElement("pre");pre.textContent=Array.isArray(lines)?lines.join("\n"):String(lines);box.appendChild(pre);
}
function dataCorrelation(method){
  try{
    var ds=requireDataset(),cols=selectedDataColumns(),r=method==="spearman"?S.spearman(ds,cols.x,cols.y):S.pearson(ds,cols.x,cols.y);
    setAnalysisText([(method==="spearman"?"Spearman ρ":"Pearson r")+" = "+dataNumber(r.value),"paired n = "+r.n,"excluded rows = "+r.excluded]);
  }catch(e){var box=$("#dataAnalysisResult");box.textContent=errorMessage(e);box.classList.add("ws-error");}
}
async function dataRegression(){
  var box=$("#dataAnalysisResult"),revision=state.dataRevision;
  try{
    var ds=requireDataset(),cols=selectedDataColumns();if(cols.x===cols.y)throw new S.RegressionError("X and response must be different columns");
    box.classList.remove("ws-error");box.classList.add("muted");box.textContent=ds.rowCount>5000?"Fitting regression in worker…":"Fitting regression…";
    var model;
    if(ds.rowCount>5000&&typeof Worker!=="undefined"){
      try{model=await statisticsWorker().run("regression",{dataset:ds.toJSON(),response:cols.y,predictors:[cols.x],options:{}});}
      catch(e){model=S.fitRegression(ds,cols.y,[cols.x]);}
    }else model=S.fitRegression(ds,cols.y,[cols.x]);
    if(revision!==state.dataRevision)return;
    var intercept=model.coefficients[0],slope=model.coefficients[1],lines=[
      cols.y+" = "+dataNumber(intercept)+" + "+dataNumber(slope)+" · "+cols.x,
      "R² = "+dataNumber(model.r2)+"   adjusted R² = "+dataNumber(model.adjustedR2),
      "n = "+model.n+"   excluded = "+model.excluded+"   rank = "+model.rank,
      "residual SE = "+dataNumber(model.residualStandardError),
      "condition number = "+(model.conditionNumber===Infinity?"∞":dataNumber(model.conditionNumber)),
      "method = "+model.method
    ];
    if(model.standardErrors&&model.standardErrors.length>1)lines.push("slope SE = "+dataNumber(model.standardErrors[1])+"   p = "+formatProbabilityValue(model.pValues[1]));
    if(model.warnings&&model.warnings.length)lines.push("warning: "+model.warnings.join(" "));
    setAnalysisText(lines);
  }catch(e){box.textContent=errorMessage(e);box.classList.add("ws-error");box.classList.remove("muted");}
}
function dataHistogram(){
  var box=$("#dataAnalysisResult");
  try{
    var ds=requireDataset(),name=$("#dataXSelect").value,col=ds.column(name),model=S.histogramModel(col.values),max=Math.max.apply(null,model.bins.map(function(b){return b.count;}));
    box.innerHTML="";box.classList.remove("muted","ws-error");
    var title=document.createElement("div");title.innerHTML="<strong>Histogram · "+name+"</strong> · n="+model.n+" · "+model.bins.length+" bins";box.appendChild(title);
    var list=document.createElement("div");list.className="histogram-list";
    model.bins.forEach(function(bin){
      var row=document.createElement("div");row.className="histogram-row";
      var label=document.createElement("span");label.className="histogram-label";label.textContent=dataNumber(bin.lo)+"–"+dataNumber(bin.hi);
      var track=document.createElement("div");track.className="histogram-track";var bar=document.createElement("div");bar.className="histogram-bar";bar.style.width=(max?bin.count/max*100:0)+"%";track.appendChild(bar);
      var count=document.createElement("span");count.className="histogram-count";count.textContent=bin.count;row.append(label,track,count);list.appendChild(row);
    });box.appendChild(list);
  }catch(e){box.textContent=errorMessage(e);box.classList.add("ws-error");}
}
function dataBoxplot(){
  try{
    var ds=requireDataset(),name=$("#dataXSelect").value,m=S.boxPlotModel(ds.column(name).values);
    setAnalysisText(["Box plot · "+name,"min = "+dataNumber(m.min),"Q1 = "+dataNumber(m.q1),"median = "+dataNumber(m.median),"Q3 = "+dataNumber(m.q3),"max = "+dataNumber(m.max),"IQR = "+dataNumber(m.q3-m.q1),"outliers = "+(m.outliers.length?m.outliers.map(dataNumber).join(", "):"none"),"quantiles = "+m.quantileMethod]);
  }catch(e){var box=$("#dataAnalysisResult");box.textContent=errorMessage(e);box.classList.add("ws-error");}
}
function inferenceValues(){
  var ds=requireDataset(),name=$("#testColumnSelect").value,col=ds.column(name);if(!col)throw new S.DatasetError("Choose a numeric column");return {name:name,values:col.values};
}
function renderInference(kind){
  var box=$("#inferenceResult");
  try{
    var d=inferenceValues();
    if(kind==="ci"){
      var confidence=Number($("#testConfidence").value),ci=S.meanCI(d.values,confidence);
      box.innerHTML="";box.classList.remove("muted","ws-error");
      var pre=document.createElement("pre");pre.textContent=d.name+" mean = "+dataNumber(ci.estimate)+"\n"+M.formatNumber(ci.confidence*100,6)+"% CI = "+ci.toString()+"\ndf = "+ci.df+"   SE = "+dataNumber(ci.se)+"\nmethod = "+ci.method;box.appendChild(pre);
    }else{
      var mu0=Number($("#testMu0").value),test=S.oneSampleT(d.values,mu0);
      box.innerHTML="";box.classList.remove("muted","ws-error");
      var pre2=document.createElement("pre");pre2.textContent="H₀: "+test.null+"\nt = "+dataNumber(test.statistic)+"   df = "+dataNumber(test.df)+"\np = "+formatProbabilityValue(test.pValue)+"\nestimate = "+dataNumber(test.estimate)+"   n = "+test.n+"\nmethod = "+test.method;box.appendChild(pre2);
    }
  }catch(e){box.textContent=errorMessage(e);box.classList.add("ws-error");box.classList.remove("muted");}
}
const DISTRIBUTION_FIELDS={
  normal:[["μ","distA",0],["σ","distB",1]],
  binomial:[["n","distA",10],["p","distB",0.5]],
  poisson:[["λ","distA",3]],
  t:[["df","distA",10]],
  chisq:[["df","distA",5]],
  gamma:[["shape","distA",2],["scale","distB",1]],
  beta:[["α","distA",2],["β","distB",3]]
};
function renderDistributionParams(){
  var type=$("#distributionType").value,holder=$("#distributionParams");holder.innerHTML="";
  (DISTRIBUTION_FIELDS[type]||[]).forEach(function(spec){
    var wrap=document.createElement("div");wrap.className="field";
    var label=document.createElement("label");label.setAttribute("for",spec[1]);label.textContent=spec[0];
    var input=document.createElement("input");input.id=spec[1];input.type="number";input.step="any";input.value=spec[2];wrap.append(label,input);holder.appendChild(wrap);
  });
}
function selectedDistribution(){
  var type=$("#distributionType").value,a=Number($("#distA")&&$("#distA").value),b=Number($("#distB")&&$("#distB").value);
  if(type==="normal")return new S.Normal(a,b);
  if(type==="binomial")return new S.Binomial(a,b);
  if(type==="poisson")return new S.Poisson(a);
  if(type==="t")return new S.StudentT(a);
  if(type==="chisq")return new S.ChiSquare(a);
  if(type==="gamma")return new S.GammaDistribution(a,b);
  if(type==="beta")return new S.BetaDistribution(a,b);
  throw new S.DistributionError("Unknown distribution");
}
function renderDistribution(mode){
  var box=$("#distributionResult");
  try{
    var dist=selectedDistribution();
    if(mode==="quantile"){
      var p=Number($("#distributionP").value),q=dist.quantile(p);setDistributionText(["Quantile("+M.formatNumber(p,8)+") = "+dataNumber(q),"distribution = "+dist.name]);return;
    }
    var x=Number($("#distributionX").value),density=dist.discrete?dist.pmf(x):dist.pdf(x),lines=[
      (dist.discrete?"PMF":"PDF")+"("+dataNumber(x)+") = "+formatProbabilityValue(density),
      "CDF = "+formatProbabilityValue(dist.cdf(x)),
      "SF = "+formatProbabilityValue(dist.sf(x)),
      "mean = "+dataNumber(dist.mean()),
      "variance = "+dataNumber(dist.variance())
    ];setDistributionText(lines);
  }catch(e){box.textContent=errorMessage(e);box.classList.add("ws-error");box.classList.remove("muted");}
}
function setDistributionText(lines){
  var box=$("#distributionResult");box.innerHTML="";box.classList.remove("muted","ws-error");var pre=document.createElement("pre");pre.textContent=lines.join("\n");box.appendChild(pre);
}

const tools=[
  {id:"percent",name:"Percentage",desc:"Percentage, percentage change, and reverse percentage."},
  {id:"unit",name:"Unit converter",desc:"Convert typed physical, temperature, angle, and information quantities."},
  {id:"engineering",name:"Engineering relations",desc:"Solve dimensional engineering relations from any sufficient set of known values."},
  {id:"loan",name:"Loan & amortization",desc:"Payment, total interest, and amortization."},
  {id:"triangle",name:"Triangle (SSS)",desc:"Solve a triangle from three sides."},
  {id:"circle",name:"Circle",desc:"Radius, diameter, circumference, and area."},
  {id:"date",name:"Date difference",desc:"Exact elapsed calendar days."},
  {id:"programmer",name:"Programmer",desc:"Base conversion and fixed-width signed interpretation."},
  {id:"number",name:"Number theory",desc:"GCD, LCM, and Bézout coefficients."}
];
function renderToolList(){
  var list=$("#toolList");list.innerHTML="";
  tools.forEach(function(t){var b=document.createElement("button");b.textContent=t.name;b.classList.toggle("active",t.id===state.selectedTool);b.onclick=function(){state.selectedTool=t.id;renderToolList();renderTool();};list.appendChild(b);});
}
function field(label,id,type,value,extra){
  return '<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+(type||"text")+'" value="'+(value===undefined?"":value)+'" '+(extra||"")+'></div>';
}
function selectField(label,id,options){
  return '<div class="field"><label for="'+id+'">'+label+'</label><select id="'+id+'">'+options.map(function(o){return '<option value="'+o[0]+'">'+o[1]+'</option>';}).join("")+'</select></div>';
}
function toolFrame(t,body){
  return '<div class="tool-title">'+t.name+'</div><div class="tool-desc">'+t.desc+'</div><div class="tool-form">'+body+'</div><div class="action-row"><button id="toolRun" class="primary-btn">Calculate</button></div><div id="toolResult" class="tool-result"><strong>Result</strong><span class="muted">Enter values and calculate.</span></div>';
}
function renderTool(){
  var t=tools.find(function(x){return x.id===state.selectedTool;})||tools[0],body="";
  if(t.id==="percent")body=field("Value","pValue","number",200)+field("Percentage","pPct","number",15)+field("Old value","pOld","number",100)+field("New value","pNew","number",120);
  else if(t.id==="unit"){
    var unitCats=Object.keys(U.CONVERTER_CATEGORIES);
    body=field("Value","uValue","text","1")+selectField("Category","uGroup",unitCats.map(function(x){var label=x.replace(/([A-Z])/g," $1").replace(/^./,function(c){return c.toUpperCase();});return [x,label];}))+'<div class="field"><label>From</label><select id="uFrom"></select></div><div class="field"><label>To</label><select id="uTo"></select></div>';
  }else if(t.id==="engineering"){
    var relationOptions=Object.keys(U.ENGINEERING_RELATIONS).map(function(id){return [id,U.ENGINEERING_RELATIONS[id].name];});
    body=selectField("Relation","engRelation",relationOptions)+'<div id="engFields" class="field full"></div>';
  }else if(t.id==="loan")body=field("Principal","lPrincipal","number",250000)+field("Annual rate (%)","lRate","number",4.5)+field("Years","lYears","number",30)+field("Payments / year","lFreq","number",12);
  else if(t.id==="triangle")body=field("Side a","triA","number",3)+field("Side b","triB","number",4)+field("Side c","triC","number",5);
  else if(t.id==="circle")body=field("Radius","circleR","number",3);
  else if(t.id==="date")body=field("Start date","dateA","date","2026-01-01")+field("End date","dateB","date","2026-12-31");
  else if(t.id==="programmer")body=field("Value","progValue","text","FF")+selectField("Input base","progBase",[[2,"Binary"],[8,"Octal"],[10,"Decimal"],[16,"Hexadecimal"]])+selectField("Width","progWidth",[[8,"8-bit"],[16,"16-bit"],[32,"32-bit"],[64,"64-bit"]]);
  else if(t.id==="number")body=field("a","numA","text","240")+field("b","numB","text","46");
  $("#toolRunner").innerHTML=toolFrame(t,body);
  $("#toolRun").onclick=runSelectedTool;
  if(t.id==="unit"){updateUnitSelects();$("#uGroup").onchange=updateUnitSelects;}
  if(t.id==="engineering"){renderEngineeringFields();$("#engRelation").onchange=renderEngineeringFields;}
}
const ENGINEERING_DEFAULTS={
  ohm:{V:"12 V",I:"",R:"6 ohm"},
  power:{P:"",V:"12 V",I:"2 A"},
  force:{F:"10 N",m:"2 kg",a:""},
  kinetic:{E:"",m:"2 kg",v:"3 m/s"},
  wave:{v:"",f:"2 Hz",lambda:"3 m"},
  density:{rho:"",m:"1 kg",V:"1 L"}
};
function renderEngineeringFields(){
  var holder=$("#engFields"),select=$("#engRelation");if(!holder||!select)return;
  var relation=U.ENGINEERING_RELATIONS[select.value];if(!relation)return;
  holder.innerHTML="";
  var grid=document.createElement("div");grid.className="tool-form";grid.style.gridColumn="1 / -1";
  Object.keys(relation.variables).forEach(function(name){
    var spec=relation.variables[name],wrap=document.createElement("div");wrap.className="field";
    var label=document.createElement("label");label.setAttribute("for","engVar-"+name);
    label.textContent=name+(spec.kind?" · "+spec.kind:"");
    var input=document.createElement("input");input.id="engVar-"+name;input.type="text";
    input.placeholder=spec.unit?("e.g. 1 "+prettyUnitLabel(spec.unit)):"quantity with compatible units";
    input.value=(ENGINEERING_DEFAULTS[relation.id]&&ENGINEERING_DEFAULTS[relation.id][name])||"";
    wrap.append(label,input);grid.appendChild(wrap);
  });
  var hint=document.createElement("div");hint.className="hint";hint.style.gridColumn="1 / -1";
  hint.textContent="Leave exactly one variable blank to solve it, or fill every variable to check consistency.";
  grid.appendChild(hint);holder.appendChild(grid);
}
function prettyUnitLabel(u){
  var simple=U.UNIT_REGISTRY.get(u);
  if(simple&&u.indexOf("/")<0&&u.indexOf("*")<0&&u.indexOf("^")<0)return simple.symbol;
  return String(u).replace(/\^2/g,"²").replace(/\^3/g,"³").replace(/\/hr/g,"/h").replace(/USgal/g,"gal (US)").replace(/USfloz/g,"fl oz (US)");
}
function updateUnitSelects(){
  var group=$("#uGroup").value,units=(U.CONVERTER_CATEGORIES[group]||[]).slice();
  ["#uFrom","#uTo"].forEach(function(sel,idx){var el=$(sel);el.innerHTML="";units.forEach(function(u,i){var o=document.createElement("option");o.value=u;o.textContent=prettyUnitLabel(u);if((idx===0&&i===0)||(idx===1&&i===Math.min(1,units.length-1)))o.selected=true;el.appendChild(o);});});
}
function extGcd(a,b){
  var oldR=a,r=b,oldS=1n,s=0n,oldT=0n,t=1n;
  while(r!==0n){var q=oldR/r,tmp=oldR-q*r;oldR=r;r=tmp;tmp=oldS-q*s;oldS=s;s=tmp;tmp=oldT-q*t;oldT=t;t=tmp;}
  if(oldR<0n){oldR=-oldR;oldS=-oldS;oldT=-oldT;}return [oldR,oldS,oldT];
}
async function runSelectedTool(){
  var id=state.selectedTool,out=$("#toolResult"),text;
  try{
    if(id==="percent"){
      var v=Number($("#pValue").value),p=Number($("#pPct").value),old=Number($("#pOld").value),nu=Number($("#pNew").value);
      var change=old===0?"undefined":M.formatNumber((nu-old)/old*100)+"%";
      text=M.formatNumber(p)+"% of "+M.formatNumber(v)+" = "+M.formatNumber(v*p/100)+"\nPercentage change: "+change;
    }else if(id==="unit"){
      var ur=U.tryEvaluate($("#uValue").value+" "+$("#uFrom").value+" to "+$("#uTo").value,{}, {angle:state.angle,precision:state.precision});
      text=ur.display+(ur.approx?"\n"+ur.approx:"");
    }else if(id==="engineering"){
      var relationId=$("#engRelation").value,relation=U.ENGINEERING_RELATIONS[relationId],parts=[];
      Object.keys(relation.variables).forEach(function(name){var el=$("#engVar-"+name),value=el?el.value.trim():"";if(value)parts.push(name+"="+value);});
      var er=U.tryEvaluate("eng("+relationId+(parts.length?", "+parts.join(", "):"")+")",{}, {angle:state.angle,precision:state.precision});
      text=er.display;
    }else if(id==="loan"){
      var lr=M.loan($("#lPrincipal").value,Number($("#lRate").value)/100,$("#lYears").value,$("#lFreq").value);
      text="Payment: "+M.formatNumber(lr.payment)+"\nTotal interest: "+M.formatNumber(lr.totalInterest)+"\nTotal paid: "+M.formatNumber(lr.totalPaid)+"\nPayments: "+lr.schedule.length;
    }else if(id==="triangle"){
      var tr=M.triangleSSS($("#triA").value,$("#triB").value,$("#triC").value);
      text="Angles: A "+M.formatNumber(tr.A)+"°, B "+M.formatNumber(tr.B)+"°, C "+M.formatNumber(tr.C)+"°\nArea: "+M.formatNumber(tr.area)+" · Perimeter: "+M.formatNumber(tr.perimeter);
    }else if(id==="circle"){
      var r=Number($("#circleR").value);if(!(r>0))throw new Error("Radius must be positive");
      text="Diameter: "+M.formatNumber(2*r)+"\nCircumference: "+M.formatNumber(2*Math.PI*r)+"\nArea: "+M.formatNumber(Math.PI*r*r);
    }else if(id==="date"){
      var days=M.dateDiffDays($("#dateA").value,$("#dateB").value);text=days+" day"+(Math.abs(days)===1?"":"s");
    }else if(id==="programmer"){
      var val=M.parseBigIntBase($("#progValue").value,$("#progBase").value),width=Number($("#progWidth").value),raw=((val%(1n<<BigInt(width)))+(1n<<BigInt(width)))%(1n<<BigInt(width)),signed=M.bitInterpret(raw,width,true);
      text="HEX  "+M.formatBase(raw,16)+"\nDEC  unsigned "+raw.toString()+" · signed "+signed.toString()+"\nOCT  "+M.formatBase(raw,8)+"\nBIN  "+M.formatBase(raw,2,width);
    }else if(id==="number"){
      var a=BigInt($("#numA").value),b=BigInt($("#numB").value),eg=extGcd(a,b);
      text="gcd = "+eg[0].toString()+"\nlcm = "+M.lcmBig(a,b).toString()+"\nBézout: "+a+"·("+eg[1]+") + "+b+"·("+eg[2]+") = "+eg[0];
    }
    out.innerHTML="<strong>Result</strong><pre></pre>";$("pre",out).textContent=text;
    await addHistory(tools.find(function(t){return t.id===id;}).name,{display:text,approx:""},"tool");
  }catch(e){out.innerHTML="<strong>Error</strong><span class=\"ws-error\"></span>";$(".ws-error",out).textContent=errorMessage(e);}
}

let worksheetSaveTimer=null;
function newWorksheet(){
  var ws={id:uid(),title:"Untitled worksheet",createdAt:Date.now(),updatedAt:Date.now(),revision:1,blocks:[{id:uid(),type:"math",source:""}]};
  state.worksheets.unshift(ws);state.activeWorksheet=ws;renderWorksheetArea();saveWorksheet(ws,true);
}
async function loadWorksheets(){
  try{state.worksheets=(await dbAll("worksheets")).sort(function(a,b){return b.updatedAt-a.updatedAt;});}
  catch(e){state.worksheets=[];}
  if(!state.worksheets.length)newWorksheet();else{state.activeWorksheet=state.worksheets[0];renderWorksheetArea();}
}
function scheduleWorksheetSave(){
  clearTimeout(worksheetSaveTimer);worksheetSaveTimer=setTimeout(function(){if(state.activeWorksheet)saveWorksheet(state.activeWorksheet,false);},250);
}
async function saveWorksheet(ws,immediate){
  ws.updatedAt=Date.now();ws.revision=(ws.revision||0)+1;
  try{await dbPut("worksheets",JSON.parse(JSON.stringify(ws)));if(immediate)toast("Worksheet saved");}
  catch(e){toast("Could not save worksheet: "+errorMessage(e));}
  renderWorksheetList();
}
function renderWorksheetArea(){
  if(!state.activeWorksheet)return;
  $("#worksheetTitle").value=state.activeWorksheet.title;
  renderWorksheetList();renderWorksheetBlocks();recalcWorksheet(false);
}
function renderWorksheetList(){
  var list=$("#worksheetList");if(!list)return;list.innerHTML="";
  state.worksheets.sort(function(a,b){return b.updatedAt-a.updatedAt;}).forEach(function(ws){
    var b=document.createElement("button");b.textContent=ws.title||"Untitled worksheet";b.classList.toggle("active",state.activeWorksheet&&ws.id===state.activeWorksheet.id);
    b.onclick=function(){state.activeWorksheet=ws;renderWorksheetArea();};list.appendChild(b);
  });
}
function renderWorksheetBlocks(){
  var area=$("#worksheetBlocks");area.innerHTML="";var ws=state.activeWorksheet;
  ws.blocks.forEach(function(block,index){
    var wrap=document.createElement("div");wrap.className="ws-block "+block.type;wrap.dataset.block=block.id;
    var head=document.createElement("div");head.className="ws-block-head";
    var type=document.createElement("span");type.textContent=block.type==="math"?"Math":"Text";
    var acts=document.createElement("div");acts.className="ws-block-actions";
    [["↑","up"],["↓","down"],["×","delete"]].forEach(function(a){var b=document.createElement("button");b.textContent=a[0];b.dataset.wsAction=a[1];b.dataset.blockId=block.id;b.setAttribute("aria-label",a[1]+" block");acts.appendChild(b);});
    head.append(type,acts);wrap.appendChild(head);
    var ed=document.createElement("textarea");ed.className="ws-editor";ed.rows=block.type==="math"?2:3;ed.value=block.source||"";ed.dataset.blockInput=block.id;ed.placeholder=block.type==="math"?"Expression or assignment":"Notes…";wrap.appendChild(ed);
    if(block.type==="math"){var res=document.createElement("div");res.className="ws-result muted";res.dataset.blockResult=block.id;res.textContent="";wrap.appendChild(res);}
    area.appendChild(wrap);
  });
  $$("[data-block-input]").forEach(function(ed){ed.addEventListener("input",function(){
    var b=state.activeWorksheet.blocks.find(function(x){return x.id===ed.dataset.blockInput;});if(!b)return;b.source=ed.value;recalcWorksheet(true);scheduleWorksheetSave();
  });});
  $$("[data-ws-action]").forEach(function(btn){btn.onclick=function(){mutateBlock(btn.dataset.blockId,btn.dataset.wsAction);};});
}
function recalcWorksheet(resultsOnly){
  var ws=state.activeWorksheet;if(!ws)return;var env={};
  ws.blocks.forEach(function(block){
    if(block.type!=="math")return;
    block.result="";block.error="";
    if(!String(block.source||"").trim()){updateBlockResult(block);return;}
    try{
      var res=evaluateInput(block.source,env,true);block.result=res.display+(res.approx?" "+res.approx:"");
    }catch(e){block.error=errorMessage(e);}
    updateBlockResult(block);
  });
}
function updateBlockResult(block){
  var el=$('[data-block-result="'+block.id+'"]');if(!el)return;
  el.textContent=block.error?block.error:(block.result||"");el.classList.toggle("ws-error",!!block.error);el.classList.toggle("muted",!block.error&&!block.result);
}
function mutateBlock(id,action){
  var ws=state.activeWorksheet,i=ws.blocks.findIndex(function(b){return b.id===id;});if(i<0)return;
  if(action==="delete"){ws.blocks.splice(i,1);}
  else if(action==="up"&&i>0){var a=ws.blocks[i-1];ws.blocks[i-1]=ws.blocks[i];ws.blocks[i]=a;}
  else if(action==="down"&&i<ws.blocks.length-1){var d=ws.blocks[i+1];ws.blocks[i+1]=ws.blocks[i];ws.blocks[i]=d;}
  renderWorksheetBlocks();recalcWorksheet(false);scheduleWorksheetSave();
}
function addBlock(type){
  if(!state.activeWorksheet)return;
  state.activeWorksheet.blocks.push({id:uid(),type:type,source:""});renderWorksheetBlocks();recalcWorksheet(false);scheduleWorksheetSave();
  var inputs=$$("[data-block-input]");if(inputs.length)inputs[inputs.length-1].focus();
}

async function renderHistory(){
  var list=$("#historyList");if(!list)return;
  if(!state.history.length){try{state.history=(await dbAll("history")).sort(function(a,b){return b.time-a.time;});}catch(e){}}
  list.innerHTML="";
  if(!state.history.length){list.innerHTML='<div class="muted" style="padding:26px 0">No calculations yet.</div>';return;}
  state.history.forEach(function(h){
    var row=document.createElement("div");row.className="history-entry";row.tabIndex=0;
    var left=document.createElement("div"),exp=document.createElement("div"),tm=document.createElement("div"),res=document.createElement("div");
    exp.className="history-expression";exp.textContent=h.expression;tm.className="history-time";tm.textContent=new Date(h.time).toLocaleString();res.className="history-result";res.textContent=h.result;
    left.append(exp,tm);row.append(left,res);row.onclick=function(){if(h.source==="calculate"){$("#expressionInput").value=h.expression;switchView("calculate");previewExpression();$("#expressionInput").focus();}};list.appendChild(row);
  });
}

const commands=[
  {id:"view.calculate",title:"Open Calculate",keywords:"calculator home",run:function(){switchView("calculate");}},
  {id:"view.graph",title:"Open Graph",keywords:"plot function",run:function(){switchView("graph");}},
  {id:"view.matrix",title:"Open Matrix",keywords:"linear algebra rref",run:function(){switchView("matrix");}},
  {id:"view.data",title:"Open Data",keywords:"statistics regression csv",run:function(){switchView("data");}},
  {id:"view.tools",title:"Open Tools",keywords:"finance geometry units",run:function(){switchView("tools");}},
  {id:"view.worksheet",title:"Open Worksheet",keywords:"notebook document",run:function(){switchView("worksheet");}},
  {id:"view.history",title:"Open History",keywords:"recent calculations",run:function(){switchView("history");}},
  {id:"data.regression",title:"Regression analysis",keywords:"statistics regression data least squares",run:function(){switchView("data");setTimeout(function(){var el=$("#regressionBtn");if(el)el.focus();},0);}},
  {id:"data.inference",title:"Statistical inference",keywords:"statistics t test confidence interval hypothesis",run:function(){switchView("data");setTimeout(function(){var el=$("#testColumnSelect");if(el)el.focus();},0);}},
  {id:"data.distribution",title:"Probability distribution",keywords:"probability normal binomial poisson distribution cdf quantile",run:function(){switchView("data");setTimeout(function(){var el=$("#distributionType");if(el)el.focus();},0);}},
  {id:"action.newWorksheet",title:"New Worksheet",keywords:"create notebook",run:function(){newWorksheet();switchView("worksheet");}},
  {id:"algebra.solve",title:"Solve equation",keywords:"algebra equation roots quadratic",run:function(){switchView("calculate");$("#expressionInput").value="solve(x^2 - 5*x + 6 = 0, x)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.simplify",title:"Simplify expression",keywords:"algebra simplify rational expression",run:function(){switchView("calculate");$("#expressionInput").value="simplify((x^2 - 1)/(x - 1))";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.expand",title:"Expand expression",keywords:"algebra polynomial expand",run:function(){switchView("calculate");$("#expressionInput").value="expand((x + 1)^3)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.collect",title:"Collect polynomial terms",keywords:"algebra collect like terms polynomial",run:function(){switchView("calculate");$("#expressionInput").value="collect(x + 2*x^2 + x, x)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.factor",title:"Factor polynomial",keywords:"algebra polynomial factor",run:function(){switchView("calculate");$("#expressionInput").value="factor(x^2 - 5*x + 6)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.system",title:"Solve linear system",keywords:"algebra simultaneous equations system",run:function(){switchView("calculate");$("#expressionInput").value="system(x + y = 3; x - y = 1)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.inequality",title:"Solve inequality",keywords:"algebra inequality interval",run:function(){switchView("calculate");$("#expressionInput").value="inequality(x^2 - 1 <= 0, x)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.diff",title:"Differentiate expression",keywords:"calculus derivative diff",run:function(){switchView("calculate");$("#expressionInput").value="diff(x^3 + sin(x), x)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.gradient",title:"Gradient",keywords:"calculus multivariable gradient partial",run:function(){switchView("calculate");$("#expressionInput").value="gradient(x^2+y^2, x, y)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.jacobian",title:"Jacobian",keywords:"calculus multivariable jacobian derivatives",run:function(){switchView("calculate");$("#expressionInput").value="jacobian(x^2+y; x*y, x, y)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.hessian",title:"Hessian",keywords:"calculus multivariable hessian second derivatives",run:function(){switchView("calculate");$("#expressionInput").value="hessian(x^2+3*x*y+y^2, x, y)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.integrate",title:"Find antiderivative",keywords:"calculus integral integrate antiderivative",run:function(){switchView("calculate");$("#expressionInput").value="integrate(x^2 + cos(x), x)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.definite",title:"Definite integral",keywords:"calculus definite integral area",run:function(){switchView("calculate");$("#expressionInput").value="integral(x^2, x, 0, 3)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.limit",title:"Evaluate limit",keywords:"calculus limit lhopital",run:function(){switchView("calculate");$("#expressionInput").value="limit(sin(x)/x, x, 0)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.taylor",title:"Taylor polynomial",keywords:"calculus series maclaurin taylor",run:function(){switchView("calculate");$("#expressionInput").value="taylor(exp(x), x, 0, 5)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.root",title:"Numerical root",keywords:"calculus numerical root bisection newton secant",run:function(){switchView("calculate");$("#expressionInput").value="root(cos(x)-x, x, 0, 1)";previewExpression();$("#expressionInput").focus();}},
  {id:"units.convert",title:"Convert quantity",keywords:"units convert measurement quantity",run:function(){switchView("calculate");$("#expressionInput").value="80 km / 1.25 hr to km/hr";previewExpression();$("#expressionInput").focus();}},
  {id:"units.constant",title:"Physical constant",keywords:"physics constants g0 c0 planck",run:function(){switchView("calculate");$("#expressionInput").value="constant(g0)";previewExpression();$("#expressionInput").focus();}},
  {id:"engineering.ohm",title:"Ohm's law",keywords:"engineering voltage current resistance",run:function(){switchView("calculate");$("#expressionInput").value="eng(ohm, V=12 V, R=6 ohm)";previewExpression();$("#expressionInput").focus();}},
  {id:"engineering.force",title:"Newton's second law",keywords:"engineering force mass acceleration",run:function(){switchView("calculate");$("#expressionInput").value="eng(force, F=10 N, m=2 kg)";previewExpression();$("#expressionInput").focus();}},
  {id:"engineering.wave",title:"Wave relation",keywords:"engineering wave frequency wavelength speed",run:function(){switchView("calculate");$("#expressionInput").value="eng(wave, f=2 Hz, lambda=3 m)";previewExpression();$("#expressionInput").focus();}},
  {id:"action.theme",title:"Change Theme",keywords:"light dark oled graphite",run:cycleTheme}
];
tools.forEach(function(t){commands.push({id:"tool."+t.id,title:t.name,keywords:t.desc,run:function(){state.selectedTool=t.id;renderToolList();renderTool();switchView("tools");}});});
let commandIndex=0,commandMatches=[];
function openCommands(){
  var d=$("#commandDialog");if(!d.open)d.showModal();$("#commandInput").value="";commandIndex=0;renderCommands("");setTimeout(function(){$("#commandInput").focus();},0);
}
function closeCommands(){var d=$("#commandDialog");if(d.open)d.close();}
function renderCommands(q){
  q=String(q||"").trim().toLowerCase();
  commandMatches=commands.filter(function(c){return !q||(c.title+" "+(c.keywords||"")).toLowerCase().indexOf(q)>=0;}).slice(0,12);
  commandIndex=Math.min(commandIndex,Math.max(0,commandMatches.length-1));
  var box=$("#commandResults");box.innerHTML="";
  commandMatches.forEach(function(c,i){var b=document.createElement("button");b.className="command-item"+(i===commandIndex?" selected":"");b.innerHTML="<span></span><small>Run</small>";$("span",b).textContent=c.title;b.onclick=function(){c.run();closeCommands();};box.appendChild(b);});
}
function runCommandIndex(){if(commandMatches[commandIndex]){commandMatches[commandIndex].run();closeCommands();}}

function bindEvents(){
  $$("[data-view]").forEach(function(b){b.addEventListener("click",function(){switchView(b.dataset.view);});});
  $("#mobileNavBtn").onclick=openMobileNav;$("#mobileNavBackdrop").onclick=closeMobileNav;
  $("#themeBtn").onclick=cycleTheme;
  $("#angleBtn").textContent=state.angle;$("#angleBtn").onclick=function(){var arr=["RAD","DEG","GRAD"],i=arr.indexOf(state.angle);state.angle=arr[(i+1)%3];localStorage.setItem("calc.angle",state.angle);$("#angleBtn").textContent=state.angle;previewExpression();if(state.view==="graph")plotGraph();};
  $("#commandBtn").onclick=openCommands;
  document.addEventListener("keydown",function(e){
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openCommands();return;}
    if(e.key==="Escape"&&$("#commandDialog").open){closeCommands();return;}
    if((e.ctrlKey||e.metaKey)&&/^[1-7]$/.test(e.key)&&!$("#commandDialog").open){e.preventDefault();var vs=["calculate","graph","matrix","data","tools","worksheet","history"];switchView(vs[Number(e.key)-1]);}
  });
  $("#commandInput").addEventListener("input",function(e){commandIndex=0;renderCommands(e.target.value);});
  $("#commandInput").addEventListener("keydown",function(e){if(e.key==="ArrowDown"){e.preventDefault();commandIndex=Math.min(commandIndex+1,commandMatches.length-1);renderCommands(e.target.value);}else if(e.key==="ArrowUp"){e.preventDefault();commandIndex=Math.max(0,commandIndex-1);renderCommands(e.target.value);}else if(e.key==="Enter"){e.preventDefault();runCommandIndex();}});
  $("#commandDialog").addEventListener("click",function(e){if(e.target===$("#commandDialog"))closeCommands();});

  $("#expressionInput").addEventListener("input",previewExpression);
  $("#expressionInput").addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();evaluateCurrent();}});
  $$("#keypad [data-insert]").forEach(function(b){b.onclick=function(){insertExpression(b.dataset.insert);};});
  $$("[data-key-action]").forEach(function(b){b.onclick=function(){if(b.dataset.keyAction==="clear")clearExpression();else if(b.dataset.keyAction==="backspace")backspaceExpression();else evaluateCurrent();};});
  $$("[data-result-action]").forEach(function(b){b.onclick=function(){if(b.dataset.resultAction==="copy")copyText($("#exactResult").textContent+($("#approxResult").textContent?" "+$("#approxResult").textContent:""));else if(b.dataset.resultAction==="graph")graphCurrent();else if(state.lastResult){state.env.ans=state.lastResult.value;toast("Saved as ans");}};});
  $$("[data-quick]").forEach(function(b){b.onclick=function(){state.selectedTool=b.dataset.quick;renderToolList();renderTool();switchView("tools");};});

  $("#graphPlotBtn").onclick=plotGraph;$("#graphReset").onclick=resetGraph;
  $("#graphCanvas").addEventListener("wheel",function(e){
    e.preventDefault();var rect=graphCanvas.getBoundingClientRect(),px=e.clientX-rect.left,py=e.clientY-rect.top,p=screenToWorld(px,py),factor=Math.exp(e.deltaY*.0012),g=state.graph;
    g.xMin=p[0]+(g.xMin-p[0])*factor;g.xMax=p[0]+(g.xMax-p[0])*factor;g.yMin=p[1]+(g.yMin-p[1])*factor;g.yMax=p[1]+(g.yMax-p[1])*factor;drawGraph();
  },{passive:false});
  $("#graphCanvas").addEventListener("pointerdown",function(e){graphCanvas.setPointerCapture(e.pointerId);state.graph.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.graph.pointers.size===1)state.graph.drag={x:e.clientX,y:e.clientY,v:{xMin:state.graph.xMin,xMax:state.graph.xMax,yMin:state.graph.yMin,yMax:state.graph.yMax}};});
  $("#graphCanvas").addEventListener("pointermove",function(e){
    var rect=graphCanvas.getBoundingClientRect(),wx=screenToWorld(e.clientX-rect.left,e.clientY-rect.top);$("#graphReadout").textContent="x: "+M.formatNumber(wx[0],7)+" · y: "+M.formatNumber(wx[1],7);
    if(!state.graph.pointers.has(e.pointerId))return;
    state.graph.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(state.graph.pointers.size===1&&state.graph.drag){
      var s=graphSize(),g=state.graph,d=state.graph.drag,dx=e.clientX-d.x,dy=e.clientY-d.y,spanX=d.v.xMax-d.v.xMin,spanY=d.v.yMax-d.v.yMin;
      g.xMin=d.v.xMin-dx/s.w*spanX;g.xMax=d.v.xMax-dx/s.w*spanX;g.yMin=d.v.yMin+dy/s.h*spanY;g.yMax=d.v.yMax+dy/s.h*spanY;drawGraph();
    }
  });
  function endPointer(e){state.graph.pointers.delete(e.pointerId);state.graph.drag=null;}
  $("#graphCanvas").addEventListener("pointerup",endPointer);$("#graphCanvas").addEventListener("pointercancel",endPointer);

  $("#matrixRows").onchange=function(){renderMatrixGrid(true);};$("#matrixCols").onchange=function(){renderMatrixGrid(true);};
  $$("[data-matrix-op]").forEach(function(b){b.onclick=function(){runMatrix(b.dataset.matrixOp);};});
  $("#analyzeDataBtn").onclick=function(){analyzeData();};
  $("#sampleDataBtn").onclick=function(){$("#dataInput").value="x,y,group\n1,3,A\n2,5,A\n3,7,B\n4,9,B\n5,11,B";analyzeData();};
  $("#pearsonBtn").onclick=function(){dataCorrelation("pearson");};$("#spearmanBtn").onclick=function(){dataCorrelation("spearman");};
  $("#regressionBtn").onclick=function(){dataRegression();};$("#histogramBtn").onclick=dataHistogram;$("#boxplotBtn").onclick=dataBoxplot;
  $("#meanCiBtn").onclick=function(){renderInference("ci");};$("#oneSampleTBtn").onclick=function(){renderInference("test");};
  $("#distributionType").onchange=renderDistributionParams;$("#distributionEvalBtn").onclick=function(){renderDistribution("eval");};$("#distributionQuantileBtn").onclick=function(){renderDistribution("quantile");};
  $("#addMathBlock").onclick=function(){addBlock("math");};$("#addTextBlock").onclick=function(){addBlock("text");};$("#newWorksheetBtn").onclick=newWorksheet;
  $("#worksheetTitle").addEventListener("input",function(){if(state.activeWorksheet){state.activeWorksheet.title=this.value||"Untitled worksheet";scheduleWorksheetSave();renderWorksheetList();}});
  $("#clearHistoryBtn").onclick=async function(){if(!confirm("Clear calculation history?"))return;state.history=[];try{await dbClear("history");}catch(e){}renderHistory();};
  window.addEventListener("resize",function(){if(state.view==="graph")drawGraph();});
}

async function init(){
  setTheme(state.theme);bindEvents();renderMatrixGrid(false);renderToolList();renderTool();renderDistributionParams();populateDataControls();
  $("#graphExpressions").value="sin(x)\nx^2 / 5";plotGraph();
  try{state.history=(await dbAll("history")).sort(function(a,b){return b.time-a.time;});}catch(e){}
  await loadWorksheets();
  var initial=(location.hash||"").replace(/^#/,"");
  switchView(VIEW_META[initial]?initial:"calculate");
  window.addEventListener("hashchange",function(){var v=(location.hash||"").replace(/^#/,"");if(VIEW_META[v]&&v!==state.view)switchView(v);});
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(function(){});
}
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();state.installPrompt=e;$("#installBtn").classList.remove("hidden");});
$("#installBtn").onclick=async function(){if(!state.installPrompt)return;state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;$("#installBtn").classList.add("hidden");};

init().catch(function(e){
  console.error(e);$("#exactResult").textContent="Calc could not initialize";$("#approxResult").textContent=errorMessage(e);
});
})();