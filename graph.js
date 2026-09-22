(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
const S=global.CalcStatistics;
const LA=global.CalcLinearAlgebra;
if(!M||!A||!C||!S||!LA)throw new Error("Calc graph dependencies must load before CalcGraph");

class GraphError extends M.CalcError{
  constructor(code,message,details){super(code||"GRAPH_ERROR",message,undefined,undefined,details);}
}
class GraphDomainError extends GraphError{constructor(message,details){super("GRAPH_DOMAIN_ERROR",message,details);}}
class GraphBudgetError extends GraphError{constructor(message,details){super("GRAPH_BUDGET_EXCEEDED",message,details);}}
class GraphUnsupportedError extends GraphError{constructor(message,details){super("UNSUPPORTED_GRAPH",message,details);}}

const BUDGETS=Object.freeze({
  maxSeries:24,
  maxFunctionPoints:12000,
  maxAdaptiveDepth:14,
  maxImplicitCells:40000,
  maxContourSegments:30000,
  maxScatterPoints:100000
});

let nextSeriesId=1;
function uid(prefix){return (prefix||"series")+"-"+(nextSeriesId++);}

class Viewport{
  constructor(xMin,xMax,yMin,yMax){
    this.xMin=Number(xMin);this.xMax=Number(xMax);this.yMin=Number(yMin);this.yMax=Number(yMax);this.validate();Object.freeze(this);
  }
  validate(){
    if(![this.xMin,this.xMax,this.yMin,this.yMax].every(Number.isFinite))throw new GraphDomainError("Viewport bounds must be finite");
    if(!(this.xMax>this.xMin&&this.yMax>this.yMin))throw new GraphDomainError("Viewport bounds must have positive span");
  }
  get xSpan(){return this.xMax-this.xMin;}get ySpan(){return this.yMax-this.yMin;}
  worldToScreen(x,y,width,height){return [(x-this.xMin)/this.xSpan*width,height-(y-this.yMin)/this.ySpan*height];}
  screenToWorld(px,py,width,height){return [this.xMin+px/width*this.xSpan,this.yMax-py/height*this.ySpan];}
  zoomAt(x,y,factor){
    factor=Number(factor);if(!(factor>0&&Number.isFinite(factor)))throw new GraphDomainError("Zoom factor must be positive");
    return new Viewport(x+(this.xMin-x)*factor,x+(this.xMax-x)*factor,y+(this.yMin-y)*factor,y+(this.yMax-y)*factor);
  }
  panPixels(dx,dy,width,height){
    const wx=dx/width*this.xSpan,wy=dy/height*this.ySpan;
    return new Viewport(this.xMin-wx,this.xMax-wx,this.yMin+wy,this.yMax+wy);
  }
  toJSON(){return {xMin:this.xMin,xMax:this.xMax,yMin:this.yMin,yMax:this.yMax};}
  static fromJSON(d){return new Viewport(d.xMin,d.xMax,d.yMin,d.yMax);}
}

function niceStep(span,target){
  const raw=span/Math.max(1,target),p=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/p;
  return (n<1.5?1:n<3?2:n<7?5:10)*p;
}
function axisTicks(min,max,target,mode){
  if(mode==="pi"){
    const stepUnits=niceStep((max-min)/Math.PI,target),step=stepUnits*Math.PI,out=[];
    const first=Math.ceil(min/step)*step;
    for(let x=first;x<=max+step*1e-10;x+=step){
      const ratio=x/Math.PI,near=Math.round(ratio*12)/12;
      out.push({value:x,label:formatPi(near)});
    }
    return out;
  }
  const step=niceStep(max-min,target),out=[],first=Math.ceil(min/step)*step;
  for(let x=first;x<=max+step*1e-10;x+=step){const v=Math.abs(x)<step*1e-10?0:x;out.push({value:v,label:M.formatNumber(v,10)});}
  return out;
}
function formatPi(r){
  if(Math.abs(r)<1e-12)return "0";
  const sign=r<0?"−":"",a=Math.abs(r),den=12,num=Math.round(a*den),g=gcdInt(num,den),n=num/g,d=den/g;
  if(d===1)return sign+(n===1?"π":n+"π");
  return sign+(n===1?"π":n+"π")+"/"+d;
}
function gcdInt(a,b){a=Math.abs(a);b=Math.abs(b);while(b){const t=a%b;a=b;b=t;}return a||1;}

function envWith(base,extra){return Object.assign(Object.create(base||null),extra||{});}
function finiteEval(ast,env){
  try{const v=M.evaluateAst(ast,env,{complex:false,angle:"RAD"},0),n=M.toNumber(v);return Number.isFinite(n)?n:NaN;}catch(e){return NaN;}
}
function parseFiniteScalar(source,env){
  const r=M.evaluate(String(source),env||{}, {commit:false,complex:false,angle:"RAD"}),n=M.toNumber(r.value);
  if(!Number.isFinite(n))throw new GraphDomainError("Expected a finite scalar, got '"+source+"'");
  return n;
}
function restrictionRoots(expr,variable){
  const roots=[];
  for(const r of expr.restrictions||[]){
    if(r.relation!=="!=")continue;
    try{
      const eq=new A.Equation(r.expression,new A.SymbolicExpression(M.formatValue(r.value)));
      const ss=A.solveEquation(eq,variable,{domain:"real"});
      if(ss.type==="finite")for(const sv of ss.values){
        try{const v=M.evaluateAst(sv.expression.ast,{}, {complex:false,angle:"RAD"},0),n=M.toNumber(v);if(Number.isFinite(n))roots.push(n);}catch(e){}
      }
    }catch(e){}
  }
  return dedupeNumbers(roots,1e-10);
}
function dedupeNumbers(values,tol){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),out=[];for(const x of sorted)if(!out.length||Math.abs(x-out[out.length-1])>(tol||1e-9)*Math.max(1,Math.abs(x)))out.push(x);return out;
}

