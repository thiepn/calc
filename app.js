(function(){
"use strict";
const M=window.CalcMath;
const A=window.CalcAlgebra;
const C=window.CalcCalculus;
const U=window.CalcUnits;
const LA=window.CalcLinearAlgebra;
const S=window.CalcStatistics;
const G=window.CalcGraph;
const T=window.CalcTools;
const $=function(s,r){return (r||document).querySelector(s);};
const $$=function(s,r){return Array.from((r||document).querySelectorAll(s));};
const uid=function(){return crypto.randomUUID?crypto.randomUUID():"id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);};

const VIEW_META={
  calculate:["Calculate","Exact when possible. Approximate when necessary."],
  graph:["Graph","Interactive 2D plotting and analysis."],
  matrix:["Matrix","Exact matrix arithmetic and row reduction."],
  data:["Data","Datasets, distributions, inference, regression and statistical models."],
  tools:["Tools","Registered everyday, finance, geometry, date, programmer and engineering calculators."],
  worksheet:["Worksheet","Persistent multi-step mathematical work."],
  history:["History","Your local calculation history."]
};

const state={
  view:"calculate",angle:localStorage.getItem("calc.angle")||"RAD",precision:12,
  env:{},lastResult:null,theme:localStorage.getItem("calc.theme")||"system",
  installPrompt:null,history:[],worksheets:[],activeWorksheet:null,
  graph:{session:null,drag:null,pinch:null,pointers:new Map(),geometries:[],worker:null},
  selectedTool:"percentage-of",toolSearch:"",dataset:null,statisticsWorker:null,dataRevision:0
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
async function addHistory(expression,res,source,extra){
  var item=Object.assign({id:uid(),time:Date.now(),expression:expression,result:res.display,approx:res.approx||"",source:source||"calculate"},extra||{});
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
function graphSession(){
  if(!state.graph.session)state.graph.session=new G.GraphSession({viewport:new G.Viewport(-10,10,-10,10),env:state.env});
  return state.graph.session;
}
function resizeGraph(){
  var rect=graphCanvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,3),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(graphCanvas.width!==w||graphCanvas.height!==h){graphCanvas.width=w;graphCanvas.height=h;}
  gctx.setTransform(dpr,0,0,dpr,0,0);
}
function graphSize(){var r=graphCanvas.getBoundingClientRect();return {w:Math.max(1,r.width),h:Math.max(1,r.height)};}
function worldToScreen(x,y){var s=graphSize();return graphSession().viewport.worldToScreen(x,y,s.w,s.h);}
function screenToWorld(px,py){var s=graphSize();return graphSession().viewport.screenToWorld(px,py,s.w,s.h);}
function css(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}
function graphPalette(index){var palette=[css("--accent"),"#d95f59","#2f9e67","#9166cc","#cc8129","#168fa1","#a65c8d","#6b7fce"];return palette[index%palette.length];}
function drawGraphAxes(ctx,s,viewport){
  ctx.clearRect(0,0,s.w,s.h);ctx.fillStyle=css("--surface");ctx.fillRect(0,0,s.w,s.h);
  var piMode=$("#graphPiTicks")&&$("#graphPiTicks").checked,xTicks=G.axisTicks(viewport.xMin,viewport.xMax,10,piMode?"pi":"numeric"),yTicks=G.axisTicks(viewport.yMin,viewport.yMax,8,"numeric");
  ctx.lineWidth=1;ctx.strokeStyle=css("--line");ctx.fillStyle=css("--muted");ctx.font="11px "+getComputedStyle(document.body).fontFamily;
  ctx.beginPath();
  xTicks.forEach(function(t){var p=viewport.worldToScreen(t.value,0,s.w,s.h);ctx.moveTo(p[0],0);ctx.lineTo(p[0],s.h);});
  yTicks.forEach(function(t){var p=viewport.worldToScreen(0,t.value,s.w,s.h);ctx.moveTo(0,p[1]);ctx.lineTo(s.w,p[1]);});
  ctx.stroke();
  ctx.strokeStyle=css("--line-strong");ctx.lineWidth=1.2;ctx.beginPath();
  if(viewport.xMin<=0&&viewport.xMax>=0){var ax=viewport.worldToScreen(0,0,s.w,s.h)[0];ctx.moveTo(ax,0);ctx.lineTo(ax,s.h);}
  if(viewport.yMin<=0&&viewport.yMax>=0){var ay=viewport.worldToScreen(0,0,s.w,s.h)[1];ctx.moveTo(0,ay);ctx.lineTo(s.w,ay);}
  ctx.stroke();
  ctx.fillStyle=css("--muted");ctx.font="10px "+getComputedStyle(document.body).fontFamily;
  var yAxis=viewport.yMin<=0&&viewport.yMax>=0?viewport.worldToScreen(0,0,s.w,s.h)[1]:s.h-2;
  xTicks.forEach(function(t){if(t.value===0)return;var p=viewport.worldToScreen(t.value,0,s.w,s.h);ctx.fillText(t.label,p[0]+3,Math.min(s.h-4,Math.max(11,yAxis-4)));});
  var xAxis=viewport.xMin<=0&&viewport.xMax>=0?viewport.worldToScreen(0,0,s.w,s.h)[0]:2;
  yTicks.forEach(function(t){if(t.value===0)return;var p=viewport.worldToScreen(0,t.value,s.w,s.h);ctx.fillText(t.label,Math.min(s.w-42,Math.max(3,xAxis+4)),p[1]-3);});
}
function drawPolyline(ctx,segments,viewport,s,color,width){
  ctx.strokeStyle=color;ctx.lineWidth=width||2;ctx.setLineDash([]);
  segments.forEach(function(seg){if(seg.length<2)return;ctx.beginPath();seg.forEach(function(p,i){var q=viewport.worldToScreen(p.x,p.y,s.w,s.h);if(i===0)ctx.moveTo(q[0],q[1]);else ctx.lineTo(q[0],q[1]);});ctx.stroke();});
}
function drawPointMarker(ctx,p,viewport,s,color,open,radius){
  var q=viewport.worldToScreen(p.x,p.y,s.w,s.h);ctx.beginPath();ctx.arc(q[0],q[1],radius||4,0,Math.PI*2);ctx.fillStyle=open?css("--surface"):color;ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.stroke();
}
function renderGeometry(ctx,geometry,series,index,viewport,s){
  var color=series.style&&series.style.color||graphPalette(index);
  if(geometry.type==="polyline"||geometry.type==="parametric"){
    drawPolyline(ctx,geometry.segments,viewport,s,color,2);
    (geometry.holes||[]).forEach(function(p){drawPointMarker(ctx,p,viewport,s,color,true,4);});
    (geometry.endpoints||[]).forEach(function(p){drawPointMarker(ctx,p,viewport,s,color,p.open,4);});
  }else if(geometry.type==="segments"){
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([]);geometry.segments.forEach(function(seg){var a=viewport.worldToScreen(seg[0].x,seg[0].y,s.w,s.h),b=viewport.worldToScreen(seg[1].x,seg[1].y,s.w,s.h);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();});
  }else if(geometry.type==="inequality"){
    ctx.save();ctx.fillStyle=color;ctx.globalAlpha=.12;geometry.cells.forEach(function(cell){var a=viewport.worldToScreen(cell.x,cell.y+cell.h,s.w,s.h),b=viewport.worldToScreen(cell.x+cell.w,cell.y,s.w,s.h);ctx.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);});ctx.restore();
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=2;if(!geometry.boundaryIncluded)ctx.setLineDash([6,5]);geometry.boundary.forEach(function(seg){var a=viewport.worldToScreen(seg[0].x,seg[0].y,s.w,s.h),b=viewport.worldToScreen(seg[1].x,seg[1].y,s.w,s.h);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();});ctx.restore();
  }else if(geometry.type==="scatter"){
    ctx.fillStyle=color;geometry.points.forEach(function(p){var q=viewport.worldToScreen(p.x,p.y,s.w,s.h);if(q[0]<-5||q[0]>s.w+5||q[1]<-5||q[1]>s.h+5)return;ctx.beginPath();ctx.arc(q[0],q[1],3.2,0,Math.PI*2);ctx.fill();});
  }else if(geometry.type==="histogram"){
    ctx.save();ctx.fillStyle=color;ctx.globalAlpha=.28;ctx.strokeStyle=color;geometry.bins.forEach(function(b){var a=viewport.worldToScreen(b.lo,0,s.w,s.h),q=viewport.worldToScreen(b.hi,b.count,s.w,s.h);ctx.fillRect(a[0],q[1],q[0]-a[0],a[1]-q[1]);ctx.strokeRect(a[0],q[1],q[0]-a[0],a[1]-q[1]);});ctx.restore();
  }else if(geometry.type==="boxplot"){
    var y=viewport.yMin+viewport.ySpan*.14,qMin=viewport.worldToScreen(geometry.min,y,s.w,s.h),q1=viewport.worldToScreen(geometry.q1,y,s.w,s.h),med=viewport.worldToScreen(geometry.median,y,s.w,s.h),q3=viewport.worldToScreen(geometry.q3,y,s.w,s.h),qMax=viewport.worldToScreen(geometry.max,y,s.w,s.h),h=26;
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(q1[0],q1[1]-h/2,q3[0]-q1[0],h);ctx.beginPath();ctx.moveTo(qMin[0],qMin[1]);ctx.lineTo(q1[0],q1[1]);ctx.moveTo(q3[0],q3[1]);ctx.lineTo(qMax[0],qMax[1]);ctx.moveTo(med[0],med[1]-h/2);ctx.lineTo(med[0],med[1]+h/2);ctx.stroke();(geometry.outliers||[]).forEach(function(x){drawPointMarker(ctx,{x:x,y:y},viewport,s,color,true,3);});
  }else if(geometry.type==="distribution"){
    if(geometry.discrete){
      ctx.strokeStyle=color;ctx.lineWidth=2;geometry.points.forEach(function(p){var a=viewport.worldToScreen(p.x,0,s.w,s.h),b=viewport.worldToScreen(p.x,p.y,s.w,s.h);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();drawPointMarker(ctx,p,viewport,s,color,false,2.5);});
    }else drawPolyline(ctx,[geometry.points],viewport,s,color,2);
  }else if(geometry.type==="vector"){
    var a=viewport.worldToScreen(geometry.origin.x,geometry.origin.y,s.w,s.h),b=viewport.worldToScreen(geometry.end.x,geometry.end.y,s.w,s.h),ang=Math.atan2(b[1]-a[1],b[0]-a[0]);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();ctx.beginPath();ctx.moveTo(b[0],b[1]);ctx.lineTo(b[0]-9*Math.cos(ang-.45),b[1]-9*Math.sin(ang-.45));ctx.lineTo(b[0]-9*Math.cos(ang+.45),b[1]-9*Math.sin(ang+.45));ctx.closePath();ctx.fill();
  }
}
function renderGraphMarkers(ctx,session,s){
  session.markers.forEach(function(m){
    var series=session.series.find(function(x){return x.id===m.seriesId;})||session.series[0],index=Math.max(0,session.series.indexOf(series)),color=graphPalette(index);
    if(m.kind==="integral"&&series instanceof G.FunctionPlot){
      var steps=100,points=[];for(var i=0;i<=steps;i++){var x=m.a+(m.b-m.a)*i/steps,y=series.evaluate(x,session.sliderEnv());if(Number.isFinite(y))points.push({x:x,y:y});}
      if(points.length>1){ctx.save();ctx.fillStyle=color;ctx.globalAlpha=.12;ctx.beginPath();var z=worldToScreen(points[0].x,0);ctx.moveTo(z[0],z[1]);points.forEach(function(p){var q=worldToScreen(p.x,p.y);ctx.lineTo(q[0],q[1]);});z=worldToScreen(points[points.length-1].x,0);ctx.lineTo(z[0],z[1]);ctx.closePath();ctx.fill();ctx.restore();}
    }else if(Number.isFinite(m.x)&&Number.isFinite(m.y))drawPointMarker(ctx,m,session.viewport,s,color,false,4.5);
  });
}
function drawGraph(){
  resizeGraph();var s=graphSize(),session=graphSession(),viewport=session.viewport,ctx=gctx;
  drawGraphAxes(ctx,s,viewport);
  var env=session.sliderEnv(),geometries=[];
  session.series.forEach(function(series,index){
    if(!series.visible)return;
    try{var geometry=series.geometry(viewport,s.w,s.h,env,{});geometries.push({series:series,geometry:geometry});renderGeometry(ctx,geometry,series,index,viewport,s);}
    catch(e){geometries.push({series:series,error:e});}
  });
  state.graph.geometries=geometries;renderGraphMarkers(ctx,session,s);renderGraphA11y();
}
function plotGraph(){
  var parsed=G.parseGraphText($("#graphExpressions").value,{env:state.env,viewport:graphSession().viewport}),oldViewport=graphSession().viewport;
  parsed.session.setViewport(oldViewport);state.graph.session=parsed.session;
  if(parsed.errors.length)toast("Graph: "+parsed.errors.length+" line"+(parsed.errors.length===1?"":"s")+" could not be plotted");
  renderGraphSliders();renderGraphLegend();populateGraphSeriesSelects();drawGraph();
}
function renderGraphLegend(){
  var box=$("#graphLegend"),session=graphSession();box.innerHTML="";
  session.series.forEach(function(series,index){
    var d=document.createElement("label");d.className="legend-item";var check=document.createElement("input");check.type="checkbox";check.checked=series.visible;check.setAttribute("aria-label","Toggle "+series.label);
    var sw=document.createElement("span");sw.className="legend-swatch";sw.style.background=graphPalette(index);var t=document.createElement("span");t.textContent=series.label+" · "+series.type;
    check.onchange=function(){series.visible=check.checked;session.revision++;drawGraph();};d.append(check,sw,t);box.appendChild(d);
  });
}
function renderGraphSliders(){
  var box=$("#graphSliders"),session=graphSession();box.innerHTML="";
  session.sliders.forEach(function(slider){
    var wrap=document.createElement("div");wrap.className="graph-slider";var label=document.createElement("label");label.textContent=slider.name+" = ";
    var value=document.createElement("span");value.textContent=M.formatNumber(slider.value,8);label.appendChild(value);
    var input=document.createElement("input");input.type="range";input.min=slider.min;input.max=slider.max;input.step=slider.step;input.value=slider.value;
    input.oninput=function(){session.setSliderValue(slider.name,Number(input.value));value.textContent=M.formatNumber(Number(input.value),8);drawGraph();};
    wrap.append(label,input);box.appendChild(wrap);
  });
}
function graphFunctionSeries(){return graphSession().series.filter(function(s){return s instanceof G.FunctionPlot;});}
function populateGraphSeriesSelects(){
  var series=graphFunctionSeries();
  ["#graphSeriesA","#graphSeriesB"].forEach(function(sel,index){var el=$(sel),old=el.value;el.innerHTML="";series.forEach(function(s,i){var o=document.createElement("option");o.value=s.id;o.textContent=s.label;if(s.id===old||(!old&&i===Math.min(index,series.length-1)))o.selected=true;el.appendChild(o);});});
}
function selectedGraphSeries(which){
  var id=$(which==2?"#graphSeriesB":"#graphSeriesA").value,series=graphSession().series.find(function(s){return s.id===id;});
  if(!(series instanceof G.FunctionPlot))throw new G.GraphUnsupportedError("Choose an explicit function series");
  return series;
}
function graphAnalysisText(lines){
  var box=$("#graphAnalysisResult");box.innerHTML="";box.classList.remove("muted","ws-error");var pre=document.createElement("pre");pre.textContent=Array.isArray(lines)?lines.join("\n"):String(lines);box.appendChild(pre);renderGraphA11y();
}
function clearAnalysisMarkers(kinds){graphSession().markers=graphSession().markers.filter(function(m){return kinds.indexOf(m.kind)<0;});}
function analyzeGraphRoots(){
  try{var s=selectedGraphSeries(1),roots=G.findRoots(s,graphSession().viewport,graphSession().sliderEnv());clearAnalysisMarkers(["root"]);roots.forEach(function(r){graphSession().markers.push(Object.assign({seriesId:s.id},r));});graphAnalysisText(roots.length?roots.map(function(r){return "root: x = "+M.formatNumber(r.x,state.precision)+" · residual "+M.formatNumber(Math.abs(r.y),6);}):["No certified roots found in viewport."]);drawGraph();}catch(e){graphAnalysisError(e);}
}
function analyzeGraphIntersections(){
  try{var a=selectedGraphSeries(1),b=selectedGraphSeries(2),hits=G.findIntersections(a,b,graphSession().viewport,graphSession().sliderEnv());clearAnalysisMarkers(["intersection"]);hits.forEach(function(r){graphSession().markers.push(Object.assign({seriesId:a.id},r));});graphAnalysisText(hits.length?hits.map(function(r){return "intersection: ("+M.formatNumber(r.x,state.precision)+", "+M.formatNumber(r.y,state.precision)+")";}):["No certified intersections found in viewport."]);drawGraph();}catch(e){graphAnalysisError(e);}
}
function analyzeGraphExtrema(){
  try{var s=selectedGraphSeries(1),hits=G.findExtrema(s,graphSession().viewport,graphSession().sliderEnv());clearAnalysisMarkers(["minimum","maximum","stationary"]);hits.forEach(function(r){graphSession().markers.push(Object.assign({seriesId:s.id},r));});graphAnalysisText(hits.length?hits.map(function(r){return r.kind+": ("+M.formatNumber(r.x,state.precision)+", "+M.formatNumber(r.y,state.precision)+")";}):["No certified stationary points found in viewport."]);drawGraph();}catch(e){graphAnalysisError(e);}
}
function analyzeGraphTangent(){
  try{var s=selectedGraphSeries(1),x=Number($("#graphPointX").value),t=G.tangentAt(s,x,graphSession().sliderEnv()),line=new G.FunctionPlot(t.source,{label:"tangent @ "+M.formatNumber(x,6)});graphSession().add(line);graphSession().markers.push({seriesId:s.id,kind:"tangent-point",x:t.x,y:t.y});renderGraphLegend();populateGraphSeriesSelects();graphAnalysisText(["point = ("+M.formatNumber(t.x,state.precision)+", "+M.formatNumber(t.y,state.precision)+")","slope = "+M.formatNumber(t.slope,state.precision),"line = "+t.source]);drawGraph();}catch(e){graphAnalysisError(e);}
}
function analyzeGraphIntegral(){
  try{var s=selectedGraphSeries(1),a=Number($("#graphBoundA").value),b=Number($("#graphBoundB").value),r=G.integralBetween(s,a,b),value=r.exact?M.formatValue(r.value):"≈ "+M.formatNumber(Number(r.value),state.precision);graphSession().markers.push({seriesId:s.id,kind:"integral",a:a,b:b,value:value});graphAnalysisText(["∫["+M.formatNumber(a,8)+", "+M.formatNumber(b,8)+"] "+s.label+" dx = "+value,"method = "+r.method+(r.errorEstimate?" · error estimate "+M.formatNumber(r.errorEstimate,6):"")]);drawGraph();}catch(e){graphAnalysisError(e);}
}
function graphAnalysisError(e){var box=$("#graphAnalysisResult");box.textContent=errorMessage(e);box.classList.add("ws-error");box.classList.remove("muted");}
function fitGraphPoints(points,includeZeroY){
  if(!points.length)return;var xs=points.map(function(p){return p.x;}).filter(Number.isFinite),ys=points.map(function(p){return p.y;}).filter(Number.isFinite);if(!xs.length||!ys.length)return;
  if(includeZeroY)ys.push(0);var xmin=Math.min.apply(null,xs),xmax=Math.max.apply(null,xs),ymin=Math.min.apply(null,ys),ymax=Math.max.apply(null,ys),dx=Math.max(1e-9,xmax-xmin),dy=Math.max(1e-9,ymax-ymin);
  graphSession().setViewport(new G.Viewport(xmin-dx*.12,xmax+dx*.12,ymin-dy*.15,ymax+dy*.15));
}
function graphAddScatter(){
  try{var ds=requireDataset(),cols=selectedDataColumns(),model=S.scatterModel(ds,cols.x,cols.y),series=new G.ScatterPlot(model,{label:cols.y+" vs "+cols.x});graphSession().add(series);fitGraphPoints(model.points,false);renderGraphLegend();drawGraph();}catch(e){toast(errorMessage(e));}
}
function graphAddRegression(){
  try{var ds=requireDataset(),cols=selectedDataColumns(),model=S.fitRegression(ds,cols.y,[cols.x]),scatter=S.scatterModel(ds,cols.x,cols.y);graphSession().add(new G.ScatterPlot(scatter,{label:cols.y+" vs "+cols.x}));var src=M.formatNumber(model.coefficients[0],15)+" + ("+M.formatNumber(model.coefficients[1],15)+")*x";graphSession().add(new G.FunctionPlot(src,{label:"regression: "+cols.y+" ~ "+cols.x}));fitGraphPoints(scatter.points,false);renderGraphLegend();populateGraphSeriesSelects();drawGraph();}catch(e){toast(errorMessage(e));}
}
function graphAddHistogram(){
  try{var ds=requireDataset(),name=$("#dataXSelect").value,model=S.histogramModel(ds.column(name).values),series=new G.HistogramPlot(model,{label:"histogram: "+name});graphSession().add(series);fitGraphPoints(model.bins.map(function(b){return {x:b.lo,y:b.count};}).concat(model.bins.map(function(b){return {x:b.hi,y:b.count};})),true);renderGraphLegend();drawGraph();}catch(e){toast(errorMessage(e));}
}
function graphAddBoxplot(){
  try{var ds=requireDataset(),name=$("#dataXSelect").value,model=S.boxPlotModel(ds.column(name).values);graphSession().add(new G.BoxPlot(model,{label:"box: "+name}));var y0=graphSession().viewport.yMin,y1=graphSession().viewport.yMax;graphSession().setViewport(new G.Viewport(model.min-(model.max-model.min||1)*.12,model.max+(model.max-model.min||1)*.12,y0,y1));renderGraphLegend();drawGraph();}catch(e){toast(errorMessage(e));}
}
function graphAddDistribution(){
  try{var dist=selectedDistribution(),model=S.distributionPlotModel(dist),series=new G.DistributionPlot(model,{label:dist.name});graphSession().add(series);fitGraphPoints(model.points,true);renderGraphLegend();drawGraph();}catch(e){toast(errorMessage(e));}
}
function renderGraphA11y(){
  var box=$("#graphA11y"),session=graphSession(),parts=[session.series.length+" graph series."];
  session.series.forEach(function(s){parts.push((s.visible?"Visible ":"Hidden ")+s.type+": "+s.label+".");});
  if(session.markers.length)parts.push(session.markers.length+" analysis markers.");
  box.textContent=parts.join(" ");
}
function resetGraph(){graphSession().setViewport(new G.Viewport(-10,10,-10,10));graphSession().markers=[];drawGraph();}
function exportGraphPng(){
  graphCanvas.toBlob(function(blob){if(!blob)return;var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="calc-graph.png";a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);},"image/png");
}

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

function toolDefinitions(){return T.REGISTRY.list();}
function renderToolList(){
  var list=$("#toolList"),query=state.toolSearch||"",tools=query?T.REGISTRY.search(query):toolDefinitions();list.innerHTML="";
  var search=document.createElement("input");search.type="search";search.className="tool-search";search.placeholder="Search tools";search.value=query;search.setAttribute("aria-label","Search tools");
  search.oninput=function(){state.toolSearch=this.value;renderToolList();};list.appendChild(search);
  var currentCategory=null;
  tools.forEach(function(t){
    if(t.category!==currentCategory){currentCategory=t.category;var h=document.createElement("div");h.className="tool-category";h.textContent=currentCategory;list.appendChild(h);}
    var b=document.createElement("button");b.textContent=t.name;b.title=t.description;b.classList.toggle("active",t.id===state.selectedTool);b.onclick=function(){state.selectedTool=t.id;history.replaceState(null,"","#tools/"+encodeURIComponent(t.id));renderToolList();renderTool();};list.appendChild(b);
  });
  if(!tools.length){var none=document.createElement("div");none.className="hint";none.textContent="No matching tools.";list.appendChild(none);}
}
function fieldHtml(spec){
  var id="toolInput-"+spec.id,value=spec.default===undefined?"":spec.default,label=spec.label||spec.id;
  if(spec.type==="select"){
    return '<div class="field"><label for="'+id+'">'+label+'</label><select id="'+id+'" data-tool-input="'+spec.id+'">'+(spec.options||[]).map(function(o){var v=Array.isArray(o)?o[0]:o,l=Array.isArray(o)?o[1]:o;return '<option value="'+String(v).replace(/"/g,"&quot;")+'" '+(String(v)===String(value)?"selected":"")+'>'+l+'</option>';}).join("")+'</select></div>';
  }
  if(spec.type==="boolean")return '<label class="field tool-checkbox"><span>'+label+'</span><input id="'+id+'" data-tool-input="'+spec.id+'" type="checkbox" '+(value?"checked":"")+'></label>';
  var type=spec.type==="date"?"date":spec.type==="number"||spec.type==="integer"||spec.type==="percent"?"number":"text",attrs="";
  if(spec.min!==undefined)attrs+=' min="'+spec.min+'"';if(spec.max!==undefined)attrs+=' max="'+spec.max+'"';if(type==="number")attrs+=' step="any"';
  return '<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" data-tool-input="'+spec.id+'" type="'+type+'" value="'+String(value).replace(/"/g,"&quot;")+'"'+attrs+'></div>';
}
function toolFrame(t,body,buttonLabel){
  return '<div class="tool-title">'+t.name+'</div><div class="tool-desc">'+t.description+'</div><div class="tool-meta">'+t.category+' · v'+t.version+'</div><div class="tool-form">'+body+'</div><div class="action-row"><button id="toolRun" class="primary-btn">'+(buttonLabel||"Calculate")+'</button></div><div id="toolResult" class="tool-result"><strong>Result</strong><span class="muted">Enter values and calculate.</span></div>';
}
function renderTool(){
  var t=T.REGISTRY.get(state.selectedTool)||T.REGISTRY.list()[0];if(!t)return;state.selectedTool=t.id;
  if(t.id==="unit-converter"){
    var unitCats=Object.keys(U.CONVERTER_CATEGORIES),body='<div class="field"><label for="uValue">Value</label><input id="uValue" type="text" value="1"></div>'+
      '<div class="field"><label for="uGroup">Category</label><select id="uGroup">'+unitCats.map(function(x){var label=x.replace(/([A-Z])/g," $1").replace(/^./,function(ch){return ch.toUpperCase();});return '<option value="'+x+'">'+label+'</option>';}).join("")+'</select></div>'+
      '<div class="field"><label>From</label><select id="uFrom"></select></div><div class="field"><label>To</label><select id="uTo"></select></div>';
    $("#toolRunner").innerHTML=toolFrame(t,body,"Convert");$("#toolRun").onclick=runSpecializedUnit;updateUnitSelects();$("#uGroup").onchange=updateUnitSelects;return;
  }
  if(t.id==="engineering-relations"){
    var relationOptions=Object.keys(U.ENGINEERING_RELATIONS).map(function(id){return '<option value="'+id+'">'+U.ENGINEERING_RELATIONS[id].name+'</option>';}).join("");
    $("#toolRunner").innerHTML=toolFrame(t,'<div class="field"><label for="engRelation">Relation</label><select id="engRelation">'+relationOptions+'</select></div><div id="engFields" class="field full"></div>',"Solve");
    $("#toolRun").onclick=runSpecializedEngineering;renderEngineeringFields();$("#engRelation").onchange=renderEngineeringFields;return;
  }
  $("#toolRunner").innerHTML=toolFrame(t,t.inputs.map(fieldHtml).join(""));$("#toolRun").onclick=runRegistryTool;
}
const ENGINEERING_DEFAULTS={
  ohm:{V:"12 V",I:"",R:"6 ohm"},power:{P:"",V:"12 V",I:"2 A"},force:{F:"10 N",m:"2 kg",a:""},kinetic:{E:"",m:"2 kg",v:"3 m/s"},wave:{v:"",f:"2 Hz",lambda:"3 m"},density:{rho:"",m:"1 kg",V:"1 L"}
};
function renderEngineeringFields(){
  var holder=$("#engFields"),select=$("#engRelation");if(!holder||!select)return;var relation=U.ENGINEERING_RELATIONS[select.value];if(!relation)return;holder.innerHTML="";
  var grid=document.createElement("div");grid.className="tool-form";grid.style.gridColumn="1 / -1";
  Object.keys(relation.variables).forEach(function(name){var spec=relation.variables[name],wrap=document.createElement("div");wrap.className="field";var label=document.createElement("label");label.setAttribute("for","engVar-"+name);label.textContent=name+(spec.kind?" · "+spec.kind:"");var input=document.createElement("input");input.id="engVar-"+name;input.type="text";input.placeholder=spec.unit?("e.g. 1 "+prettyUnitLabel(spec.unit)):"quantity with compatible units";input.value=(ENGINEERING_DEFAULTS[relation.id]&&ENGINEERING_DEFAULTS[relation.id][name])||"";wrap.append(label,input);grid.appendChild(wrap);});
  var hint=document.createElement("div");hint.className="hint";hint.style.gridColumn="1 / -1";hint.textContent="Leave exactly one variable blank to solve it, or fill every variable to check consistency.";grid.appendChild(hint);holder.appendChild(grid);
}
function prettyUnitLabel(u){var simple=U.UNIT_REGISTRY.get(u);if(simple&&u.indexOf("/")<0&&u.indexOf("*")<0&&u.indexOf("^")<0)return simple.symbol;return String(u).replace(/\^2/g,"²").replace(/\^3/g,"³").replace(/\/hr/g,"/h").replace(/USgal/g,"gal (US)").replace(/USfloz/g,"fl oz (US)");}
function updateUnitSelects(){var group=$("#uGroup").value,units=(U.CONVERTER_CATEGORIES[group]||[]).slice();["#uFrom","#uTo"].forEach(function(sel,idx){var el=$(sel);el.innerHTML="";units.forEach(function(u,i){var o=document.createElement("option");o.value=u;o.textContent=prettyUnitLabel(u);if((idx===0&&i===0)||(idx===1&&i===Math.min(1,units.length-1)))o.selected=true;el.appendChild(o);});});}
function collectToolInputs(t){
  var raw={};t.inputs.forEach(function(spec){var el=$('[data-tool-input="'+spec.id+'"]');if(!el)return;raw[spec.id]=spec.type==="boolean"?el.checked:el.value;});return raw;
}
function renderToolResult(out){
  var box=$("#toolResult");box.innerHTML="<strong>"+(out.title||"Result")+"</strong><pre></pre>";$("pre",box).textContent=out.display;
  if(out.warnings&&out.warnings.length){var warnings=document.createElement("div");warnings.className="tool-warnings";warnings.textContent=out.warnings.join(" ");box.appendChild(warnings);}
  if(out.details&&Object.keys(out.details).length){var meta=document.createElement("div");meta.className="tool-result-meta";meta.textContent=Object.keys(out.details).filter(function(k){return typeof out.details[k]!=="object";}).map(function(k){return k+": "+out.details[k];}).join(" · ");if(meta.textContent)box.appendChild(meta);}
}
async function recordToolHistory(t,out){
  var payload;try{payload=T.serializeToolResult(out);}catch(e){payload=null;}
  await addHistory(t.name,{display:out.display,approx:""},"tool:"+t.id,{toolId:t.id,toolVersion:t.version,toolPayload:payload});
}
async function runRegistryTool(){
  var t=T.REGISTRY.get(state.selectedTool),box=$("#toolResult");try{var out=T.REGISTRY.execute(t.id,collectToolInputs(t),{precision:state.precision,angle:state.angle});renderToolResult(out);await recordToolHistory(t,out);}catch(e){box.innerHTML="<strong>Error</strong><span class=\"ws-error\"></span>";$(".ws-error",box).textContent=errorMessage(e);}
}
async function runSpecializedUnit(){
  var t=T.REGISTRY.get("unit-converter"),box=$("#toolResult");try{var ur=U.tryEvaluate($("#uValue").value+" "+$("#uFrom").value+" to "+$("#uTo").value,{}, {angle:state.angle,precision:state.precision}),out={title:t.name,display:ur.display+(ur.approx?"\n"+ur.approx:""),warnings:[],details:{category:$("#uGroup").value}};renderToolResult(out);await recordToolHistory(t,out);}catch(e){box.innerHTML="<strong>Error</strong><span class=\"ws-error\"></span>";$(".ws-error",box).textContent=errorMessage(e);}
}
async function runSpecializedEngineering(){
  var t=T.REGISTRY.get("engineering-relations"),box=$("#toolResult");try{var relationId=$("#engRelation").value,relation=U.ENGINEERING_RELATIONS[relationId],parts=[];Object.keys(relation.variables).forEach(function(name){var el=$("#engVar-"+name),value=el?el.value.trim():"";if(value)parts.push(name+"="+value);});var er=U.tryEvaluate("eng("+relationId+(parts.length?", "+parts.join(", "):"")+")",{}, {angle:state.angle,precision:state.precision}),out={title:relation.name,display:er.display,warnings:[],details:{relation:relationId}};renderToolResult(out);await recordToolHistory(t,out);}catch(e){box.innerHTML="<strong>Error</strong><span class=\"ws-error\"></span>";$(".ws-error",box).textContent=errorMessage(e);}
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
function toolCommands(q){
  return T.REGISTRY.search(q).slice(0,12).map(function(t){return {id:"tool."+t.id,title:t.name,keywords:t.category+" "+t.aliases.join(" ")+" "+t.description,run:function(){state.selectedTool=t.id;state.toolSearch="";renderToolList();renderTool();switchView("tools");history.replaceState(null,"","#tools/"+encodeURIComponent(t.id));}};});
}
function renderCommands(q){
  q=String(q||"").trim().toLowerCase();
  var base=commands.filter(function(c){return !q||(c.title+" "+(c.keywords||"")).toLowerCase().indexOf(q)>=0;}),dynamic=toolCommands(q);
  var seen=new Set();commandMatches=base.concat(dynamic).filter(function(c){if(seen.has(c.id))return false;seen.add(c.id);return true;}).slice(0,12);
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
  $("[data-quick]").forEach(function(b){b.onclick=function(){state.selectedTool=b.dataset.quick;renderToolList();renderTool();switchView("tools");history.replaceState(null,"","#tools/"+encodeURIComponent(state.selectedTool));};});

  $("#graphPlotBtn").onclick=plotGraph;$("#graphReset").onclick=resetGraph;$("#graphExport").onclick=exportGraphPng;$("#graphPiTicks").onchange=drawGraph;
  $("#graphRoots").onclick=analyzeGraphRoots;$("#graphIntersections").onclick=analyzeGraphIntersections;$("#graphExtrema").onclick=analyzeGraphExtrema;$("#graphTangent").onclick=analyzeGraphTangent;$("#graphIntegral").onclick=analyzeGraphIntegral;
  $("#graphScatter").onclick=graphAddScatter;$("#graphRegression").onclick=graphAddRegression;$("#graphHistogram").onclick=graphAddHistogram;$("#graphBoxplot").onclick=graphAddBoxplot;$("#graphDistribution").onclick=graphAddDistribution;
  $("#graphCanvas").addEventListener("wheel",function(e){
    e.preventDefault();var rect=graphCanvas.getBoundingClientRect(),s=graphSize(),world=graphSession().viewport.screenToWorld(e.clientX-rect.left,e.clientY-rect.top,s.w,s.h),factor=Math.exp(e.deltaY*.0012);
    graphSession().setViewport(graphSession().viewport.zoomAt(world[0],world[1],factor));drawGraph();
  },{passive:false});
  $("#graphCanvas").addEventListener("pointerdown",function(e){
    graphCanvas.setPointerCapture(e.pointerId);state.graph.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(state.graph.pointers.size===1)state.graph.drag={x:e.clientX,y:e.clientY,viewport:graphSession().viewport};
    if(state.graph.pointers.size===2){
      var pts=Array.from(state.graph.pointers.values()),dx=pts[1].x-pts[0].x,dy=pts[1].y-pts[0].y;
      state.graph.pinch={distance:Math.hypot(dx,dy),cx:(pts[0].x+pts[1].x)/2,cy:(pts[0].y+pts[1].y)/2,viewport:graphSession().viewport};state.graph.drag=null;
    }
  });
  $("#graphCanvas").addEventListener("pointermove",function(e){
    var rect=graphCanvas.getBoundingClientRect(),s=graphSize(),world=graphSession().viewport.screenToWorld(e.clientX-rect.left,e.clientY-rect.top,s.w,s.h),read="x: "+M.formatNumber(world[0],7)+" · y: "+M.formatNumber(world[1],7);
    try{var selected=selectedGraphSeries(1),trace=selected.trace(world[0],graphSession().sliderEnv());if(trace&&trace.finite)read="x: "+M.formatNumber(trace.x,7)+" · "+selected.label+": "+M.formatNumber(trace.y,7);}catch(err){}
    $("#graphReadout").textContent=read;
    if(!state.graph.pointers.has(e.pointerId))return;state.graph.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(state.graph.pointers.size===1&&state.graph.drag){
      var d=state.graph.drag;graphSession().setViewport(d.viewport.panPixels(e.clientX-d.x,e.clientY-d.y,s.w,s.h));drawGraph();
    }else if(state.graph.pointers.size===2&&state.graph.pinch){
      var pts=Array.from(state.graph.pointers.values()),dx=pts[1].x-pts[0].x,dy=pts[1].y-pts[0].y,dist=Math.max(1,Math.hypot(dx,dy)),cx=(pts[0].x+pts[1].x)/2,cy=(pts[0].y+pts[1].y)/2,p=state.graph.pinch,base=p.viewport,localX=p.cx-rect.left,localY=p.cy-rect.top,anchor=base.screenToWorld(localX,localY,s.w,s.h),zoomed=base.zoomAt(anchor[0],anchor[1],p.distance/dist);
      graphSession().setViewport(zoomed.panPixels(cx-p.cx,cy-p.cy,s.w,s.h));drawGraph();
    }
  });
  function endPointer(e){
    state.graph.pointers.delete(e.pointerId);
    if(state.graph.pointers.size===0){state.graph.drag=null;state.graph.pinch=null;}
    else if(state.graph.pointers.size===1){var p=Array.from(state.graph.pointers.values())[0];state.graph.drag={x:p.x,y:p.y,viewport:graphSession().viewport};state.graph.pinch=null;}
  }
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
  setTheme(state.theme);state.graph.session=new G.GraphSession({viewport:new G.Viewport(-10,10,-10,10),env:state.env});bindEvents();renderMatrixGrid(false);renderToolList();renderTool();renderDistributionParams();populateDataControls();
  $("#graphExpressions").value="sin(x)\nx^2 / 5";plotGraph();
  try{state.history=(await dbAll("history")).sort(function(a,b){return b.time-a.time;});}catch(e){}
  await loadWorksheets();
  var initial=(location.hash||"").replace(/^#/,""),toolRoute=initial.match(/^tools\/(.+)$/);
  if(toolRoute){var decoded=decodeURIComponent(toolRoute[1]);if(T.REGISTRY.get(decoded))state.selectedTool=decoded;initial="tools";}
  switchView(VIEW_META[initial]?initial:"calculate");if(initial==="tools"){renderToolList();renderTool();history.replaceState(null,"","#tools/"+encodeURIComponent(state.selectedTool));}
  window.addEventListener("hashchange",function(){var raw=(location.hash||"").replace(/^#/,""),m=raw.match(/^tools\/(.+)$/),v=raw;if(m){var id=decodeURIComponent(m[1]);if(T.REGISTRY.get(id)){state.selectedTool=id;renderToolList();renderTool();}v="tools";}if(VIEW_META[v]&&v!==state.view)switchView(v);});
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(function(){});
}
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();state.installPrompt=e;$("#installBtn").classList.remove("hidden");});
$("#installBtn").onclick=async function(){if(!state.installPrompt)return;state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;$("#installBtn").classList.add("hidden");};

init().catch(function(e){
  console.error(e);$("#exactResult").textContent="Calc could not initialize";$("#approxResult").textContent=errorMessage(e);
});
})();