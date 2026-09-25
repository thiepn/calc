(function(global){
"use strict";

const M=global.CalcMath;
if(!M)throw new Error("CalcMath must load before CalcDiscrete");

const LIMITS=Object.freeze({
  combinatorialN:10000,
  stirlingN:300,
  bellN:200,
  partitionN:10000,
  recurrenceOrder:64,
  recurrenceIndex:10000,
  recurrenceSequence:2000,
  truthVariables:8,
  powerSetSize:12,
  cartesianPairs:10000,
  relationSize:250,
  graphVertices:2000,
  graphEdges:20000,
  exactColorVertices:12
});

class DiscreteMathError extends M.CalcError{
  constructor(code,message,details){super(code||"DISCRETE_MATH_ERROR",message,undefined,undefined,details);}
}
class DiscreteComplexityError extends DiscreteMathError{
  constructor(message,details){super("DISCRETE_COMPLEXITY_LIMIT",message,details);}
}
class DiscreteGraphError extends DiscreteMathError{
  constructor(code,message,details){super(code||"GRAPH_ERROR",message,details);}
}

function commandResult(display,kind,details){
  details=details||{};
  return {
    value:details.value===undefined?null:details.value,
    display:String(display),approx:details.approx||"",exact:details.exact!==false,
    kind:kind||"discrete-mathematics",symbolic:false,
    metadata:Object.assign({discreteKind:kind||"discrete-mathematics",exact:details.exact!==false,u7:true},details.metadata||{})
  };
}
function integerResult(value,kind,metadata,display){
  value=BigInt(value);
  return commandResult(display===undefined?value.toString():display,kind,{value:new M.Rational(value,1n),metadata:Object.assign({integer:value.toString()},metadata||{})});
}
function splitTopLevel(source,delimiter){
  source=String(source);var out=[],start=0,depth=0,quote=null;
  for(var i=0;i<source.length;i++){
    var ch=source[i];
    if(quote){if(ch===quote&&source[i-1]!=="\\")quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==="("||ch==="["||ch==="{")depth++;
    else if(ch===")"||ch==="]"||ch==="}")depth--;
    else if(ch===delimiter&&depth===0){out.push(source.slice(start,i).trim());start=i+1;}
  }
  out.push(source.slice(start).trim());return out;
}
function splitArgs(source){return splitTopLevel(source,",").filter(function(x){return x.length>0;});}
function parseCall(raw,name){var re=new RegExp("^"+name+"\\s*\\((.*)\\)$","is"),m=String(raw).trim().match(re);return m?m[1]:null;}
function parseSemicolon(raw,name){var body=parseCall(raw,name);return body===null?null:splitTopLevel(body,";");}
function parseInteger(source,label){
  var s=String(source).trim().replace(/_/g,"");
  if(!/^[+-]?\d+$/.test(s))throw new DiscreteMathError("INTEGER_REQUIRED",(label||"Value")+" must be an integer",{source:String(source)});
  try{return BigInt(s);}catch(e){throw new DiscreteMathError("INTEGER_REQUIRED",(label||"Value")+" is not a valid integer");}
}
function toBoundedInt(value,min,max,label){
  value=typeof value==="bigint"?value:parseInteger(value,label);
  var lo=BigInt(min),hi=BigInt(max);
  if(value<lo||value>hi)throw new DiscreteComplexityError((label||"Value")+" must be between "+min+" and "+max,{value:value.toString()});
  return Number(value);
}
function parseIntegerList(source,label){
  var parts=splitArgs(source);if(!parts.length)throw new DiscreteMathError("DATA_REQUIRED",(label||"List")+" must not be empty");
  return parts.map(function(x,i){return parseInteger(x,(label||"List")+" item "+(i+1));});
}
function absBig(n){return n<0n?-n:n;}
function gcdBig(a,b){a=absBig(a);b=absBig(b);while(b){var t=a%b;a=b;b=t;}return a;}
function mod(a,m){if(m<=0n)throw new DiscreteMathError("MODULUS_REQUIRED","Modulus must be positive");a%=m;return a<0n?a+m:a;}
function powBig(base,exp){
  if(exp<0n)throw new DiscreteMathError("NONNEGATIVE_REQUIRED","Exponent must be nonnegative");
  var r=1n,b=BigInt(base),e=BigInt(exp);while(e){if(e&1n)r*=b;e>>=1n;if(e)b*=b;}return r;
}
function formatBigList(values){return "["+values.map(function(x){return BigInt(x).toString();}).join(", ")+"]";}

/* Exact combinatorics --------------------------------------------------- */
function chooseBig(n,k){
  var nn=toBoundedInt(n,0,LIMITS.combinatorialN,"n"),kk=toBoundedInt(k,0,LIMITS.combinatorialN,"k");
  if(kk>nn)return 0n;kk=Math.min(kk,nn-kk);var r=1n;
  for(var i=1;i<=kk;i++)r=r*BigInt(nn-kk+i)/BigInt(i);return r;
}
function permutationBig(n,k){
  var nn=toBoundedInt(n,0,LIMITS.combinatorialN,"n"),kk=toBoundedInt(k,0,LIMITS.combinatorialN,"k");
  if(kk>nn)return 0n;var r=1n;for(var i=0;i<kk;i++)r*=BigInt(nn-i);return r;
}
function multinomialBig(n,parts){
  var nn=toBoundedInt(n,0,LIMITS.combinatorialN,"n"),sum=0,r=1n,remaining=nn;
  parts.forEach(function(p,i){var q=toBoundedInt(p,0,LIMITS.combinatorialN,"part "+(i+1));sum+=q;if(sum>nn)throw new DiscreteMathError("PARTITION_SUM","Multinomial parts cannot exceed n");r*=chooseBig(BigInt(remaining),BigInt(q));remaining-=q;});
  if(sum!==nn)throw new DiscreteMathError("PARTITION_SUM","Multinomial parts must sum to n",{sum:sum,n:nn});return r;
}
function catalanBig(n){var nn=toBoundedInt(n,0,Math.floor(LIMITS.combinatorialN/2),"n");return chooseBig(BigInt(2*nn),BigInt(nn))/BigInt(nn+1);}
function stirlingSecondBig(n,k){
  var nn=toBoundedInt(n,0,LIMITS.stirlingN,"n"),kk=toBoundedInt(k,0,LIMITS.stirlingN,"k");if(kk>nn)return 0n;
  var dp=Array(kk+1).fill(0n);dp[0]=1n;
  for(var i=1;i<=nn;i++){for(var j=Math.min(i,kk);j>=1;j--)dp[j]=dp[j-1]+BigInt(j)*dp[j];dp[0]=0n;}
  return dp[kk];
}
function stirlingFirstUnsignedBig(n,k){
  var nn=toBoundedInt(n,0,LIMITS.stirlingN,"n"),kk=toBoundedInt(k,0,LIMITS.stirlingN,"k");if(kk>nn)return 0n;
  var dp=Array(kk+1).fill(0n);dp[0]=1n;
  for(var i=1;i<=nn;i++){for(var j=Math.min(i,kk);j>=1;j--)dp[j]=dp[j-1]+BigInt(i-1)*dp[j];dp[0]=0n;}
  return dp[kk];
}
function bellBig(n){
  var nn=toBoundedInt(n,0,LIMITS.bellN,"n"),row=[1n];
  for(var i=1;i<=nn;i++){var next=[row[row.length-1]];for(var j=1;j<=i;j++)next[j]=next[j-1]+row[j-1];row=next;}
  return row[0];
}
function derangementBig(n){
  var nn=toBoundedInt(n,0,LIMITS.combinatorialN,"n");if(nn===0)return 1n