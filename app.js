(function(){
"use strict";
const M=window.CalcMath;
const A=window.CalcAlgebra;
const C=window.CalcCalculus;
const $=function(s,r){return (r||document).querySelector(s);};
const $$=function(s,r){return Array.from((r||document).querySelectorAll(s));};
const uid=function(){return crypto.randomUUID?crypto.randomUUID():"id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);};

const VIEW_META={
  calculate:["Calculate","Exact when possible. Approximate when necessary."],
  graph:["Graph","Interactive 2D plotting and analysis."],
  matrix:["Matrix","Exact matrix arithmetic and row reduction."],
  data:["Data","Descriptive statistics and linear regression."],
  tools:["Tools","Focused calculators built on the shared math core."],
  worksheet:["Worksheet","Persistent multi-step mathematical work."],
  history:["History","Your local calculation history."]
};

const state={
  view:"calculate",angle:localStorage.getItem("calc.angle")||"RAD",precision:12,
  env:{},lastResult:null,theme:localStorage.getItem("calc.theme")||"system",
  installPrompt:null,history:[],worksheets:[],activeWorksheet:null,
  graph:{xMin:-10,xMax:10,yMin:-10,yMax:10,asts:[],lines:[],drag:null,pointers:new Map()},
  selectedTool:"percent"
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
  return symbolic||M.evaluate(raw,env,calcOptions(commit));
}
function setCalcResult(res,preview){
  $("#exactResult").textContent=res.display;
  $("#approxResult").textContent=res.approx||"";
  $("#calcStatus").textContent=preview?"Preview":(res.symbolic?"Symbolic":(res.exact?"Exact":"Approximate"));
  var graphAction=$('[data-result-action="graph"]'),saveAction=$('[data-result-action="save"]'),op=res.metadata&&res.metadata.operation;
  var graphBlocked=!!res.symbolic||["integral","nintegral","nderivative","root","limit"].indexOf(op)>=0;
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
  for(var r=0;r<rows;r++){var row=[];for(var c=0;c<cols;c++){var el=$('[data-mcell="'+r+'-'+c+'"]');row.push(el?el.value||"0":"0");}grid.push(row);}
  return M.matrixFromStrings(grid,state.env,calcOptions(false));
}
function renderMatrixGrid(preserve){
  var rows=Math.max(1,Math.min(10,parseInt($("#matrixRows").value,10)||1)),cols=Math.max(1,Math.min(10,parseInt($("#matrixCols").value,10)||1));
  $("#matrixRows").value=rows;$("#matrixCols").value=cols;
  var old={};if(preserve)$$("[data-mcell]").forEach(function(el){old[el.dataset.mcell]=el.value;});
  var grid=$("#matrixGrid");grid.innerHTML="";
  for(var r=0;r<rows;r++){
    var row=document.createElement("div");row.className="matrix-row";row.style.gridTemplateColumns="repeat("+cols+", 92px)";
    for(var c=0;c<cols;c++){
      var input=document.createElement("input");input.className="matrix-cell";input.dataset.mcell=r+"-"+c;input.setAttribute("aria-label","Row "+(r+1)+", column "+(c+1));
      input.value=old[r+"-"+c]!==undefined?old[r+"-"+c]:(r===c?"1":"0");row.appendChild(input);
    }
    grid.appendChild(row);
  }
}
function matrixHtml(A){
  var rows=M.matrixToStrings(A,state.precision),wrap=document.createElement("div");wrap.className="matrix-render";
  rows.forEach(function(vals){var r=document.createElement("div");r.className="matrix-render-row";vals.forEach(function(v){var s=document.createElement("span");s.textContent=v;r.appendChild(s);});wrap.appendChild(r);});
  return wrap;
}
function runMatrix(op){
  var box=$("#matrixResult");try{
    var A=matrixValues(),res;
    if(op==="det")res=M.determinant(A);
    else if(op==="rref")res=M.rref(A).matrix;
    else if(op==="inverse")res=M.inverse(A);
    else if(op==="transpose")res=M.transpose(A);
    else if(op==="rank")res=new M.Rational(BigInt(M.rank(A)));
    box.innerHTML="";
    if(Array.isArray(res))box.appendChild(matrixHtml(res));else box.textContent=M.formatValue(res,state.precision);
    box.classList.remove("muted");
  }catch(e){box.textContent=errorMessage(e);box.classList.add("ws-error");}
}

function parseNumericColumn(rows,index){
  var arr=[];rows.forEach(function(row){if(index>=row.length)return;var raw=String(row[index]).trim();if(!raw)return;var n=Number(raw.replace(",","."));if(Number.isFinite(n))arr.push(n);});return arr;
}
function analyzeData(){
  var box=$("#dataSummary");
  try{
    var d=M.parseDelimited($("#dataInput").value);if(!d.rows.length)throw new Error("No data rows found");
    var cols=d.headers.map(function(h,i){return {name:h,values:parseNumericColumn(d.rows,i)};}).filter(function(c){return c.values.length>0;});
    if(!cols.length)throw new Error("No numeric columns found");
    var table=document.createElement("table");table.className="summary-table";
    table.innerHTML="<thead><tr><th>Column</th><th>n</th><th>Mean</th><th>Median</th><th>SD</th><th>Min</th><th>Max</th></tr></thead>";
    var tb=document.createElement("tbody");
    cols.forEach(function(c){var st=M.stats(c.values),tr=document.createElement("tr");[c.name,st.count,M.formatNumber(st.mean),M.formatNumber(st.median),Number.isFinite(st.sdSample)?M.formatNumber(st.sdSample):"—",M.formatNumber(st.min),M.formatNumber(st.max)].forEach(function(v){var td=document.createElement("td");td.textContent=v;tr.appendChild(td);});tb.appendChild(tr);});
    table.appendChild(tb);box.innerHTML="";box.appendChild(table);
    if(cols.length>=2){
      var n=Math.min(cols[0].values.length,cols[1].values.length),x=cols[0].values.slice(0,n),y=cols[1].values.slice(0,n),reg=M.linearRegression(x,y);
      var call=document.createElement("div");call.className="stat-callout";call.textContent="Linear regression: "+cols[1].name+" = "+M.formatNumber(reg.intercept)+" + "+M.formatNumber(reg.slope)+"·"+cols[0].name+" · R² = "+M.formatNumber(reg.r2)+" · r = "+M.formatNumber(reg.correlation);box.appendChild(call);
    }
    box.classList.remove("muted");
  }catch(e){box.textContent=errorMessage(e);box.classList.add("ws-error");}
}

const tools=[
  {id:"percent",name:"Percentage",desc:"Percentage, percentage change, and reverse percentage."},
  {id:"unit",name:"Unit converter",desc:"Convert common physical and information units."},
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
    body=field("Value","uValue","number",1)+selectField("Category","uGroup",Object.keys(M.UNIT_GROUPS).concat(["temperature"]).map(function(x){return [x,x[0].toUpperCase()+x.slice(1)];}))+'<div class="field"><label>From</label><select id="uFrom"></select></div><div class="field"><label>To</label><select id="uTo"></select></div>';
  }else if(t.id==="loan")body=field("Principal","lPrincipal","number",250000)+field("Annual rate (%)","lRate","number",4.5)+field("Years","lYears","number",30)+field("Payments / year","lFreq","number",12);
  else if(t.id==="triangle")body=field("Side a","triA","number",3)+field("Side b","triB","number",4)+field("Side c","triC","number",5);
  else if(t.id==="circle")body=field("Radius","circleR","number",3);
  else if(t.id==="date")body=field("Start date","dateA","date","2026-01-01")+field("End date","dateB","date","2026-12-31");
  else if(t.id==="programmer")body=field("Value","progValue","text","FF")+selectField("Input base","progBase",[[2,"Binary"],[8,"Octal"],[10,"Decimal"],[16,"Hexadecimal"]])+selectField("Width","progWidth",[[8,"8-bit"],[16,"16-bit"],[32,"32-bit"],[64,"64-bit"]]);
  else if(t.id==="number")body=field("a","numA","text","240")+field("b","numB","text","46");
  $("#toolRunner").innerHTML=toolFrame(t,body);
  $("#toolRun").onclick=runSelectedTool;
  if(t.id==="unit"){updateUnitSelects();$("#uGroup").onchange=updateUnitSelects;}
}
function updateUnitSelects(){
  var group=$("#uGroup").value,units=group==="temperature"?["C","F","K"]:Object.keys(M.UNIT_GROUPS[group]||{});
  ["#uFrom","#uTo"].forEach(function(sel,idx){var el=$(sel);el.innerHTML="";units.forEach(function(u,i){var o=document.createElement("option");o.value=u;o.textContent=u;if((idx===0&&i===0)||(idx===1&&i===Math.min(1,units.length-1)))o.selected=true;el.appendChild(o);});});
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
      var uv=M.convertUnit($("#uValue").value,$("#uFrom").value,$("#uTo").value,$("#uGroup").value);
      text=M.formatNumber(uv)+" "+$("#uTo").value;
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
  {id:"action.newWorksheet",title:"New Worksheet",keywords:"create notebook",run:function(){newWorksheet();switchView("worksheet");}},
  {id:"algebra.solve",title:"Solve equation",keywords:"algebra equation roots quadratic",run:function(){switchView("calculate");$("#expressionInput").value="solve(x^2 - 5*x + 6 = 0, x)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.simplify",title:"Simplify expression",keywords:"algebra simplify rational expression",run:function(){switchView("calculate");$("#expressionInput").value="simplify((x^2 - 1)/(x - 1))";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.expand",title:"Expand expression",keywords:"algebra polynomial expand",run:function(){switchView("calculate");$("#expressionInput").value="expand((x + 1)^3)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.collect",title:"Collect polynomial terms",keywords:"algebra collect like terms polynomial",run:function(){switchView("calculate");$("#expressionInput").value="collect(x + 2*x^2 + x, x)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.factor",title:"Factor polynomial",keywords:"algebra polynomial factor",run:function(){switchView("calculate");$("#expressionInput").value="factor(x^2 - 5*x + 6)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.system",title:"Solve linear system",keywords:"algebra simultaneous equations system",run:function(){switchView("calculate");$("#expressionInput").value="system(x + y = 3; x - y = 1)";previewExpression();$("#expressionInput").focus();}},
  {id:"algebra.inequality",title:"Solve inequality",keywords:"algebra inequality interval",run:function(){switchView("calculate");$("#expressionInput").value="inequality(x^2 - 1 <= 0, x)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.diff",title:"Differentiate expression",keywords:"calculus derivative diff",run:function(){switchView("calculate");$("#expressionInput").value="diff(x^3 + sin(x), x)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.integrate",title:"Find antiderivative",keywords:"calculus integral integrate antiderivative",run:function(){switchView("calculate");$("#expressionInput").value="integrate(x^2 + cos(x), x)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.definite",title:"Definite integral",keywords:"calculus definite integral area",run:function(){switchView("calculate");$("#expressionInput").value="integral(x^2, x, 0, 3)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.limit",title:"Evaluate limit",keywords:"calculus limit lhopital",run:function(){switchView("calculate");$("#expressionInput").value="limit(sin(x)/x, x, 0)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.taylor",title:"Taylor polynomial",keywords:"calculus series maclaurin taylor",run:function(){switchView("calculate");$("#expressionInput").value="taylor(exp(x), x, 0, 5)";previewExpression();$("#expressionInput").focus();}},
  {id:"calculus.root",title:"Numerical root",keywords:"calculus numerical root bisection newton secant",run:function(){switchView("calculate");$("#expressionInput").value="root(cos(x)-x, x, 0, 1)";previewExpression();$("#expressionInput").focus();}},
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
  $("#analyzeDataBtn").onclick=analyzeData;$("#sampleDataBtn").onclick=function(){$("#dataInput").value="x,y\n1,3\n2,5\n3,7\n4,9\n5,11";analyzeData();};
  $("#addMathBlock").onclick=function(){addBlock("math");};$("#addTextBlock").onclick=function(){addBlock("text");};$("#newWorksheetBtn").onclick=newWorksheet;
  $("#worksheetTitle").addEventListener("input",function(){if(state.activeWorksheet){state.activeWorksheet.title=this.value||"Untitled worksheet";scheduleWorksheetSave();renderWorksheetList();}});
  $("#clearHistoryBtn").onclick=async function(){if(!confirm("Clear calculation history?"))return;state.history=[];try{await dbClear("history");}catch(e){}renderHistory();};
  window.addEventListener("resize",function(){if(state.view==="graph")drawGraph();});
}

async function init(){
  setTheme(state.theme);bindEvents();renderMatrixGrid(false);renderToolList();renderTool();
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