class PlotSeries{
  constructor(type,options){options=options||{};this.id=options.id||uid(type);this.type=type;this.label=options.label||this.id;this.visible=options.visible!==false;this.style=Object.assign({},options.style||{});}
  geometry(){throw new GraphUnsupportedError("Geometry not implemented for "+this.type);}
  trace(){throw new GraphUnsupportedError("Trace not implemented for "+this.type);}
  definition(){return {id:this.id,type:this.type,label:this.label,visible:this.visible,style:this.style};}
}

class FunctionPlot extends PlotSeries{
  constructor(source,options){
    options=options||{};super("function",options);this.source=String(source);this.variable=options.variable||"x";this.expression=new A.SymbolicExpression(this.source);this.ast=this.expression.ast;this.breaks=restrictionRoots(this.expression,this.variable);
  }
  evaluate(x,env){return finiteEval(this.ast,envWith(env,{[this.variable]:x}));}
  trace(x,env){const y=this.evaluate(x,env);return {seriesId:this.id,type:this.type,x:Number(x),y:y,finite:Number.isFinite(y)};}
  holes(viewport,env){
    const out=[];for(const x of this.breaks)if(x>=viewport.xMin&&x<=viewport.xMax){
      try{
        const l=C.limit(this.source,this.variable,String(x),"both");
        if(l.type==="finite"&&Number.isFinite(M.toNumber(l.value)))out.push({x:x,y:M.toNumber(l.value),open:true});
      }catch(e){}
    }return out;
  }
  geometry(viewport,width,height,env,options){
    options=Object.assign({pixelError:0.8,maxDepth:BUDGETS.maxAdaptiveDepth,coarse:Math.max(32,Math.min(220,Math.ceil(width/18)))},options||{});
    const segments=[],current=[],self=this,yScale=height/viewport.ySpan,xScale=width/viewport.xSpan;let count=0;
    const breaks=this.breaks.filter(x=>x>viewport.xMin&&x<viewport.xMax);
    function pushBreak(){if(current.length>1)segments.push(current.splice(0,current.length));else current.length=0;}
    function point(x){const y=self.evaluate(x,env);count++;if(count>BUDGETS.maxFunctionPoints)throw new GraphBudgetError("Function sampling exceeded point budget",{series:self.id});return {x:x,y:y};}
    function nearBreak(a,b){for(const x of breaks)if(x>a&&x<b)return x;return null;}
    function add(p){if(!Number.isFinite(p.y)){pushBreak();return;}if(!current.length||Math.abs(current[current.length-1].x-p.x)>1e-15)current.push(p);}
    function recurse(a,fa,b,fb,depth){
      const br=nearBreak(a,b);
      if(br!==null&&depth>0){
        const eps=Math.max(viewport.xSpan*1e-12,Math.abs(b-a)*1e-7),left=Math.max(a,br-eps),right=Math.min(b,br+eps);
        if(left>a){const fl=point(left);recurse(a,fa,left,fl,depth-1);}pushBreak();if(right<b){const fr=point(right);recurse(right,fr,b,fb,depth-1);}return;
      }
      const m=(a+b)/2,fm=point(m);
      if(!Number.isFinite(fa.y)||!Number.isFinite(fb.y)||!Number.isFinite(fm.y)){
        if(depth>0&&Math.abs(b-a)>viewport.xSpan/1e8){recurse(a,fa,m,fm,depth-1);pushBreak();recurse(m,fm,b,fb,depth-1);}else pushBreak();return;
      }
      const sxErr=Math.abs((fm.y-(fa.y+fb.y)/2)*yScale),jump=Math.abs((fb.y-fa.y)*yScale);
      const outsideOpposite=(fa.y<viewport.yMin&&fb.y>viewport.yMax)||(fa.y>viewport.yMax&&fb.y<viewport.yMin);
      const suspect=outsideOpposite&&jump>height*2;
      if(depth>0&&(sxErr>options.pixelError||suspect)){
        recurse(a,fa,m,fm,depth-1);
        if(suspect&&depth<=2)pushBreak();
        recurse(m,fm,b,fb,depth-1);
      }else{
        add(fa);
        if(suspect)pushBreak();else add(fb);
      }
    }
    const n=options.coarse,dx=viewport.xSpan/n;
    for(let i=0;i<n;i++){const a=viewport.xMin+i*dx,b=i===n-1?viewport.xMax:a+dx,fa=point(a),fb=point(b);recurse(a,fa,b,fb,options.maxDepth);}
    pushBreak();
    return {type:"polyline",seriesId:this.id,segments:segments,holes:this.holes(viewport,env),points:count,source:this.source};
  }
  definition(){return Object.assign(super.definition(),{source:this.source,variable:this.variable});}
}

