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
  if(!coefficients.length||coefficients.length!==initials.length)throw new DiscreteMathError("RECURRENCE_SHAPE","Coefficient and initial-term lists must have the same nonzero length");
  if(coefficients.length>LIMITS.recurrenceOrder)throw new DiscreteComplexityError("Recurrence order exceeds "+LIMITS.recurrenceOrder);
}
function linearRecurrenceTerm(coefficients,initials,n){
  validateRecurrence(coefficients,initials);var nn=toBoundedInt(n,0,LIMITS.recurrenceIndex,"n");if(nn<initials.length)return initials[nn];var k=coefficients.length,window=initials.slice();
  for(var index=k;index<=nn;index++){var next=0n;for(var j=0;j<k;j++)next+=coefficients[j]*window[k-1-j];window.shift();window.push(next);}return window[k-1];
}
function linearRecurrenceSequence(coefficients,initials,count){
  validateRecurrence(coefficients,initials);var c=toBoundedInt(count,0,LIMITS.recurrenceSequence,"count"),out=initials.slice(0,c),k=coefficients.length;if(c<=k)return out;
  while(out.length<c){var next=0n;for(var j=0;j<k;j++)next+=coefficients[j]*out[out.length-1-j];out.push(next);}return out;
}
function recurrenceGeneratingFunction(coefficients,initials){
  validateRecurrence(coefficients,initials);var k=coefficients.length,num=[];
  for(var j=0;j<k;j++){var v=initials[j];for(var i=1;i<=j;i++)v-=coefficients[i-1]*initials[j-i];num.push(v);}
  var den=[1n].concat(coefficients.map(function(c){return -c;}));return {numerator:num,denominator:den};
}
function formatPolynomial(coeffs,variable){
  variable=variable||"x";var parts=[];
  coeffs.forEach(function(c,i){if(c===0n)return;var neg=c<0n,a=absBig(c),term;if(i===0)term=a.toString();else term=(a===1n?"":a.toString()+"*")+variable+(i===1?"":"^"+i);parts.push({neg:neg,term:term});});
  if(!parts.length)return "0";var s=(parts[0].neg?"-":"")+parts[0].term;for(var i=1;i<parts.length;i++)s+=(parts[i].neg?" - ":" + ")+parts[i].term;return s;
}

/* Propositional logic --------------------------------------------------- */
function tokenizeLogic(source){
  source=String(source);var out=[],i=0;
  while(i<source.length){
    if(/\s/.test(source[i])){i++;continue;}
    var rest=source.slice(i),op=null;
    [["<=>","IFF"],["<->","IFF"],["=>","IMP"],["->","IMP"],["&&","AND"],["||","OR"]].some(function(pair){if(rest.startsWith(pair[0])){op=pair;return true;}return false;});
    if(op){out.push({type:op[1],text:op[0]});i+=op[0].length;continue;}
    var ch=source[i];if(ch==="("){out.push({type:"LP",text:ch});i++;continue;}if(ch===")"){out.push({type:"RP",text:ch});i++;continue;}
    if(ch==="!"||ch==="~"){out.push({type:"NOT",text:ch});i++;continue;}if(ch==="&"){out.push({type:"AND",text:ch});i++;continue;}if(ch==="|"){out.push({type:"OR",text:ch});i++;continue;}if(ch==="^"){out.push({type:"XOR",text:ch});i++;continue;}
    var m=rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);if(m){var word=m[0],low=word.toLowerCase(),type=({and:"AND",or:"OR",not:"NOT",xor:"XOR"})[low];if(type)out.push({type:type,text:word});else if(low==="true"||word==="T")out.push({type:"CONST",value:true,text:word});else if(low==="false"||word==="F")out.push({type:"CONST",value:false,text:word});else out.push({type:"VAR",name:word,text:word});i+=word.length;continue;}
    if(ch==="1"||ch==="0"){out.push({type:"CONST",value:ch==="1",text:ch});i++;continue;}
    throw new DiscreteMathError("LOGIC_PARSE_ERROR","Unexpected logic token near '"+rest.slice(0,12)+"'",{offset:i});
  }
  out.push({type:"EOF",text:""});return out;
}
function parseLogic(source){
  var tokens=tokenizeLogic(source),i=0;function peek(t){return tokens[i].type===t;}function take(t){if(!peek(t))throw new DiscreteMathError("LOGIC_PARSE_ERROR","Expected "+t+" but found '"+tokens[i].text+"'");return tokens[i++];}
  function primary(){if(peek("CONST")){var t=take("CONST");return {type:"const",value:t.value};}if(peek("VAR")){var v=take("VAR");return {type:"var",name:v.name};}if(peek("LP")){take("LP");var e=iff();take("RP");return e;}throw new DiscreteMathError("LOGIC_PARSE_ERROR","Expected proposition near '"+tokens[i].text+"'");}
  function unary(){if(peek("NOT")){take("NOT");return {type:"not",child:unary()};}return primary();}
  function and(){var n=unary();while(peek("AND")){take("AND");n={type:"and",left:n,right:unary()};}return n;}
  function xor(){var n=and();while(peek("XOR")){take("XOR");n={type:"xor",left:n,right:and()};}return n;}
  function or(){var n=xor();while(peek("OR")){take("OR");n={type:"or",left:n,right:xor()};}return n;}
  function imp(){var n=or();if(peek("IMP")){take("IMP");n={type:"imp",left:n,right:imp()};}return n;}
  function iff(){var n=imp();while(peek("IFF")){take("IFF");n={type:"iff",left:n,right:imp()};}return n;}
  var ast=iff();if(!peek("EOF"))throw new DiscreteMathError("LOGIC_PARSE_ERROR","Unexpected trailing token '"+tokens[i].text+"'");return ast;
}
function logicVariables(ast,set){set=set||new Set();if(ast.type==="var")set.add(ast.name);if(ast.child)logicVariables(ast.child,set);if(ast.left){logicVariables(ast.left,set);logicVariables(ast.right,set);}return Array.from(set).sort();}
function evaluateLogic(ast,env){switch(ast.type){case"const":return ast.value;case"var":return !!env[ast.name];case"not":return !evaluateLogic(ast.child,env);case"and":return evaluateLogic(ast.left,env)&&evaluateLogic(ast.right,env);case"or":return evaluateLogic(ast.left,env)||evaluateLogic(ast.right,env);case"xor":return evaluateLogic(ast.left,env)!==evaluateLogic(ast.right,env);case"imp":return !evaluateLogic(ast.left,env)||evaluateLogic(ast.right,env);case"iff":return evaluateLogic(ast.left,env)===evaluateLogic(ast.right,env);default:throw new DiscreteMathError("LOGIC_EVAL_ERROR","Unknown logic AST node");}}
function truthTable(source){
  var ast=parseLogic(source),vars=logicVariables(ast);if(vars.length>LIMITS.truthVariables)throw new DiscreteComplexityError("Truth tables are limited to "+LIMITS.truthVariables+" variables");
  var rows=[],total=1<<vars.length,trueCount=0;
  for(var mask=0;mask<total;mask++){var env={};vars.forEach(function(v,j){env[v]=!!(mask&(1<<(vars.length-j-1)));});var value=evaluateLogic(ast,env);if(value)trueCount++;rows.push({assignment:env,value:value});}
  return {source:String(source),ast:ast,variables:vars,rows:rows,trueCount:trueCount,falseCount:total-trueCount,classification:trueCount===total?"tautology":(trueCount===0?"contradiction":"contingency")};
}
function logicEquivalent(a,b){
  var aa=parseLogic(a),bb=parseLogic(b),vars=Array.from(new Set(logicVariables(aa).concat(logicVariables(bb)))).sort();if(vars.length>LIMITS.truthVariables)throw new DiscreteComplexityError("Equivalence checking is limited to "+LIMITS.truthVariables+" variables");var total=1<<vars.length;
  for(var mask=0;mask<total;mask++){var env={};vars.forEach(function(v,j){env[v]=!!(mask&(1<<(vars.length-j-1)));});var av=evaluateLogic(aa,env),bv=evaluateLogic(bb,env);if(av!==bv)return {equivalent:false,variables:vars,counterexample:env,left:av,right:bv};}
  return {equivalent:true,variables:vars,counterexample:null};
}
function canonicalDNF(source){var t=truthTable(source),terms=t.rows.filter(function(r){return r.value;}).map(function(r){return "("+t.variables.map(function(v){return r.assignment[v]?v:"!"+v;}).join(" & ")+")";});return {form:terms.length?terms.join(" | "):"F",truth:t};}
function canonicalCNF(source){var t=truthTable(source),clauses=t.rows.filter(function(r){return !r.value;}).map(function(r){return "("+t.variables.map(function(v){return r.assignment[v]?"!"+v:v;}).join(" | ")+")";});return {form:clauses.length?clauses.join(" & "):"T",truth:t};}

