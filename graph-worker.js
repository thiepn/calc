"use strict";
self.window=self;
importScripts("./math.js","./algebra.js","./calculus.js","./units.js","./linear-algebra.js","./statistics.js","./graph.js");

function reviveSeries(def){
  const G=self.CalcGraph;
  if(def.type==="function")return new G.FunctionPlot(def.source,{id:def.id,label:def.label,variable:def.variable,style:def.style,visible:def.visible});
  if(def.type==="parametric")return new G.ParametricPlot(def.xSource,def.ySource,def.tMin,def.tMax,{id:def.id,label:def.label,parameter:def.parameter,style:def.style,visible:def.visible});
  if(def.type==="polar")return new G.PolarPlot(def.rSource,def.tMin,def.tMax,{id:def.id,label:def.label,parameter:def.parameter,style:def.style,visible:def.visible});
  if(def.type==="implicit")return new G.ImplicitPlot(def.source,{id:def.id,label:def.label,style:def.style,visible:def.visible,xVar:def.xVar,yVar:def.yVar});
  throw new G.GraphUnsupportedError("Worker cannot revive series type '"+def.type+"'");
}
function err(e){return {code:e&&e.code||"WORKER_ERROR",message:e&&e.message||String(e),details:e&&e.details||null};}

self.onmessage=function(event){
  const msg=event.data||{},id=msg.id,p=msg.payload||{},G=self.CalcGraph;
  try{
    let result;
    if(msg.task==="geometry"){
      const series=reviveSeries(p.series),viewport=G.Viewport.fromJSON(p.viewport);
      result=series.geometry(viewport,p.width,p.height,p.env||{},p.options||{});
    }else if(msg.task==="roots"){
      const series=reviveSeries(p.series),viewport=G.Viewport.fromJSON(p.viewport);
      result=G.findRoots(series,viewport,p.env||{},p.options||{});
    }else if(msg.task==="implicit"){
      const series=new G.ImplicitPlot(p.source,p.options||{}),viewport=G.Viewport.fromJSON(p.viewport);
      result=series.geometry(viewport,p.width,p.height,p.env||{},p.geometryOptions||{});
    }else{
      throw new G.GraphError("UNKNOWN_WORKER_TASK","Unknown graph worker task '"+msg.task+"'");
    }
    self.postMessage({id:id,ok:true,result:result});
  }catch(e){
    self.postMessage({id:id,ok:false,error:err(e)});
  }
};