class PiecewisePlot extends PlotSeries{
  constructor(pieces,options){
    super("piecewise",options);this.variable=options&&options.variable||"x";this.pieces=pieces.map((p,i)=>({expression:new A.SymbolicExpression(p.source),source:p.source,lo:p.lo===null?null:Number(p.lo),hi:p.hi===null?null:Number(p.hi),loClosed:p.loClosed!==false,hiClosed:p.hiClosed!==false,label:p.label||"piece "+(i+1)}));
  }
  trace(x,env){for(const p of this.pieces){if((p.lo===null||x>p.lo||(x===p.lo&&p.loClosed))&&(p.hi===null||x<p.hi||(x===p.hi&&p.hiClosed))){const y=finiteEval(p.expression.ast,envWith(env,{[this.variable]:x}));return {seriesId:this.id,type:this.type,x:x,y:y,finite:Number.isFinite(y)};}}return {seriesId:this.id,type:this.type,x:x,y:NaN,finite:false};}
  geometry(viewport,width,height,env,options){
    const segments=[],endpoints=[];
    for(const p of this.pieces){
      const lo=Math.max(viewport.xMin,p.lo===null?viewport.xMin:p.lo),hi=Math.min(viewport.xMax,p.hi===null?viewport.xMax:p.hi);if(!(hi>=lo))continue;
      const fp=new FunctionPlot(p.source,{variable:this.variable,id:this.id+"-piece"});
      const g=fp.geometry(new Viewport(lo===hi?lo-1e-10:lo,lo===hi?hi+1e-10:hi,viewport.yMin,viewport.yMax),Math.max(1,width*(hi-lo)/viewport.xSpan),height,env,options);
      segments.push.apply(segments,g.segments);
      if(p.lo!==null&&p.lo>=viewport.xMin&&p.lo<=viewport.xMax){const y=finiteEval(p.expression.ast,envWith(env,{[this.variable]:p.lo}));if(Number.isFinite(y))endpoints.push({x:p.lo,y:y,open:!p.loClosed});}
      if(p.hi!==null&&p.hi>=viewport.xMin&&p.hi<=viewport.xMax){const y=finiteEval(p.expression.ast,envWith(env,{[this.variable]:p.hi}));if(Number.isFinite(y))endpoints.push({x:p.hi,y:y,open:!p.hiClosed});}
    }
    return {type:"polyline",seriesId:this.id,segments:segments,endpoints:endpoints};
  }
}

PiecewisePlot.prototype.definition=function(){
  return Object.assign(PlotSeries.prototype.definition.call(this),{
    variable:this.variable,
    pieces:this.pieces.map(p=>({source:p.source,lo:p.lo,hi:p.hi,loClosed:p.loClosed,hiClosed:p.hiClosed,label:p.label}))
  });
};