/* Relations and posets ------------------------------------------------- */
function relationPairKey(a,b){return a+"\u0000"+b;}
function parseRelationPairs(universe,source){
  var allowed=new Set(universe),pairs=[],seen=new Set();source=String(source).trim();if(!source)return pairs;
  splitArgs(source).forEach(function(item){var idx=item.indexOf(">");if(idx<1||idx===item.length-1)throw new DiscreteMathError("RELATION_PARSE_ERROR","Relation pairs use a>b syntax",{pair:item});var a=normalizeAtom(item.slice(0,idx)),b=normalizeAtom(item.slice(idx+1));if(!allowed.has(a)||!allowed.has(b))throw new DiscreteMathError("RELATION_OUTSIDE_UNIVERSE","Relation endpoint is outside the universe",{pair:[a,b]});var key=relationPairKey(a,b);if(!seen.has(key)){seen.add(key);pairs.push([a,b]);}});return pairs;
}
function relationSet(pairs){var s=new Set();pairs.forEach(function(p){s.add(relationPairKey(p[0],p[1]));});return s;}
function analyzeRelation(universe,pairs){
  if(universe.length>LIMITS.relationSize)throw new DiscreteComplexityError("Relation analysis is limited to "+LIMITS.relationSize+" universe elements");var R=relationSet(pairs),reflexive=true,irreflexive=true,symmetric=true,antisymmetric=true,transitive=true,total=true;
  universe.forEach(function(a){if(!R.has(relationPairKey(a,a)))reflexive=false;else irreflexive=false;});
  pairs.forEach(function(p){var a=p[0],b=p[1];if(!R.has(relationPairKey(b,a)))symmetric=false;if(a!==b&&R.has(relationPairKey(b,a)))antisymmetric=false;});
  for(var i=0;i<universe.length;i++)for(var j=0;j<universe.length;j++){if(i!==j&&!R.has(relationPairKey(universe[i],universe[j]))&&!R.has(relationPairKey(universe[j],universe[i])))total=false;}
  outer:for(var i=0;i<universe.length;i++)for(var j=0;j<universe.length;j++)if(R.has(relationPairKey(universe[i],universe[j])))for(var k=0;k<universe.length;k++)if(R.has(relationPairKey(universe[j],universe[k]))&&!R.has(relationPairKey(universe[i],universe[k]))){transitive=false;break outer;}
  return {reflexive:reflexive,irreflexive:irreflexive,symmetric:symmetric,antisymmetric:antisymmetric,asymmetric:irreflexive&&antisymmetric,transitive:transitive,total:total,equivalence:reflexive&&symmetric&&transitive,partialOrder:reflexive&&antisymmetric&&transitive,strictPartialOrder:irreflexive&&transitive};
}
function relationClosure(universe,pairs,type){
  type=String(type).trim().toLowerCase();if(["reflexive","symmetric","transitive","equivalence"].indexOf(type)<0)throw new DiscreteMathError("RELATION_CLOSURE_TYPE","Closure type must be reflexive, symmetric, transitive, or equivalence");
  var R=relationSet(pairs);function add(a,b){R.add(relationPairKey(a,b));}
  if(type==="reflexive"||type==="equivalence")universe.forEach(function(a){add(a,a);});
  if(type==="symmetric"||type==="equivalence")Array.from(R).forEach(function(key){var p=key.split("\u0000");add(p[1],p[0]);});
  if(type==="transitive"||type==="equivalence")for(var k=0;k<universe.length;k++)for(var i=0;i<universe.length;i++)if(R.has(relationPairKey(universe[i],universe[k])))for(var j=0;j<universe.length;j++)if(R.has(relationPairKey(universe[k],universe[j])))add(universe[i],universe[j]);
  var out=[];universe.forEach(function(a){universe.forEach(function(b){if(R.has(relationPairKey(a,b)))out.push([a,b]);});});return out;
}
function equivalenceClasses(universe,pairs){var a=analyzeRelation(universe,pairs);if(!a.equivalence)throw new DiscreteMathError("NOT_EQUIVALENCE_RELATION","Equivalence classes require an equivalence relation",a);var R=relationSet(pairs),used=new Set(),classes=[];universe.forEach(function(x){if(used.has(x))return;var c=universe.filter(function(y){return R.has(relationPairKey(x,y));});c.forEach(function(y){used.add(y);});classes.push(c);});return classes;}
function hasseCover(universe,pairs){var a=analyzeRelation(universe,pairs);if(!a.partialOrder)throw new DiscreteMathError("NOT_PARTIAL_ORDER","Hasse cover requires a partial order",a);var R=relationSet(pairs),out=[];universe.forEach(function(x){universe.forEach(function(y){if(x===y||!R.has(relationPairKey(x,y)))return;var covered=true;for(var i=0;i<universe.length;i++){var z=universe[i];if(z!==x&&z!==y&&R.has(relationPairKey(x,z))&&R.has(relationPairKey(z,y))){covered=false;break;}}if(covered)out.push([x,y]);});});return out;}

