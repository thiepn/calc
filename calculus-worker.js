"use strict";
self.window=self;
importScripts("./math.js","./algebra.js","./calculus.js");

function plainError(e){
  return {code:e&&e.code||"WORKER_ERROR",message:e&&e.message||String(e),details:e&&e.details||null};
}
function plainResult(value){
  if(value===null||value===undefined||typeof value==="string"||typeof value==="number"||typeof value==="boolean")return value;
  if(Array.isArray(value))return value.map(plainResult);
  var out={};
  Object.keys(value).forEach(function(k){
    var v=value[k];
    if(typeof v!=="function"&&!(v instanceof Map)&&!(v instanceof Set)){
      if(v instanceof self.CalcMath.Rational||v instanceof self.CalcMath.Complex)out[k]={__mathValue:self.CalcMath.serializeValue(v)};
      else out[k]=plainResult(v);
    }
  });
  return out;
}

self.onmessage=function(event){
  var msg=event.data||{},id=msg.id,task=msg.task,p=msg.payload||{},C=self.CalcCalculus;
  try{
    var result;
    if(task==="numericalDerivative")result=C.numericalDerivative(p.expression,p.variable,p.x,p.options);
    else if(task==="adaptiveSimpson")result=C.adaptiveSimpson(p.expression,p.variable,p.a,p.b,p.options);
    else if(task==="bisection")result=C.bisection(p.expression,p.variable,p.a,p.b,p.options);
    else if(task==="newton")result=C.newton(p.expression,p.variable,p.x0,p.options);
    else if(task==="secant")result=C.secant(p.expression,p.variable,p.x0,p.x1,p.options);
    else if(task==="hybridRoot")result=C.hybridRoot(p.expression,p.variable,p.a,p.b,p.options);
    else throw new C.CalculusError("UNKNOWN_WORKER_TASK","Unknown numerical worker task '"+task+"'");
    self.postMessage({id:id,ok:true,result:plainResult(result)});
  }catch(e){
    self.postMessage({id:id,ok:false,error:plainError(e)});
  }
};