class ParametricPlot extends PlotSeries{
  constructor(xSource,ySource,tMin,tMax,options){
    options=options||{};super("parametric",options);this.xSource=String(xSource);this.ySource=String(ySource);this.parameter=options.parameter||"t";this.xAst=M.parseExpression(this.xSource);this.yAst=M.parseExpression(this.ySource);this.tMin=Number(tMin);this.tMax=Number(tMax);if(!(Number.isFinite(this.tMin)&&Number.isFinite(this.tMax)&&this.tMax>this.tMin))throw new GraphDomainError("Parametric range must be finite and increasing");
  }
  evaluate(t,env){const e=envWith(env,{[this.parameter]:t});return {t:t,x:finiteEval(this.xAst,e),y:finiteEval(this.yAst,e)};}
  trace(t,env){const p=this.evaluate(Number(t),env);return Object.assign({seriesId:this.id,type:this.type,finite:Number.isFinite(p.x)&&Number.isFinite(p.y)},p);}
  geometry(viewport,width,height,env,options){
    options=Object.assign({pixelError:0.8,maxDepth:12,coarse:48},options||{});const seg=[],cur=[],self=this;let count=0;
    function screen(p){return viewport.worldToScreen(p.x,p.y,width,height);}
    function add(p){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)){if(cur.length>1)seg.push(cur.splice(0));else cur.length=0;return;}if(!cur.length||Math.abs(cur[cur.length-1].t-p.t)>1e-15)cur.push(p);}
    function evalp(t){count++;if(count>BUDGETS.maxFunctionPoints)throw new GraphBudgetError("Parametric sampling exceeded point budget");return self.evaluate(t,env);}
    function rec(a,pa,b,pb,d){
      const m=(a+b)/2,pm=evalp(m);if(![pa.x,pa.y,pb.x,pb.y,pm.x,pm.y].every(Number.isFinite)){if(d>0){rec(a,pa,m,pm,d-1);if(cur.length>1)seg.push(cur.splice(0));rec(m,pm,b,pb,d-1);}return;}
      const sa=screen(pa),sb=screen(pb),sm=screen(pm),err=Math.hypot(sm[0]-(sa[0]+sb[0])/2,sm[1]-(sa[1]+sb[1])/2);
      if(d>0&&err>options.pixelError){rec(a,pa,m,pm,d-1);rec(m,pm,b,pb,d-1);}else{add(pa);add(pb);}
    }
    const dt=(this.tMax-this.tMin)/options.coarse;
    for(let i=0;i<options.coarse;i++){const a=this.tMin+i*dt,b=i===options.coarse-1?this.tMax:a+dt;rec(a,evalp(a),b,evalp(b),options.maxDepth);}
    if(cur.length>1)seg.push(cur);
    return {type:"parametric",seriesId:this.id,segments:seg,points:count,parameter:this.parameter};
  }
  definition(){return Object.assign(super.definition(),{xSource:this.xSource,ySource:this.ySource,parameter:this.parameter,tMin:this.tMin,tMax:this.tMax});}
}

class PolarPlot extends ParametricPlot{
  constructor(rSource,tMin,tMax,options){
    options=options||{};const param=options.parameter||"theta";super("("+rSource+")*cos("+param+")","("+rSource+")*sin("+param+")",tMin,tMax,Object.assign({},options,{parameter:param}));this.type="polar";this.rSource=String(rSource);this.rAst=M.parseExpression(this.rSource);
  }
  trace(t,env){const p=super.trace(t,env),e=envWith(env,{[this.parameter]:Number(t)});p.r=finiteEval(this.rAst,e);return p;}
  definition(){const d=super.definition();d.type="polar";d.rSource=this.rSource;return d;}
}

function marchingCase(values,centerPositive){
  const bits=(values[0]>=0?1:0)|(values[1]>=0?2:0)|(values[2]>=0?4:0)|(values[3]>=0?8:0);
  const table={
    0:[],1:[[3,0]],2:[[0,1]],3:[[3,1]],4:[[1,2]],5:centerPositive?[[0,1],[2,3]]:[[3,0],[1,2]],6:[[0,2]],7:[[3,2]],
    8:[[2,3]],9:[[0,2]],10:centerPositive?[[3,0],[1,2]]:[[0,1],[2,3]],11:[[1,2]],12:[[1,3]],13:[[0,1]],14:[[3,0]],15:[]
  };return table[bits]||[];
}
function interp(p1,p2,v1,v2){const d=v1-v2,t=Math.abs(d)<1e-15?0.5:v1/d;return {x:p1.x+(p2.x-p1.x)*t,y:p1.y+(p2.y-p1.y)*t};}