/* Finite graph algorithms ---------------------------------------------- */
function parseVertices(source){var v=parseSet(source);if(!v.length)throw new DiscreteGraphError("GRAPH_VERTICES_REQUIRED","Graph needs at least one vertex");if(v.length>LIMITS.graphVertices)throw new DiscreteComplexityError("Graph vertex count exceeds "+LIMITS.graphVertices);return v;}
function parseGraphEdges(vertices,source,directed){
  var allowed=new Set(vertices),items=String(source).trim()?splitArgs(source):[],edges=[],seen=new Set();if(items.length>LIMITS.graphEdges)throw new DiscreteComplexityError("Graph edge count exceeds "+LIMITS.graphEdges);
  items.forEach(function(item,index){var colon=item.lastIndexOf(":"),edgeText=colon>=0?item.slice(0,colon):item,weight=colon>=0?parseInteger(item.slice(colon+1),"edge weight"):1n,sep=directed?">":"-",at=edgeText.indexOf(sep);if(at<1||at===edgeText.length-1)throw new DiscreteGraphError("GRAPH_EDGE_PARSE","Edges use "+(directed?"u>v":"u-v")+" or "+(directed?"u>v:w":"u-v:w")+" syntax",{edge:item});var u=normalizeAtom(edgeText.slice(0,at)),v=normalizeAtom(edgeText.slice(at+1));if(!allowed.has(u)||!allowed.has(v))throw new DiscreteGraphError("GRAPH_UNKNOWN_VERTEX","Edge endpoint is outside the vertex set",{edge:[u,v]});var key=directed?relationPairKey(u,v):(u<v?relationPairKey(u,v):relationPairKey(v,u));if(seen.has(key))throw new DiscreteGraphError("GRAPH_DUPLICATE_EDGE","Duplicate edges are not supported",{edge:[u,v]});seen.add(key);edges.push({id:index,u:u,v:v,w:weight});});return edges;
}
function makeGraph(vertices,edgeSource,directed){vertices=Array.isArray(vertices)?vertices.slice():parseVertices(vertices);var edges=Array.isArray(edgeSource)?edgeSource:parseGraphEdges(vertices,edgeSource,!!directed),adj=new Map(),radj=new Map();vertices.forEach(function(v){adj.set(v,[]);radj.set(v,[]);});edges.forEach(function(e){adj.get(e.u).push({to:e.v,w:e.w,id:e.id});radj.get(e.v).push({to:e.u,w:e.w,id:e.id});if(!directed&&e.u!==e.v){adj.get(e.v).push({to:e.u,w:e.w,id:e.id});radj.get(e.u).push({to:e.v,w:e.w,id:e.id});}else if(!directed&&e.u===e.v){adj.get(e.u).push({to:e.u,w:e.w,id:e.id});radj.get(e.u).push({to:e.u,w:e.w,id:e.id});}});return {vertices:vertices,edges:edges,directed:!!directed,adj:adj,radj:radj};}
function weakComponents(g){var seen=new Set(),out=[];g.vertices.forEach(function(start){if(seen.has(start))return;var q=[start],c=[];seen.add(start);for(var h=0;h<q.length;h++){var u=q[h];c.push(u);var ns=g.directed?g.adj.get(u).concat(g.radj.get(u)):g.adj.get(u);ns.forEach(function(e){if(!seen.has(e.to)){seen.add(e.to);q.push(e.to);}});}out.push(c);});return out;}
function stronglyConnectedComponents(g){if(!g.directed)return weakComponents(g);var seen=new Set(),order=[];function dfs(u){seen.add(u);g.adj.get(u).forEach(function(e){if(!seen.has(e.to))dfs(e.to);});order.push(u);}g.vertices.forEach(function(v){if(!seen.has(v))dfs(v);});seen.clear();var out=[];function rev(u,c){seen.add(u);c.push(u);g.radj.get(u).forEach(function(e){if(!seen.has(e.to))rev(e.to,c);});}for(var i=order.length-1;i>=0;i--)if(!seen.has(order[i])){var c=[];rev(order[i],c);out.push(c);}return out;}
function graphHasCycle(g){
  if(g.directed){var state=new Map();g.vertices.forEach(function(v){state.set(v,0);});function dfs(u){state.set(u,1);var list=g.adj.get(u);for(var i=0;i<list.length;i++){var v=list[i].to;if(state.get(v)===1)return true;if(state.get(v)===0&&dfs(v))return true;}state.set(u,2);return false;}for(var i=0;i<g.vertices.length;i++)if(state.get(g.vertices[i])===0&&dfs(g.vertices[i]))return true;return false;}
  var seen=new Set();function dfsU(u,parentEdge){seen.add(u);var list=g.adj.get(u);for(var i=0;i<list.length;i++){var e=list[i];if(e.id===parentEdge)continue;if(seen.has(e.to))return true;if(dfsU(e.to,e.id))return true;}return false;}for(var i=0;i<g.vertices.length;i++)if(!seen.has(g.vertices[i])&&dfsU(g.vertices[i],-1))return true;return false;
}
function bipartiteCheck(g){if(g.directed)throw new DiscreteGraphError("UNDIRECTED_REQUIRED","Bipartite checking requires an undirected graph");var color=new Map();for(var s=0;s<g.vertices.length;s++){var start=g.vertices[s];if(color.has(start))continue;color.set(start,0);var q=[start];for(var h=0;h<q.length;h++){var u=q[h];var list=g.adj.get(u);for(var i=0;i<list.length;i++){var v=list[i].to;if(v===u)return {bipartite:false,coloring:null};if(!color.has(v)){color.set(v,1-color.get(u));q.push(v);}else if(color.get(v)===color.get(u))return {bipartite:false,coloring:null};}}}var obj={};g.vertices.forEach(function(v){obj[v]=color.get(v);});return {bipartite:true,coloring:obj};}
function graphDegrees(g){var out={};g.vertices.forEach(function(v){if(g.directed)out[v]={inDegree:g.radj.get(v).length,outDegree:g.adj.get(v).length};else{var d=0;g.edges.forEach(function(e){if(e.u===v&&e.v===v)d+=2;else if(e.u===v||e.v===v)d++;});out[v]=d;}});return out;}
function graphInfo(vertices,edgeSource,directed){var g=makeGraph(vertices,edgeSource,directed),components=weakComponents(g),cycle=graphHasCycle(g),degrees=graphDegrees(g),info={vertexCount:g.vertices.length,edgeCount:g.edges.length,directed:g.directed,components:components,degrees:degrees,hasCycle:cycle};if(g.directed){var scc=stronglyConnectedComponents(g);info.weaklyConnected=components.length===1;info.stronglyConnected=scc.length===1;info.stronglyConnectedComponents=scc;info.dag=!cycle;}else{var bp=bipartiteCheck(g);info.connected=components.length===1;info.bipartite=bp.bipartite;info.bipartiteColoring=bp.coloring;info.tree=info.connected&&!cycle&&g.edges.length===g.vertices.length-1;info.forest=!cycle;}return info;}
function minHeap(){var a=[];function less(x,y){return x.d<y.d;}return {push:function(x){a.push(x);var i=a.length-1;while(i>0){var p=(i-1)>>1;if(!less(a[i],a[p]))break;var t=a[i];a[i]=a[p];a[p]=t;i=p;}},pop:function(){if(!a.length)return null;var r=a[0],last=a.pop();if(a.length){a[0]=last;var i=0;for(;;){var l=2*i+1,rn=l+1,b=i;if(l<a.length&&less(a[l],a[b]))b=l;if(rn<a.length&&less(a[rn],a[b]))b=rn;if(b===i)break;var t=a[i];a[i]=a[b];a[b]=t;i=b;}}return r;},get size(){return a.length;}};}
function shortestPath(vertices,edgeSource,start,target,directed){
  var g=makeGraph(vertices,edgeSource,directed);if(g.vertices.indexOf(start)<0||g.vertices.indexOf(target)<0)throw new DiscreteGraphError("GRAPH_UNKNOWN_VERTEX","Shortest-path endpoints must be vertices");g.edges.forEach(function(e){if(e.w<0n)throw new DiscreteGraphError("NEGATIVE_EDGE","Dijkstra requires nonnegative edge weights");});
  var dist=new Map(),prev=new Map(),pq=minHeap();dist.set(start,0n);pq.push({v:start,d:0n});while(pq.size){var cur=pq.pop();if(dist.get(cur.v)!==cur.d)continue;if(cur.v===target)break;g.adj.get(cur.v).forEach(function(e){var nd=cur.d+e.w;if(!dist.has(e.to)||nd<dist.get(e.to)){dist.set(e.to,nd);prev.set(e.to,cur.v);pq.push({v:e.to,d:nd});}});}
  if(!dist.has(target))return {reachable:false,distance:null,path:[]};var path=[],v=target;while(v!==undefined){path.push(v);if(v===start)break;v=prev.get(v);}path.reverse();return {reachable:true,distance:dist.get(target),path:path};
}
function minimumSpanningTree(vertices,edgeSource){
  var g=makeGraph(vertices,edgeSource,false),parent=new Map(),rank=new Map();g.vertices.forEach(function(v){parent.set(v,v);rank.set(v,0);});function find(x){var p=parent.get(x);if(p!==x){p=find(p);parent.set(x,p);}return p;}function union(a,b){a=find(a);b=find(b);if(a===b)return false;var ra=rank.get(a),rb=rank.get(b);if(ra<rb){var t=a;a=b;b=t;}parent.set(b,a);if(ra===rb)rank.set(a,ra+1);return true;}
  var edges=g.edges.slice().sort(function(a,b){return a.w<b.w?-1:(a.w>b.w?1:a.id-b.id);}),tree=[],total=0n;edges.forEach(function(e){if(e.u!==e.v&&union(e.u,e.v)){tree.push(e);total+=e.w;}});if(tree.length!==g.vertices.length-1)throw new DiscreteGraphError("GRAPH_DISCONNECTED","Minimum spanning tree requires a connected graph",{components:weakComponents(g)});return {weight:total,edges:tree};
}
function topologicalSort(vertices,edgeSource){
  var g=makeGraph(vertices,edgeSource,true),indeg=new Map();g.vertices.forEach(function(v){indeg.set(v,0);});g.edges.forEach(function(e){indeg.set(e.v,indeg.get(e.v)+1);});var q=g.vertices.filter(function(v){return indeg.get(v)===0;}),out=[];for(var h=0;h<q.length;h++){var u=q[h];out.push(u);g.adj.get(u).forEach(function(e){var d=indeg.get(e.to)-1;indeg.set(e.to,d);if(d===0)q.push(e.to);});}if(out.length!==g.vertices.length)throw new DiscreteGraphError("GRAPH_CYCLE","Topological ordering exists only for DAGs");return out;
}
function eulerTrail(vertices,edgeSource,directed){
  var g=makeGraph(vertices,edgeSource,directed),start=null,type;
  if(!g.edges.length)return {type:"circuit",path:[g.vertices[0]]};
  if(directed){var deg=graphDegrees(g),plus=[],minus=[],bad=[];g.vertices.forEach(function(v){var d=deg[v].outDegree-deg[v].inDegree;if(d===1)plus.push(v);else if(d===-1)minus.push(v);else if(d!==0)bad.push(v);});if(bad.length||!((plus.length===0&&minus.length===0)||(plus.length===1&&minus.length===1)))throw new DiscreteGraphError("NO_EULER_TRAIL","Directed graph does not satisfy Euler degree conditions");var active=g.vertices.filter(function(v){return deg[v].inDegree+deg[v].outDegree>0;}),weak=weakComponents(g).filter(function(c){return c.some(function(v){return active.indexOf(v)>=0;});});if(weak.length!==1)throw new DiscreteGraphError("NO_EULER_TRAIL","Non-isolated vertices must be weakly connected");start=plus[0]||active[0];type=plus.length?"trail":"circuit";
  }else{var deg=graphDegrees(g),odd=g.vertices.filter(function(v){return deg[v]%2===1;}),active=g.vertices.filter(function(v){return deg[v]>0;}),components=weakComponents(g).filter(function(c){return c.some(function(v){return active.indexOf(v)>=0;});});if(components.length!==1||!(odd.length===0||odd.length===2))throw new DiscreteGraphError("NO_EULER_TRAIL","Undirected graph needs connected non-isolated vertices and 0 or 2 odd degrees");start=odd[0]||active[0];type=odd.length?"trail":"circuit";}
  var local=new Map();g.vertices.forEach(function(v){local.set(v,g.adj.get(v).slice());});var used=new Set(),stack=[start],path=[];while(stack.length){var u=stack[stack.length-1],list=local.get(u),edge=null;while(list.length&&!edge){var cand=list.pop();if(!used.has(cand.id))edge=cand;}if(edge){used.add(edge.id);stack.push(edge.to);}else path.push(stack.pop());}path.reverse();if(used.size!==g.edges.length)throw new DiscreteGraphError("NO_EULER_TRAIL","Could not traverse every edge");return {type:type,path:path};
}
function chromaticNumber(vertices,edgeSource){
  var g=makeGraph(vertices,edgeSource,false),n=g.vertices.length;if(n>LIMITS.exactColorVertices)throw new DiscreteComplexityError("Exact chromatic number is limited to "+LIMITS.exactColorVertices+" vertices");if(g.edges.some(function(e){return e.u===e.v;}))throw new DiscreteGraphError("GRAPH_LOOP_COLORING","A graph with a loop has no proper vertex coloring");var order=g.vertices.slice().sort(function(a,b){return g.adj.get(b).length-g.adj.get(a).length;}),neighbors=new Map();g.vertices.forEach(function(v){neighbors.set(v,new Set(g.adj.get(v).map(function(e){return e.to;})));});
  function tryK(k){var colors=new Map();function backtrack(i){if(i===order.length)return true;var v=order[i],blocked=new Set();neighbors.get(v).forEach(function(u){if(colors.has(u))blocked.add(colors.get(u));});for(var c=0;c<k;c++)if(!blocked.has(c)){colors.set(v,c);if(backtrack(i+1))return true;colors.delete(v);}return false;}return backtrack(0)?colors:null;}
  var lower=g.edges.length?2:1;for(var k=lower;k<=n;k++){var coloring=tryK(k);if(coloring){var obj={};g.vertices.forEach(function(v){obj[v]=coloring.get(v)+1;});return {chromaticNumber:k,coloring:obj};}}return {chromaticNumber:n,coloring:null};
}
function pruferDecode(code){var seq=code.map(function(x){return toBoundedInt(x,1,LIMITS.combinatorialN,"Prüfer label");}),n=seq.length+2;if(n>LIMITS.combinatorialN)throw new DiscreteComplexityError("Prüfer tree size exceeds safety limit");var degree=Array(n+1).fill(1);seq.forEach(function(x){if(x>n)throw new DiscreteMathError("PRUFER_LABEL","Prüfer labels must be in 1..n",{label:x,n:n});degree[x]++;});var edges=[];seq.forEach(function(x){var leaf=1;while(leaf<=n&&degree[leaf]!==1)leaf++;edges.push([String(leaf),String(x)]);degree[leaf]--;degree[x]--;});var leaves=[];for(var i=1;i<=n;i++)if(degree[i]===1)leaves.push(i);edges.push([String(leaves[0]),String(leaves[1])]);return {vertexCount:n,edges:edges};}

