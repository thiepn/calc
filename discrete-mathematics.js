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
  var nn=toBoundedInt(n,0,LIMITS.combinatorialN,"n");if(nn===0)return 1n;if(nn===1)return 0n;var a=1n,b=0n;
  for(var i=2;i<=nn;i++){var c=BigInt(i-1)*(a+b);a=b;b=c;}return b;
}
function partitionCountBig(n){
  var nn=toBoundedInt(n,0,LIMITS.partitionN,"n"),p=Array(nn+1).fill(0n);p[0]=1n;
  for(var i=1;i<=nn;i++){
    var total=0n;
    for(var k=1;;k++){
      var g1=k*(3*k-1)/2;if(g1>i)break;var sign=(k%2?1n:-1n);total+=sign*p[i-g1];
      var g2=k*(3*k+1)/2;if(g2<=i)total+=sign*p[i-g2];
    }
    p[i]=total;
  }
  return p[nn];
}
function starsAndBars(objects,boxes,positive){
  var n=toBoundedInt(objects,0,LIMITS.combinatorialN,"objects"),k=toBoundedInt(boxes,1,LIMITS.combinatorialN,"boxes");
  if(positive){if(n<k)return 0n;return chooseBig(BigInt(n-1),BigInt(k-1));}
  if(n+k-1>LIMITS.combinatorialN)throw new DiscreteComplexityError("objects + boxes - 1 exceeds the binomial safety limit");
  return chooseBig(BigInt(n+k-1),BigInt(k-1));
}
function pigeonholeMinimum(items,boxes){var n=parseInteger(items,"items"),k=parseInteger(boxes,"boxes");if(n<0n||k<=0n)throw new DiscreteMathError("DOMAIN_ERROR","Pigeonhole inputs require items >= 0 and boxes > 0");return (n+k-1n)/k;}
function cayleyTreesBig(n){var nn=toBoundedInt(n,0,LIMITS.combinatorialN,"n");if(nn===0)return 0n;if(nn===1||nn===2)return 1n;return powBig(BigInt(nn),BigInt(nn-2));}
function fibonacciBig(n){
  var nn=toBoundedInt(n,0,100000,"n");
  function fd(k){if(k===0)return [0n,1n];var q=fd(Math.floor(k/2)),a=q[0],b=q[1],c=a*(2n*b-a),d=a*a+b*b;return k%2?[d,c+d]:[c,d];}
  return fd(nn)[0];
}

/* Modular arithmetic --------------------------------------------------- */
function extendedGcd(a,b){
  a=BigInt(a);b=BigInt(b);var aa=absBig(a),bb=absBig(b),oldR=aa,r=bb,oldS=1n,s=0n,oldT=0n,t=1n;
  while(r!==0n){var q=oldR/r,tmp=oldR-q*r;oldR=r;r=tmp;tmp=oldS-q*s;oldS=s;s=tmp;tmp=oldT-q*t;oldT=t;t=tmp;}
  if(a<0n)oldS=-oldS;if(b<0n)oldT=-oldT;return {gcd:oldR,x:oldS,y:oldT};
}
function modularInverse(a,m){m=BigInt(m);if(m<=0n)throw new DiscreteMathError("MODULUS_REQUIRED","Modulus must be positive");var e=extendedGcd(BigInt(a),m);if(e.gcd!==1n)throw new DiscreteMathError("NO_MODULAR_INVERSE","Modular inverse exists only when gcd(a,m)=1",{gcd:e.gcd.toString()});return mod(e.x,m);}
function modularPower(a,e,m){a=BigInt(a);e=BigInt(e);m=BigInt(m);if(e<0n)throw new DiscreteMathError("NONNEGATIVE_REQUIRED","Modular exponent must be nonnegative");if(m<=0n)throw new DiscreteMathError("MODULUS_REQUIRED","Modulus must be positive");var r=1n%m,b=mod(a,m);while(e){if(e&1n)r=r*b%m;e>>=1n;if(e)b=b*b%m;}return r;}
function crt(congruences){
  if(!congruences.length)throw new DiscreteMathError("DATA_REQUIRED","CRT needs at least one congruence");
  var x=mod(congruences[0][0],congruences[0][1]),m=congruences[0][1];if(m<=0n)throw new DiscreteMathError("MODULUS_REQUIRED","CRT moduli must be positive");
  for(var i=1;i<congruences.length;i++){
    var b=congruences[i][0],n=congruences[i][1];if(n<=0n)throw new DiscreteMathError("MODULUS_REQUIRED","CRT moduli must be positive");b=mod(b,n);
    var g=gcdBig(m,n),delta=b-x;if(delta%g!==0n)throw new DiscreteMathError("INCONSISTENT_CONGRUENCES","Congruences have no simultaneous solution",{leftModulus:m.toString(),rightModulus:n.toString()});
    var mr=m/g,nr=n/g,t=mod((delta/g)*modularInverse(mod(mr,nr),nr),nr),l=m*nr;x=mod(x+m*t,l);m=l;
  }
  return {residue:x,modulus:m};
}
function solveLinearCongruence(a,b,m){
  a=BigInt(a);b=BigInt(b);m=BigInt(m);if(m<=0n)throw new DiscreteMathError("MODULUS_REQUIRED","Modulus must be positive");var g=gcdBig(a,m);
  if(b%g!==0n)throw new DiscreteMathError("NO_CONGRUENCE_SOLUTION","Linear congruence has no solution",{gcd:g.toString()});
  var ar=a/g,br=b/g,mr=m/g,base=mr===1n?0n:mod(modularInverse(mod(ar,mr),mr)*br,mr);
  return {base:base,reducedModulus:mr,solutionCount:g,originalModulus:m};
}