class ImplicitPlot extends PlotSeries{
  constructor(source,options){options=options||{};super("implicit",options);this.source=String(source);this.xVar=options.xVar||"x";this.yVar=options.yVar||"y";this.ast=M.parseExpression(this.source);}
  value(x,y,env){return finiteEval(this.ast,envWith(env,{[this.xVar]:x,[this.yVar]:y}));}
  geometry(viewport,width,height,env,options){
    options=Object.assign({nx:Math.max(36,Math.min(180,Math.round(width/7))),ny:Math.max(28,Math.min(140,Math.round(height/7)))},options||{});
    const cells=options.nx*options.ny;if(cells>BUDGETS.maxImplicitCells)throw new GraphBudgetError("Implicit contour grid exceeds cell budget");
    const dx=viewport.xSpan/options.nx,dy=viewport.ySpan/options.ny,segments=[];let evals=0;
    const cache=new Map(),self=this;
    function val(i,j){const key=i+","+j;if(cache.has(key))return cache.get(key);const v=self.value(viewport.xMin+i*dx,viewport.yMin+j*dy,env);cache.set(key,v);evals++;return v;}
    for(let j=0;j<options.ny;j++)for(let i=0;i<options.nx;i++){
      const ps=[{x:viewport.xMin+i*dx,y:viewport.yMin+j*dy},{x:viewport.xMin+(i+1)*dx,y:viewport.yMin+j*dy},{x:viewport.xMin+(i+1)*dx,y:viewport.yMin+(j+1)*dy},{x:viewport.xMin+i*dx,y:viewport.yMin+(j+1)*dy}],
        vs=[val(i,j),val(i+1,j),val(i+1,j+1),val(i,j+1)];if(!vs.every(Number.isFinite))continue;
      const center=this.value((ps[0].x+ps[2].x)/2,(ps[0].y+ps[2].y)/2,env),pairs=marchingCase(vs,center>=0),edges=[[0,1],[1,2],[2,3],[3,0]];
      for(const pair of pairs){const e1=edges[pair[0]],e2=edges[pair[1]],a=interp(ps[e1[0]],ps[e1[1]],vs[e1[0]],vs[e1[1]]),b=interp(ps[e2[0]],ps[e2[1]],vs[e2[0]],vs[e2[1]]);segments.push([a,b]);if(segments.length>BUDGETS.maxContourSegments)throw new GraphBudgetError("Implicit contour exceeded segment budget");}
    }
    return {type:"segments",seriesId:this.id,segments:segments,evaluations:evals,source:this.source};
  }
  trace(xy,env){const x=xy.x,y=xy.y;return {seriesId:this.id,type:this.type,x:x,y:y,value:this.value(x,y,env)};}
  definition(){return Object.assign(super.definition(),{source:this.source,xVar:this.xVar,yVar:this.yVar});}
}

function splitRelation(source){
  const s=String(source);let depth=0;
  for(let i=0;i<s.length;i++){
    if(s[i]==="(")depth++;else if(s[i]===")")depth--;
    if(depth!==0)continue;
    for(const op of ["<=",">=",">","<"]){if(s.slice(i,i+op.length)===op)return {left:s.slice(0,i).trim(),op:op,right:s.slice(i+op.length).trim()};}
  }
  throw new GraphDomainError("Inequality plot requires <, <=, >, or >=");
}
class InequalityPlot extends PlotSeries{
  constructor(source,options){
    options=options||{};super("inequality",options);this.source=String(source);const r=splitRelation(source);this.op=r.op;this.left=M.parseExpression(r.left);this.right=M.parseExpression(r.right);this.boundarySource="("+r.left+")-("+r.right+")";this.boundary=new ImplicitPlot(this.boundarySource,{id:this.id+"-boundary"});
  }
  difference(x,y,env){const e=envWith(env,{x:x,y:y}),l=finiteEval(this.left,e),r=finiteEval(this.right,e);return Number.isFinite(l)&&Number.isFinite(r)?l-r:NaN;}
  contains(x,y,env){const d=this.difference(x,y,env);if(!Number.isFinite(d))return false;return this.op==="<"?d<0:this.op==="<="?d<=0:this.op===">"?d>0:d>=0;}
  geometry(viewport,width,height,env,options){
    options=Object.assign({nx:Math.max(24,Math.min(100,Math.round(width/12))),ny:Math.max(20,Math.min(80,Math.round(height/12)))},options||{});
    const dx=viewport.xSpan/options.nx,dy=viewport.ySpan/options.ny,cells=[];
    for(let j=0;j<options.ny;j++)for(let i=0;i<options.nx;i++){const x=viewport.xMin+(i+0.5)*dx,y=viewport.yMin+(j+0.5)*dy;if(this.contains(x,y,env))cells.push({x:viewport.xMin+i*dx,y:viewport.yMin+j*dy,w:dx,h:dy});}
    const boundary=this.boundary.geometry(viewport,width,height,env,options.boundary||{});
    return {type:"inequality",seriesId:this.id,cells:cells,boundary:boundary.segments,boundaryIncluded:this.op.indexOf("=")>=0};
  }
  trace(xy,env){return {seriesId:this.id,type:this.type,x:xy.x,y:xy.y,inside:this.contains(xy.x,xy.y,env),difference:this.difference(xy.x,xy.y,env)};}
  definition(){return Object.assign(super.definition(),{source:this.source});}
}

