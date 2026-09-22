"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../units.js");
require("../linear-algebra.js");
require("../statistics.js");
require("../graph.js");

const M=global.CalcMath;
const S=global.CalcStatistics;
const LA=global.CalcLinearAlgebra;
const G=global.CalcGraph;

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,t,m){if(Math.abs(a-b)>t)throw new Error((m||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,m){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}

const vp=new G.Viewport(-10,10,-5,5);
for(const p of [[0,0],[-10,-5],[10,5],[3.25,-1.75]]){
  const s=vp.worldToScreen(p[0],p[1],800,400),w=vp.screenToWorld(s[0],s[1],800,400);
  approx(w[0],p[0],1e-12,"world-screen x");
  approx(w[1],p[1],1e-12,"world-screen y");
}
const zoom=vp.zoomAt(0,0,0.5);
approx(zoom.xSpan,10,1e-12,"zoom x span");
approx(zoom.ySpan,5,1e-12,"zoom y span");
const pan=vp.panPixels(80,-40,800,400);
approx(pan.xMin,-12,1e-12,"pan x");
approx(pan.yMin,-6,1e-12,"pan y");

const ticks=G.axisTicks(-10,10,10,"numeric");
assert(ticks.some(t=>t.value===0),"numeric ticks include zero");
const pit=G.axisTicks(-Math.PI,Math.PI,4,"pi");
assert(pit.some(t=>t.label==="π")&&pit.some(t=>t.label==="−π"),"pi tick labels");

const parabola=new G.FunctionPlot("x^2",{label:"x²"});
const geo=parabola.geometry(new G.Viewport(-2,2,-1,5),800,500,{});
assert(geo.segments.length===1,"continuous parabola one segment");
assert(geo.points>30,"adaptive function samples");
const tr=parabola.trace(1.5,{});
approx(tr.y,2.25,1e-12,"trace evaluates canonical expression");

const pole=new G.FunctionPlot("1/x");
const poleGeo=pole.geometry(new G.Viewport(-2,2,-10,10),900,500,{});
assert(poleGeo.segments.length>=2,"pole splits graph");
for(const seg of poleGeo.segments){
  const xs=seg.map(p=>p.x);
  assert(!(Math.min.apply(null,xs)<0&&Math.max.apply(null,xs)>0),"no polyline crosses x=0 pole");
}

const removable=new G.FunctionPlot("(x^2-1)/(x-1)");
const remGeo=removable.geometry(new G.Viewport(-2,3,-2,5),900,500,{});
assert(remGeo.holes.some(h=>Math.abs(h.x-1)<1e-10&&Math.abs(h.y-2)<1e-10&&h.open),"removable discontinuity hole at (1,2)");

const piece=new G.PiecewisePlot([
  {source:"-x",lo:null,hi:0,loClosed:false,hiClosed:false},
  {source:"x",lo:0,hi:null,loClosed:true,hiClosed:false}
],{variable:"x"});
const pg=piece.geometry(new G.Viewport(-2,2,-1,3),800,400,{});
assert(pg.segments.length>=2,"piecewise segments");
assert(pg.endpoints.some(e=>e.x===0&&e.open===true),"piecewise open endpoint");
assert(pg.endpoints.some(e=>e.x===0&&e.open===false),"piecewise closed endpoint");

const param=new G.ParametricPlot("cos(t)","sin(t)",0,2*Math.PI,{parameter:"t"});
const paramGeo=param.geometry(new G.Viewport(-1.5,1.5,-1.5,1.5),600,600,{});
assert(paramGeo.segments.length===1,"circle parametric connected");
const first=paramGeo.segments[0][0],last=paramGeo.segments[0][paramGeo.segments[0].length-1];
approx(Math.hypot(first.x-last.x,first.y-last.y),0,2e-6,"parametric closure");
const ptr=param.trace(Math.PI/2,{});
approx(ptr.x,0,1e-12,"parametric trace x");approx(ptr.y,1,1e-12,"parametric trace y");

const polar=new G.PolarPlot("1",0,2*Math.PI,{parameter:"theta"});
const polarTrace=polar.trace(Math.PI,{});
approx(polarTrace.r,1,1e-12,"polar radius trace");
approx(polarTrace.x,-1,1e-12,"polar x");

const implicit=new G.ImplicitPlot("x^2+y^2-1");
const ig=implicit.geometry(new G.Viewport(-1.5,1.5,-1.5,1.5),600,600,{}, {nx:80,ny:80});
assert(ig.segments.length>50,"implicit circle contour produced");
for(const seg of ig.segments.slice(0,100)){
  for(const p of seg)assert(Math.abs(p.x*p.x+p.y*p.y-1)<0.03,"implicit point near circle");
}

const ineq=new G.InequalityPlot("y <= x^2");
assert(ineq.contains(0,-1,{}),"inequality inside");
assert(!ineq.contains(0,1,{}),"inequality outside");
const ing=ineq.geometry(new G.Viewport(-2,2,-2,4),400,400,{}, {nx:30,ny:30,boundary:{nx:40,ny:40}});
assert(ing.cells.length>0&&ing.boundary.length>0,"inequality fill and boundary");
assert(ing.boundaryIncluded,"<= boundary included");

const roots=G.findRoots(new G.FunctionPlot("x^2-2"),new G.Viewport(-3,3,-2,8),{});
eq(roots.length,2,"two certified roots");
approx(roots[0].x,-Math.SQRT2,1e-8,"negative sqrt2 root");
approx(roots[1].x,Math.SQRT2,1e-8,"positive sqrt2 root");

const repeated=G.findRoots(new G.FunctionPlot("x^2"),new G.Viewport(-2,2,-1,4),{});
assert(repeated.some(r=>Math.abs(r.x)<1e-8),"even-multiplicity root found");

const inter=G.findIntersections(new G.FunctionPlot("x^2"),new G.FunctionPlot("1"),new G.Viewport(-2,2,-1,4),{});
eq(inter.length,2,"two intersections");
approx(inter[0].y,1,1e-8,"intersection y");

const extrema=G.findExtrema(new G.FunctionPlot("x^2"),new G.Viewport(-2,2,-1,4),{});
assert(extrema.some(e=>e.kind==="minimum"&&Math.abs(e.x)<1e-8&&Math.abs(e.y)<1e-8),"parabola minimum");

const tangent=G.tangentAt(new G.FunctionPlot("x^2"),2,{});
approx(tangent.x,2,1e-12,"tangent x");
approx(tangent.y,4,1e-12,"tangent y");
approx(tangent.slope,4,1e-12,"tangent slope");
const tangentPlot=new G.FunctionPlot(tangent.source);
approx(tangentPlot.evaluate(3,{}),8,1e-10,"tangent expression");

const integral=G.integralBetween(new G.FunctionPlot("x^2"),0,3);
eq(M.formatValue(integral.value),"9","graph integral uses calculus engine");
assert(integral.exact,"graph integral exact when calculus is exact");

// Sliders/environment consistency.
const session=new G.GraphSession({viewport:new G.Viewport(-3,3,-2,10),env:{}});
const family=session.add(new G.FunctionPlot("a*x^2-1"));
session.setSlider("a",2,0.5,4,0.1);
approx(family.evaluate(2,session.sliderEnv()),7,1e-12,"slider environment used by plot");
const familyRoots=G.findRoots(family,session.viewport,session.sliderEnv());
approx(familyRoots[0].x,-1/Math.sqrt(2),1e-8,"slider environment used by root analysis");
session.setSliderValue("a",1);
approx(family.evaluate(2,session.sliderEnv()),3,1e-12,"slider update");

// Parsing graph text.
let parsed=G.parseGraphText("sin(x)\nparametric(cos(t); sin(t); t; 0; 2*pi)\npolar(1+cos(theta); theta; 0; 2*pi)\nimplicit(x^2+y^2-1)\nineq(y<=x^2)",{env:{}});
eq(parsed.errors.length,0,"graph text parser no errors");
eq(parsed.session.series.length,5,"graph text parser series count");
eq(parsed.session.series[1].type,"parametric","parametric parser");
eq(parsed.session.series[2].type,"polar","polar parser");
eq(parsed.session.series[3].type,"implicit","implicit parser");
eq(parsed.session.series[4].type,"inequality","inequality parser");

const parsedAdvanced=G.parseGraphText("slider(a;1;-2;2;0.1)\npiecewise(-x;-inf;0;() | x;0;inf;[))\na*x",{env:{}});
eq(parsedAdvanced.errors.length,0,"slider and piecewise syntax");
eq(parsedAdvanced.session.sliders.get("a").value,1,"slider parsed value");
eq(parsedAdvanced.session.series[0].type,"piecewise","piecewise parsed type");
approx(parsedAdvanced.session.series[1].evaluate(2,parsedAdvanced.session.sliderEnv()),2,1e-12,"slider feeds parsed function");
const pwTraceLeft=parsedAdvanced.session.series[0].trace(-2,{});
const pwTraceZero=parsedAdvanced.session.series[0].trace(0,{});
approx(pwTraceLeft.y,2,1e-12,"piecewise left branch");
approx(pwTraceZero.y,0,1e-12,"piecewise closed zero branch");

parsed=G.parseGraphText("sin(x)\nparametric(bad)",{env:{}});
eq(parsed.session.series.length,1,"invalid graph line quarantined");
eq(parsed.errors.length,1,"invalid graph line error");

// Phase 6 model consumption is exact/model-driven.
const ds=new S.Dataset([
  new S.DataColumn("x",[1,2,3,4]),
  new S.DataColumn("y",[2,4,6,8])
],["r1","r2","r3","r4"]);
const sm=S.scatterModel(ds,"x","y"),sp=new G.ScatterPlot(sm),sg=sp.geometry();
eq(sg.points.length,4,"scatter geometry count");
eq(sg.points[0].rowId,"r1","scatter row ID preserved");

const hm=S.histogramModel([1,2,3,4,5,6],{bins:3}),hp=new G.HistogramPlot(hm),hg=hp.geometry();
eq(JSON.stringify(hg.bins),JSON.stringify(hm.bins),"histogram consumes Phase 6 bins unchanged");

const bm=S.boxPlotModel([1,2,3,4,100]),bp=new G.BoxPlot(bm),bg=bp.geometry();
eq(bg.q1,bm.q1,"box plot consumes Phase 6 quartile");
eq(JSON.stringify(bg.outliers),JSON.stringify(bm.outliers),"box plot consumes Phase 6 outliers");

const dm=S.distributionPlotModel(new S.Binomial(4,0.5)),dp=new G.DistributionPlot(dm),dg=dp.geometry();
eq(JSON.stringify(dg.points),JSON.stringify(dm.points),"distribution plot consumes Phase 6 model unchanged");

// Vector visualization.
const vg=new G.VectorPlot(new LA.Vector([3,4]),{x:1,y:2}).geometry();
eq(vg.end.x,4,"vector plot endpoint x");eq(vg.end.y,6,"vector plot endpoint y");

// Session serialization retains definitions, viewport and sliders.
session.markers.push({x:0,y:-1,kind:"vertex"});
const serialized=session.serialize();
eq(serialized.series.length,1,"session series serialization");
eq(serialized.sliders[0].name,"a","session slider serialization");
eq(serialized.markers[0].kind,"vertex","session marker serialization");

// Budget/error behavior.
throwsCode(()=>new G.Viewport(1,1,-1,1),"GRAPH_DOMAIN_ERROR","invalid viewport");
const crowded=new G.GraphSession();for(let i=0;i<G.BUDGETS.maxSeries;i++)crowded.add(new G.FunctionPlot(String(i)));
throwsCode(()=>crowded.add(new G.FunctionPlot("x")),"GRAPH_BUDGET_EXCEEDED","series budget");

console.log("Graphing V2 certification tests passed");