/* Finite sets ----------------------------------------------------------- */
function normalizeAtom(atom){
  atom=String(atom).trim();if(!atom)throw new DiscreteMathError("EMPTY_ELEMENT","Set elements must not be empty");
  if((atom[0]==='"'&&atom[atom.length-1]==='"')||(atom[0]==="'"&&atom[atom.length-1]==="'"))atom=atom.slice(1,-1);
  if(!atom)throw new DiscreteMathError("EMPTY_ELEMENT","Set elements must not be empty");return atom;
}
function parseSet(source){
  source=String(source).trim();if(source[0]==="{"&&source[source.length-1]==="}")source=source.slice(1,-1);if(!source.trim())return [];
  var seen=new Set(),out=[];splitArgs(source).forEach(function(x){var a=normalizeAtom(x);if(!seen.has(a)){seen.add(a);out.push(a);}});return out;
}
function setUnion(a,b){var seen=new Set(a),out=a.slice();b.forEach(function(x){if(!seen.has(x)){seen.add(x);out.push(x);}});return out;}
function setIntersection(a,b){var bs=new Set(b);return a.filter(function(x){return bs.has(x);});}
function setDifference(a,b){var bs=new Set(b);return a.filter(function(x){return !bs.has(x);});}
function setSymmetricDifference(a,b){return setUnion(setDifference(a,b),setDifference(b,a));}
function cartesianProduct(a,b){if(a.length*b.length>LIMITS.cartesianPairs)throw new DiscreteComplexityError("Cartesian product exceeds "+LIMITS.cartesianPairs+" pairs");var out=[];a.forEach(function(x){b.forEach(function(y){out.push([x,y]);});});return out;}
function powerSet(a){if(a.length>LIMITS.powerSetSize)throw new DiscreteComplexityError("Explicit powerset is limited to "+LIMITS.powerSetSize+" elements");var out=[[]];a.forEach(function(x){var n=out.length;for(var i=0;i<n;i++)out.push(out[i].concat([x]));});return out;}
function formatSet(a){return "{"+a.join(", ")+"}";}
function formatPairs(a,separator){separator=separator||",";return "{"+a.map(function(p){return "("+p[0]+separator+p[1]+")";}).join(", ")+"}";}

/* Linear recurrences ---------------------------------------------------- */
function validateRecurrence(coefficients,initials){
  if(!coefficients.length||coefficients.length!==initials.length)throw new DiscreteMathError("RECURRENCE_SHAPE","Coefficient and initial-term lists must hav