class ScatterPlot extends PlotSeries{
  constructor(model,options){super("scatter",options);if(!model||model.type!=="scatter")throw new GraphDomainError("ScatterPlot requires a Phase 6 scatter model");this.model=model;}
  geometry(viewport,width,height,env,options){if(this.model.points.length>BUDGETS.maxScatterPoints)throw new GraphBudgetError("Scatter plot exceeds point budget");return {type:"scatter",seriesId:this.id,points:this.model.points.slice(),excluded:this.model.excluded};}
  trace(point){return Object.assign({seriesId:this.id,type:this.type},point);}
}
class HistogramPlot extends PlotSeries{
  constructor(model,options){super("histogram",options);if(!model||model.type!=="histogram")throw new GraphDomainError("HistogramPlot requires a Phase 6 histogram model");this.model=model;}
  geometry(){return {type:"histogram",seriesId:this.id,bins:this.model.bins.map(b=>Object.assign({},b)),width:this.model.width,n:this.model.n};}
}
class BoxPlot extends PlotSeries{
  constructor(model,options){super("boxplot",options);if(!model||model.type!=="boxplot")throw new GraphDomainError("BoxPlot requires a Phase 6 boxplot model");this.model=model;}
  geometry(){return Object.assign({seriesId:this.id},this.model);}
}
class DistributionPlot extends PlotSeries{
  constructor(model,options){super("distribution",options);if(!model||model.type!=="distribution")throw new GraphDomainError("DistributionPlot requires a Phase 6 distribution model");this.model=model;}
  geometry(){return {type:"distribution",seriesId:this.id,discrete:this.model.discrete,points:this.model.points.map(p=>Object.assign({},p)),distribution:this.model.distribution};}
}
class VectorPlot extends PlotSeries{
  constructor(vector,origin,options){super("vector",options);if(!(vector instanceof LA.Vector)||vector.length!==2)throw new GraphDomainError("VectorPlot requires a 2D Vector");this.vector=vector;this.origin=origin||{x:0,y:0};}
  geometry(){return {type:"vector",seriesId:this.id,origin:{x:this.origin.x,y:this.origin.y},end:{x:this.origin.x+M.toNumber(this.vector.get(0)),y:this.origin.y+M.toNumber(this.vector.get(1))}};}
}

class GraphSession{
  constructor(options){options=options||{};this.viewport=options.viewport instanceof Viewport?options.viewport:new Viewport(-10,10,-10,10);this.series=[];this.markers=[];this.sliders=new Map();this.baseEnv=options.env||{};this.revision=0;}
  add(series){if(this.series.length>=BUDGETS.maxSeries)throw new GraphBudgetError("Graph series limit reached");this.series.push(series);this.revision++;return series;}
  remove(id){this.series=this.series.filter(s=>s.id!==id);this.revision++;}
  clear(){this.series=[];this.markers=[];this.revision++;}
  setViewport(v){this.viewport=v instanceof Viewport?v:Viewport.fromJSON(v);this.revision++;}
  setSlider(name,value,min,max,step){this.sliders.set(name,{name:name,value:Number(value),min:Number(min),max:Number(max),step:Number(step)||0.1});this.revision++;}
  sliderEnv(){const e=Object.create(this.baseEnv||null);this.sliders.forEach(s=>{e[s.name]=s.value;});return e;}
  setSliderValue(name,value){const s=this.sliders.get(name);if(!s)throw new GraphDomainError("Unknown graph slider '"+name+"'");s.value=Math.max(s.min,Math.min(s.max,Number(value)));this.revision++;}
  geometry(width,height,options){const env=this.sliderEnv();return this.series.filter(s=>s.visible).map(s=>s.geometry(this.viewport,width,height,env,options));}
  serialize(){return {viewport:this.viewport.toJSON(),series:this.series.map(s=>s.definition()),markers:this.markers.slice(),sliders:Array.from(this.sliders.values()).map(s=>Object.assign({},s))};}
}