/* Command router -------------------------------------------------------- */
function runCommand(raw,options){
  raw=String(raw).trim();options=options||{};var p,body;
  p=parseSemicolon(raw,"choose");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","choose expects n; k");var v=chooseBig(parseInteger(p[0],"n"),parseInteger(p[1],"k"));return integerResult(v,"binomial",{n:p[0],k:p[1]});}
  p=parseSemicolon(raw,"permute");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","permute expects n; k");return integerResult(permutationBig(parseInteger(p[0]),parseInteger(p[1])),"permutation");}
  p=parseSemicolon(raw,"multinomial");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","multinomial expects n; parts");return integerResult(multinomialBig(parseInteger(p[0]),parseIntegerList(p[1],"parts")),"multinomial");}
  p=parseSemicolon(raw,"catalan");if(p){if(p.length!==1)throw new DiscreteMathError("ARITY_ERROR","catalan expects n");return integerResult(catalanBig(parseInteger(p[0])),"catalan");}
  p=parseSemicolon(raw,"stirling2");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","stirling2 expects n; k");return integerResult(stirlingSecondBig(parseInteger(p[0]),parseInteger(p[1])),"stirling-second");}
  p=parseSemicolon(raw,"stirling1");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","stirling1 expects n; k");return integerResult(stirlingFirstUnsignedBig(parseInteger(p[0]),parseInteger(p[1])),"stirling-first-unsigned");}
  p=parseSemicolon(raw,"bell");if(p){if(p.length!==1)throw new DiscreteMathError("ARITY_ERROR","bell expects n");return integerResult(bellBig(parseInteger(p[0])),"bell");}
  p=parseSemicolon(raw,"derange");if(p){if(p.length!==1)throw new DiscreteMathError("ARITY_ERROR","derange expects n");return integerResult(derangementBig(parseInteger(p[0])),"derangement");}
  p=parseSemicolon(raw,"partitioncount");if(p){if(p.length!==1)throw new DiscreteMathError("ARITY_ERROR","partitioncount expects n");return integerResult(partitionCountBig(parseInteger(p[0])),"integer-partitions");}
  p=parseSemicolon(raw,"starsbars");if(p){if(p.length<2||p.length>3)throw new DiscreteMathError("ARITY_ERROR","starsbars expects objects; boxes; optional positive|nonnegative");var mode=(p[2]||"nonnegative").trim().toLowerCase();if(mode!=="positive"&&mode!=="nonnegative")throw new DiscreteMathError("MODE_ERROR","starsbars mode must be positive or nonnegative");return integerResult(starsAndBars(parseInteger(p[0]),parseInteger(p[1]),mode==="positive"),"stars-and-bars",{mode:mode});}
  p=parseSemicolon(raw,"pigeonhole");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","pigeonhole expects items; boxes");return integerResult(pigeonholeMinimum(p[0],p[1]),"pigeonhole");}
  p=parseSemicolon(raw,"cayley");if(p){if(p.length!==1)throw new DiscreteMathError("ARITY_ERROR","cayley expects n");return integerResult(cayleyTreesBig(parseInteger(p[0])),"cayley-trees");}
  p=parseSemicolon(raw,"fib");if(p){if(p.length!==1)throw new DiscreteMathError("ARITY_ERROR","fib expects n");return integerResult(fibonacciBig(parseInteger(p[0])),"fibonacci");}

  p=parseSemicolon(raw,"egcd");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","egcd expects a; b");var e=extendedGcd(parseInteger(p[0]),parseInteger(p[1]));return integerResult(e.gcd,"extended-gcd",{x:e.x.toString(),y:e.y.toString()},"gcd = "+e.gcd+"; x = "+e.x+"; y = "+e.y);}
  p=parseSemicolon(raw,"modinv");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","modinv expects a; m");var mi=modularInverse(parseInteger(p[0]),parseInteger(p[1]));return integerResult(mi,"modular-inverse",{modulus:p[1]},mi+" (mod "+parseInteger(p[1])+")");}
  p=parseSemicolon(raw,"modpow");if(p){if(p.length!==3)throw new DiscreteMathError("ARITY_ERROR","modpow expects a; exponent; modulus");var mp=modularPower(parseInteger(p[0]),parseInteger(p[1]),parseInteger(p[2]));return integerResult(mp,"modular-power",{modulus:p[2]});}
  p=parseSemicolon(raw,"crt");if(p){var congr=p.map(function(item){var q=splitArgs(item);if(q.length!==2)throw new DiscreteMathError("CRT_PAIR","Each CRT item must be residue,modulus");return [parseInteger(q[0]),parseInteger(q[1])];}),cr=crt(congr);return integerResult(cr.residue,"chinese-remainder",{modulus:cr.modulus.toString()},"x ≡ "+cr.residue+" (mod "+cr.modulus+")");}
  p=parseSemicolon(raw,"lincong");if(p){if(p.length!==3)throw new DiscreteMathError("ARITY_ERROR","lincong expects a; b; m for a*x ≡ b (mod m)");var lc=solveLinearCongruence(parseInteger(p[0]),parseInteger(p[1]),parseInteger(p[2]));return integerResult(lc.base,"linear-congruence",{reducedModulus:lc.reducedModulus.toString(),solutionCount:lc.solutionCount.toString(),originalModulus:lc.originalModulus.toString()},"x ≡ "+lc.base+" (mod "+lc.reducedModulus+"); "+lc.solutionCount+" solution class"+(lc.solutionCount===1n?"":"es")+" modulo "+lc.originalModulus);}

  p=parseSemicolon(raw,"linrec");if(p){if(p.length!==3)throw new DiscreteMathError("ARITY_ERROR","linrec expects coefficients; initials; n");var cf=parseIntegerList(p[0],"coefficients"),ini=parseIntegerList(p[1],"initials"),term=linearRecurrenceTerm(cf,ini,parseInteger(p[2]));return integerResult(term,"linear-recurrence",{index:p[2]});}
  p=parseSemicolon(raw,"recseq");if(p){if(p.length!==3)throw new DiscreteMathError("ARITY_ERROR","recseq expects coefficients; initials; count");var rs=linearRecurrenceSequence(parseIntegerList(p[0],"coefficients"),parseIntegerList(p[1],"initials"),parseInteger(p[2]));return commandResult(formatBigList(rs),"recurrence-sequence",{metadata:{terms:rs.map(String)}});}
  p=parseSemicolon(raw,"recgf");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","recgf expects coefficients; initials");var rg=recurrenceGeneratingFunction(parseIntegerList(p[0],"coefficients"),parseIntegerList(p[1],"initials")),gf="("+formatPolynomial(rg.numerator,"x")+") / ("+formatPolynomial(rg.denominator,"x")+")";return commandResult(gf,"recurrence-generating-function",{metadata:{numerator:rg.numerator.map(String),denominator:rg.denominator.map(String)}});}

  p=parseSemicolon(raw,"setunion");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","setunion expects A; B");var su=setUnion(parseSet(p[0]),parseSet(p[1]));return commandResult(formatSet(su),"set-union",{metadata:{set:su}});}
  p=parseSemicolon(raw,"setintersect");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","setintersect expects A; B");var si=setIntersection(parseSet(p[0]),parseSet(p[1]));return commandResult(formatSet(si),"set-intersection",{metadata:{set:si}});}
  p=parseSemicolon(raw,"setdiff");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","setdiff expects A; B");var sd=setDifference(parseSet(p[0]),parseSet(p[1]));return commandResult(formatSet(sd),"set-difference",{metadata:{set:sd}});}
  p=parseSemicolon(raw,"setsymdiff");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","setsymdiff expects A; B");var ss=setSymmetricDifference(parseSet(p[0]),parseSet(p[1]));return commandResult(formatSet(ss),"set-symmetric-difference",{metadata:{set:ss}});}
  p=parseSemicolon(raw,"cartesian");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","cartesian expects A; B");var cp=cartesianProduct(parseSet(p[0]),parseSet(p[1]));return commandResult(formatPairs(cp,","),"cartesian-product",{metadata:{pairs:cp}});}
  body=parseCall(raw,"powerset");if(body!==null){var ps=powerSet(parseSet(body)),txt="{"+ps.map(formatSet).join(", ")+"}";return integerResult(BigInt(ps.length),"powerset",{subsets:ps},txt+"; |P(A)| = "+ps.length);}

  body=parseCall(raw,"truth");if(body!==null){var tt=truthTable(body);return commandResult(tt.classification+"; true on "+tt.trueCount+"/"+tt.rows.length+" assignments; vars = ["+tt.variables.join(", ")+ "]","truth-table",{metadata:{variables:tt.variables,rows:tt.rows,trueCount:tt.trueCount,falseCount:tt.falseCount,classification:tt.classification}});}
  p=parseSemicolon(raw,"equiv");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","equiv expects proposition A; proposition B");var le=logicEquivalent(p[0],p[1]),disp=le.equivalent?"equivalent":"not equivalent; counterexample = "+JSON.stringify(le.counterexample);return commandResult(disp,"logic-equivalence",{metadata:le});}
  body=parseCall(raw,"dnf");if(body!==null){var dn=canonicalDNF(body);return commandResult(dn.form,"canonical-dnf",{metadata:{variables:dn.truth.variables,classification:dn.truth.classification}});}
  body=parseCall(raw,"cnf");if(body!==null){var cn=canonicalCNF(body);return commandResult(cn.form,"canonical-cnf",{metadata:{variables:cn.truth.variables,classification:cn.truth.classification}});}

  p=parseSemicolon(raw,"relation");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","relation expects universe; pairs");var ru=parseSet(p[0]),rp=parseRelationPairs(ru,p[1]),ra=analyzeRelation(ru,rp),rd="reflexive="+ra.reflexive+"; symmetric="+ra.symmetric+"; antisymmetric="+ra.antisymmetric+"; transitive="+ra.transitive+"; equivalence="+ra.equivalence+"; partialOrder="+ra.partialOrder;return commandResult(rd,"relation-analysis",{metadata:Object.assign({universe:ru,pairs:rp},ra)});}
  p=parseSemicolon(raw,"relclosure");if(p){if(p.length!==3)throw new DiscreteMathError("ARITY_ERROR","relclosure expects type; universe; pairs");var cu=parseSet(p[1]),cl=relationClosure(cu,parseRelationPairs(cu,p[2]),p[0]);return commandResult(formatPairs(cl,","),"relation-closure",{metadata:{type:p[0].trim().toLowerCase(),pairs:cl}});}
  p=parseSemicolon(raw,"equivclasses");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","equivclasses expects universe; pairs");var eu=parseSet(p[0]),ec=equivalenceClasses(eu,parseRelationPairs(eu,p[1]));return commandResult("["+ec.map(formatSet).join(", ")+"]","equivalence-classes",{metadata:{classes:ec}});}
  p=parseSemicolon(raw,"hasse");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","hasse expects universe; partial-order pairs");var hu=parseSet(p[0]),hc=hasseCover(hu,parseRelationPairs(hu,p[1]));return commandResult(formatPairs(hc,","),"hasse-cover",{metadata:{cover:hc}});}

  p=parseSemicolon(raw,"graphinfo");if(p){if(p.length<2||p.length>3)throw new DiscreteMathError("ARITY_ERROR","graphinfo expects vertices; edges; optional directed|undirected");var mode=(p[2]||"undirected").trim().toLowerCase();if(mode!=="directed"&&mode!=="undirected")throw new DiscreteMathError("MODE_ERROR","Graph mode must be directed or undirected");var gv=parseVertices(p[0]),gi=graphInfo(gv,p[1],mode==="directed"),gd="|V|="+gi.vertexCount+"; |E|="+gi.edgeCount+"; "+(gi.directed?("DAG="+gi.dag+"; stronglyConnected="+gi.stronglyConnected):("connected="+gi.connected+"; tree="+gi.tree+"; bipartite="+gi.bipartite));return commandResult(gd,"graph-analysis",{metadata:gi});}
  p=parseSemicolon(raw,"shortest");if(p){if(p.length<4||p.length>5)throw new DiscreteMathError("ARITY_ERROR","shortest expects vertices; weighted edges; start; target; optional directed|undirected");var sm=(p[4]||"undirected").trim().toLowerCase(),sv=parseVertices(p[0]),sp=shortestPath(sv,p[1],normalizeAtom(p[2]),normalizeAtom(p[3]),sm==="directed");if(!sp.reachable)return commandResult("unreachable","shortest-path",{metadata:sp});return integerResult(sp.distance,"shortest-path",{path:sp.path},"distance = "+sp.distance+"; path = "+sp.path.join(" → "));}
  p=parseSemicolon(raw,"mst");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","mst expects vertices; weighted edges");var mt=minimumSpanningTree(parseVertices(p[0]),p[1]),medges=mt.edges.map(function(e){return e.u+"-"+e.v+":"+e.w;});return integerResult(mt.weight,"minimum-spanning-tree",{edges:medges},"weight = "+mt.weight+"; edges = ["+medges.join(", ")+"]");}
  p=parseSemicolon(raw,"toposort");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","toposort expects vertices; directed edges");var ts=topologicalSort(parseVertices(p[0]),p[1]);return commandResult("["+ts.join(", ")+"]","topological-sort",{metadata:{order:ts}});}
  p=parseSemicolon(raw,"eulertrail");if(p){if(p.length<2||p.length>3)throw new DiscreteMathError("ARITY_ERROR","eulertrail expects vertices; edges; optional directed|undirected");var em=(p[2]||"undirected").trim().toLowerCase(),et=eulerTrail(parseVertices(p[0]),p[1],em==="directed");return commandResult(et.type+": "+et.path.join(" → "),"euler-trail",{metadata:et});}
  p=parseSemicolon(raw,"chromatic");if(p){if(p.length!==2)throw new DiscreteMathError("ARITY_ERROR","chromatic expects vertices; undirected edges");var ch=chromaticNumber(parseVertices(p[0]),p[1]);return integerResult(BigInt(ch.chromaticNumber),"chromatic-number",{coloring:ch.coloring},"χ = "+ch.chromaticNumber+"; coloring = "+JSON.stringify(ch.coloring));}
  body=parseCall(raw,"pruferdecode");if(body!==null){var code=String(body).trim()?parseIntegerList(body,"Prüfer code"):[],pd=pruferDecode(code),pdt=pd.edges.map(function(e){return e[0]+"-"+e[1];});return commandResult("n = "+pd.vertexCount+"; edges = ["+pdt.join(", ")+"]","prufer-decode",{metadata:pd});}

  if(/^discretehelp\s*\(\s*\)$/i.test(raw))return commandResult("U7: choose · permute · multinomial · catalan · stirling1/2 · bell · derange · partitioncount · starsbars · pigeonhole · cayley · fib · egcd · modinv · modpow · crt · lincong · linrec · recseq · recgf · setunion/intersect/diff/symdiff · cartesian · powerset · truth · equiv · cnf · dnf · relation · relclosure · equivclasses · hasse · graphinfo · shortest · mst · toposort · eulertrail · chromatic · pruferdecode","discrete-help",{metadata:{operation:"discretehelp"}});
  return null;
}

