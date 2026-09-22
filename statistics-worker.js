"use strict";
self.window=self;
importScripts("./math.js","./algebra.js","./linear-algebra.js","./statistics.js");

function err(e){return {code:e&&e.code||"WORKER_ERROR",message:e&&e.message||String(e),details:e&&e.details||null};}

self.onmessage=function(event){
  const msg=event.data||{},id=msg.id,task=msg.task,p=msg.payload||{},S=self.CalcStatistics;
  try{
    let result;
    if(task==="describeDataset"){
      const ds=S.Dataset.fromJSON(p.dataset),out={};
      ds.columns.forEach(c=>{if(c.type==="numeric")out[c.name]=S.describe(c);});
      result=out;
    }else if(task==="regression"){
      result=S.fitRegression(S.Dataset.fromJSON(p.dataset),p.response,p.predictors,p.options||{});
    }else if(task==="histogram"){
      result=S.histogramModel(p.values,p.options||{});
    }else if(task==="correlationMatrix"){
      const ds=S.Dataset.fromJSON(p.dataset),m=S.correlationMatrix(ds,p.columns);
      result={type:"matrix",data:m.data};
    }else{
      throw new S.StatisticsError("UNKNOWN_WORKER_TASK","Unknown statistics worker task '"+task+"'");
    }
    self.postMessage({id:id,ok:true,result:result});
  }catch(e){
    self.postMessage({id:id,ok:false,error:err(e)});
  }
};