function rootCandidates(plot,viewport,env,options){
  options=Object.assign({samples:320,residual:1e-8},options||{});const roots=[],dx=viewport.xSpan/options.samples;let prevX=viewport.xMin,prevY=plot.evaluate(prevX,env);
  for(let i=1;i<=options.samples;i++){
    const x=i===options.samples?viewport.xMax:viewport.xMin+i*dx,y=plot.evaluate(x,env);
    if(Number.isFinite(prevY)&&Number.isFinite(y)){
      if(Math.abs(prevY)<=options.residual)roots.push(prevX);
      if(Math.sign(prevY)!==Math.sign(y)){try{roots.push(C.hybridRoot(plot.source,plot.variable,prevX,x,{absTol:1e-12,relTol:1e-10,env:env}).root);}catch(e){}}
    }
    prevX=x;prevY=y;
  }
  // Repeated/even-multiplicity roots: locate stationary points with certified derivative.
  try{
    const d=C.differentiate(plot.source,plot.variable,1),dp=new FunctionPlot(d.toString(),{variable:plot.variable}),crit=rootCandidatesSimple(dp,viewport,env,Math.min(220,options.samples));
    for(const x of crit){const y=plot.evaluate(x,env);if(Number.isFinite(y)&&Math.abs(y)<=options.residual*Math.max(1,Math.abs(x)))roots.push(x);}
  }catch(e){}
  return dedupeNumbers(roots,1e-8);
}
function rootCandidatesSimple(plot,viewport,env,samples){
  const roots=[],dx=viewport.xSpan/samples;let x0=viewport.xMin,y0=plot.evaluate(x0,env);
  for(let i=1;i<=samples;i++){const x1=i===samples?viewport.xMax:viewport.xMin+i*dx,y1=plot.evaluate(x1,env);if(Number.isFinite(y0)&&Number.isFinite(y1)&&Math.sign(y0)!==Math.sign(y1)){try{roots.push(C.hybridRoot(plot.source,plot.variable,x0,x1,{env:env}).root);}catch(e){}}x0=x1;y0=y1;}return dedupeNumbers(roots,1e-8);
}
function findRoots(plot,viewport,env,options){if(!(plot instanceof FunctionPlot))throw new GraphUnsupportedError("Root analysis currently requires FunctionPlot");return rootCandidates(plot,viewport,env,options).map(x=>({x:x,y:plot.evaluate(x,env),kind:"root"}));}
function findIntersections(a,b,viewport,env,options){
  if(!(a instanceof FunctionPlot)||!(b instanceof FunctionPlot))throw new GraphUnsupportedError("Intersection analysis requires FunctionPlots");
  const diff=new FunctionPlot("("+a.source+")-("+b.source+")",{variable:a.variable}),roots=findRoots(diff,viewport,env,options);
  return roots.map(r=>({x:r.x,y:a.evaluate(r.x,env),kind:"intersection",series:[a.id,b.id]}));
}
function findExtrema(plot,viewport,env,options){
  if(!(plot instanceof FunctionPlot))throw new GraphUnsupportedError("Extrema analysis requires FunctionPlot");
  const d=C.differentiate(plot.source,plot.variable,1),dp=new FunctionPlot(d.toString(),{variable:plot.variable}),crit=findRoots(dp,viewport,env,options),second=C.differentiate(plot.source,plot.variable,2),out=[];
  for(const r of crit){let kind="stationary";try{const v=finiteEval(second.ast,envWith(env,{[plot.variable]:r.x}));if(v>1e-9)kind="minimum";else if(v<-1e-9)kind="maximum";}catch(e){}out.push({x:r.x,y:plot.evaluate(r.x,env),kind:kind});}
  return out;
}
function tangentAt(plot,x,env){
  if(!(plot instanceof FunctionPlot))throw new GraphUnsupportedError("Tangent analysis requires FunctionPlot");x=Number(x);const y=plot.evaluate(x,env);if(!Number.isFinite(y))throw new GraphDomainError("Function is not finite at tangent point");
  const d=C.differentiate(plot.source,plot.variable,1),m=finiteEval(d.ast,envWith(env,{[plot.variable]:x}));if(!Number.isFinite(m))throw new GraphDomainError("Derivative is not finite at tangent point");
  return {x:x,y:y,slope:m,source:M.formatNumber(y,15)+" + ("+M.formatNumber(m,15)+")*("+plot.variable+" - ("+M.formatNumber(x,15)+"))",kind:"tangent"};
}
function integralBetween(plot,a,b,options){if(!(plot instanceof FunctionPlot))throw new GraphUnsupportedError("Integral analysis requires FunctionPlot");return C.definiteIntegral(plot.source,plot.variable,String(a),String(b),options);}
function traceSeries(series,input,env){return series.trace(input,env);}

function splitTopLevelText(text,separator){
  const out=[];let depth=0,start=0;
  for(let i=0;i<text.length;i++){if(text[i]==="(")depth++;else if(text[i]===")")depth--;else if(text[i]===separator&&depth===0){out.push(text.slice(start,i).trim());start=i+1;}}
  out.push(text.slice(start).trim());return out.filter(Boolean);
}
function parsePiecewiseBody(body,env){
  return splitTopLevelText(body,"|").map(function(part){
    const a=splitTopLevelText(part,";");if(a.length<3||a.length>4)throw new GraphDomainError("Each piecewise part uses expression; lower; upper; optional endpoint flags");
    const lo=/^-inf(?:inity)?$/i.test(a[1])?null:parseFiniteScalar(a[1],env),hi=/^\+?inf(?:inity)?$/i.test(a[2])?null:parseFiniteScalar(a[2],env),flags=(a[3]||"[)").trim();
    if(!/^[[(][\]) ]$/.test(flags.replace(/\s/g,""))&&["[]","[)","(]","()"].indexOf(flags.replace(/\s/g,""))<0)throw new GraphDomainError("Piecewise endpoint flags must be [], [), (], or ()");
    const f=flags.replace(/\s/g,"");return {source:a[0],lo:lo,hi:hi,loClosed:f[0]==="[",hiClosed:f[1]==="]"};
  });
}