global.CalcDiscrete={
  VERSION:"2.6.0-u7",LIMITS:LIMITS,
  DiscreteMathError:DiscreteMathError,DiscreteComplexityError:DiscreteComplexityError,DiscreteGraphError:DiscreteGraphError,
  chooseBig:chooseBig,permutationBig:permutationBig,multinomialBig:multinomialBig,catalanBig:catalanBig,stirlingSecondBig:stirlingSecondBig,stirlingFirstUnsignedBig:stirlingFirstUnsignedBig,bellBig:bellBig,derangementBig:derangementBig,partitionCountBig:partitionCountBig,starsAndBars:starsAndBars,pigeonholeMinimum:pigeonholeMinimum,cayleyTreesBig:cayleyTreesBig,fibonacciBig:fibonacciBig,
  extendedGcd:extendedGcd,modularInverse:modularInverse,modularPower:modularPower,crt:crt,solveLinearCongruence:solveLinearCongruence,
  parseSet:parseSet,setUnion:setUnion,setIntersection:setIntersection,setDifference:setDifference,setSymmetricDifference:setSymmetricDifference,cartesianProduct:cartesianProduct,powerSet:powerSet,
  linearRecurrenceTerm:linearRecurrenceTerm,linearRecurrenceSequence:linearRecurrenceSequence,recurrenceGeneratingFunction:recurrenceGeneratingFunction,
  tokenizeLogic:tokenizeLogic,parseLogic:parseLogic,evaluateLogic:evaluateLogic,truthTable:truthTable,logicEquivalent:logicEquivalent,canonicalDNF:canonicalDNF,canonicalCNF:canonicalCNF,
  parseRelationPairs:parseRelationPairs,analyzeRelation:analyzeRelation,relationClosure:relationClosure,equivalenceClasses:equivalenceClasses,hasseCover:hasseCover,
  parseGraphEdges:parseGraphEdges,makeGraph:makeGraph,weakComponents:weakComponents,stronglyConnectedComponents:stronglyConnectedComponents,graphHasCycle:graphHasCycle,bipartiteCheck:bipartiteCheck,graphDegrees:graphDegrees,graphInfo:graphInfo,shortestPath:shortestPath,minimumSpanningTree:minimumSpanningTree,topologicalSort:topologicalSort,eulerTrail:eulerTrail,chromaticNumber:chromaticNumber,pruferDecode:pruferDecode,
  runCommand:runCommand
};
})(window);
