"use strict";
global.window=global;
require("../math.js");
const M=global.CalcMath;

let seed=0xC0FFEE;
function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed;}
function pick(a){return a[rnd()%a.length];}
function atom(){
  const n=(rnd()%41)-20;
  if(rnd()%4===0)return "("+n+"/"+((rnd()%9)+1)+")";
  if(rnd()%5===0)return String(Math.abs(n))+"%";
  return String(n);
}
function expr(depth){
  if(depth<=0||rnd()%4===0)return atom();
  const mode=rnd()%6;
  if(mode===0)return "("+expr(depth-1)+")";
  if(mode===1)return pick(["abs","sqrt","sign"])+"("+expr(depth-1)+")";
  if(mode===2)return "-("+expr(depth-1)+")";
  if(mode===3)return "("+expr(depth-1)+")^"+String((rnd()%7)-3);
  return "("+expr(depth-1)+pick(["+","-","*","/"])+expr(depth-1)+")";
}

for(let i=0;i<1500;i++){
  const source=expr(4);
  try{
    const result=M.evaluate(source,{}, {complex:true,angle:"RAD",commit:false});
    if(!["integer","rational","real","complex"].includes(result.kind))throw new Error("Unexpected successful result kind "+result.kind+" for "+source);
    if(/NaN|Infinity/.test(result.display))throw new Error("Raw non-finite display leaked for "+source+": "+result.display);
    const wire=M.serializeValue(result.value);
    const restored=M.deserializeValue(wire);
    if(M.formatValue(restored)!==M.formatValue(result.value))throw new Error("Serialization drift for "+source);
  }catch(e){
    if(!(e instanceof M.CalcError))throw new Error("Raw runtime error for "+source+": "+e.stack);
  }
}

const invalid=[
  "1+@2","((1+2)","1..2","2 3","sqrt(","1/**2","@","1e99999",
  "constructor = 1","__proto__ = 1"
];
for(const source of invalid){
  let threw=false;
  try{M.evaluate(source,{}, {commit:false});}
  catch(e){threw=true;if(!(e instanceof M.CalcError))throw new Error("Untyped error for invalid input "+source+": "+e.stack);}
  if(!threw)throw new Error("Invalid expression unexpectedly succeeded: "+source);
}

console.log("Core deterministic fuzz tests passed");