function parseGraphLine(line,options){
  options=options||{};line=String(line).trim();if(!line)return null;
  let m=line.match(/^piecewise\((.*)\)$/);
  if(m)return new PiecewisePlot(parsePiecewiseBody(m[1],options.env||{}),{variable:"x",label:line});
  m=line.match(/^parametric\((.*);(.*);\s*([A-Za-z_]\w*)\s*;\s*([^;]+)\s*;\s*([^;]+)\)$/);
  if(m)return new ParametricPlot(m[1].trim(),m[2].trim(),parseFiniteScalar(m[4],options.env),parseFiniteScalar(m[5],options.env),{parameter:m[3],label:line});
  m=line.match(/^polar\((.*);\s*([A-Za-z_]\w*)\s*;\s*([^;]+)\s*;\s*([^;]+)\)$/);
  if(m)return new PolarPlot(m[1].trim(),parseFiniteScalar(m[3],options.env),parseFiniteScalar(m[4],options.env),{parameter:m[2],label:line});
  m=line.match(/^implicit\((.*)\)$/);if(m)return new ImplicitPlot(m[1].trim(),{label:line});
  m=line.match(/^ineq\((.*)\)$/);if(m)return new InequalityPlot(m[1].trim(),{label:line});
  const fn=line.replace(/^\s*[A-Za-z_]\w*\s*\(x\)\s*=\s*/,"");return new FunctionPlot(fn,{label:line});
}
function parseGraphText(text,options){
  options=options||{};const session=new GraphSession(options),errors=[];
  String(text).split(/\r?\n/).map(s=>s.trim()).filter(Boolean).forEach((line,i)=>{
    try{
      const sm=line.match(/^slider\(\s*([A-Za-z_]\w*)\s*;\s*([^;]+)\s*;\s*([^;]+)\s*;\s*([^;]+)(?:\s*;\s*([^;]+))?\s*\)$/);
      if(sm){
        const value=parseFiniteScalar(sm[2],options.env),min=parseFiniteScalar(sm[3],options.env),max=parseFiniteScalar(sm[4],options.env),step=sm[5]?parseFiniteScalar(sm[5],options.env):(max-min)/100;
        if(!(max>min))throw new GraphDomainError("Slider max must exceed min");
        session.setSlider(sm[1],value,min,max,step);return;
      }
      session.add(parseGraphLine(line,options));
    }catch(e){errors.push({line:i+1,source:line,error:e});}
  });
  return {session:session,errors:errors};
}

class GraphWorkerClient{
  constructor(url){this.url=url||"./graph-worker.js";this.worker=null;this.seq=0;this.pending=new Map();}
  ensure(){
    if(this.worker)return this.worker;if(typeof Worker==="undefined")throw new GraphError("WORKER_UNAVAILABLE","Graph worker unavailable");
    const self=this;this.worker=new Worker(this.url);this.worker.onmessage=e=>{const m=e.data||{},p=self.pending.get(m.id);if(!p)return;self.pending.delete(m.id);m.ok?p.resolve(m.result):p.reject(new GraphError(m.error&&m.error.code||"WORKER_ERROR",m.error&&m.error.message||"Graph worker failed",m.error&&m.error.details));};
    this.worker.onerror=e=>{const er=new GraphError("WORKER_ERROR",e&&e.message||"Graph worker failed");self.pending.forEach(p=>p.reject(er));self.pending.clear();if(self.worker){self.worker.terminate();self.worker=null;}};
    return this.worker;
  }
  run(task,payload){const w=this.ensure(),id=++this.seq,self=this;return new Promise((resolve,reject)=>{self.pending.set(id,{resolve:resolve,reject:reject});w.postMessage({id:id,task:task,payload:payload});});}
  cancelAll(){if(this.worker){this.worker.terminate();this.worker=null;}this.pending.forEach(p=>p.reject(new GraphError("CANCELLED","Graph task cancelled")));this.pending.clear();}
}

global.CalcGraph={
  VERSION:"1.0.0-graph-v2",BUDGETS:BUDGETS,
  GraphError:GraphError,GraphDomainError:GraphDomainError,GraphBudgetError:GraphBudgetError,GraphUnsupportedError:GraphUnsupportedError,
  Viewport:Viewport,PlotSeries:PlotSeries,FunctionPlot:FunctionPlot,PiecewisePlot:PiecewisePlot,ParametricPlot:ParametricPlot,PolarPlot:PolarPlot,ImplicitPlot:ImplicitPlot,InequalityPlot:InequalityPlot,
  ScatterPlot:ScatterPlot,HistogramPlot:HistogramPlot,BoxPlot:BoxPlot,DistributionPlot:DistributionPlot,VectorPlot:VectorPlot,GraphSession:GraphSession,
  niceStep:niceStep,axisTicks:axisTicks,formatPi:formatPi,
  findRoots:findRoots,findIntersections:findIntersections,findExtrema:findExtrema,tangentAt:tangentAt,integralBetween:integralBetween,traceSeries:traceSeries,
  parseGraphLine:parseGraphLine,parseGraphText:parseGraphText,GraphWorkerClient:GraphWorkerClient
};
})(window);