(function(global){
"use strict";

const M=global.CalcMath;
const LA=global.CalcLinearAlgebra;
if(!M||!LA)throw new Error("CalcMath and CalcLinearAlgebra must load before CalcStatistics");

class StatisticsError extends M.CalcError{
  constructor(code,message,details){super(code||"STATISTICS_ERROR",message,undefined,undefined,details);}
}
class DatasetError extends StatisticsError{constructor(message,details){super("DATASET_ERROR",message,details);}}
class DistributionError extends StatisticsError{constructor(message,details){super("DISTRIBUTION_ERROR",message,details);}}
class InferenceError extends StatisticsError{constructor(message,details){super("INFERENCE_ERROR",message,details);}}
class RegressionError extends StatisticsError{constructor(message,details){super("REGRESSION_ERROR",message,details);}}

const Missing=Object.freeze({type:"missing",toString:function(){return "Missing";}});
function isMissing(v){return v===Missing||v===null||v===undefined||(typeof v==="number"&&Number.isNaN(v));}
function cleanCell(v){
  if(isMissing(v))return Missing;
  if(typeof v==="string"){
    const s=v.trim();if(s===""||/^(na|n\/a|null|missing)$/i.test(s))return Missing;
  }
  return v;
}
function numericValue(v){
  if(isMissing(v))return null;
  if(v instanceof M.Rational)return v.toNumber();
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function exactNumeric(v){return v instanceof M.Rational;}

class DataColumn{
  constructor(name,values,options){
    options=options||{};
    this.name=String(name||"Column");
    this.values=(values||[]).map(cleanCell);
    this.type=options.type||inferColumnType(this.values);
    this.unit=options.unit||null;
    this.role=options.role||null;
    Object.freeze(this.values);Object.freeze(this);
  }
  get length(){return this.values.length;}
  get(i){return this.values[i];}
  missingCount(){return this.values.reduce((n,v)=>n+(isMissing(v)?1:0),0);}
  numericValues(){return this.values.map(numericValue).filter(v=>v!==null);}
  toJSON(){return {name:this.name,type:this.type,unit:this.unit,role:this.role,values:this.values.map(v=>isMissing(v)?{__missing:true}:v instanceof M.Rational?{__rational:[v.n.toString(),v.d.toString()]}:v)};}
  static fromJSON(d){return new DataColumn(d.name,(d.values||[]).map(v=>v&&v.__missing?Missing:v&&v.__rational?new M.Rational(BigInt(v.__rational[0]),BigInt(v.__rational[1])):v),d);}
}
function inferColumnType(values){
  const present=values.filter(v=>!isMissing(v));if(!present.length)return "unknown";
  if(present.every(v=>numericValue(v)!==null))return "numeric";
  if(present.every(v=>typeof v==="boolean"||v==="true"||v==="false"))return "boolean";
  return "categorical";
}

class Dataset{
  constructor(columns,rowIds,options){
    options=options||{};
    this.columns=(columns||[]).map(c=>c instanceof DataColumn?c:new DataColumn(c.name,c.values,c));
    const n=this.columns.length?this.columns[0].length:(rowIds?rowIds.length:0);
    if(this.columns.some(c=>c.length!==n))throw new DatasetError("All dataset columns must have the same row count");
    const columnNames=this.columns.map(c=>c.name);if(new Set(columnNames).size!==columnNames.length)throw new DatasetError("Dataset column names must be unique");
    this.rowIds=rowIds?rowIds.slice():Array.from({length:n},(_,i)=>"r"+(i+1));
    if(this.rowIds.length!==n)throw new DatasetError("Row IDs must match row count");
    if(new Set(this.rowIds).size!==this.rowIds.length)throw new DatasetError("Row IDs must be unique");
    this.name=options.name||"Dataset";this.source=options.source||null;this.revision=options.revision||1;
    Object.freeze(this.columns);Object.freeze(this.rowIds);Object.freeze(this);
  }
  get rowCount(){return this.rowIds.length;}
  get columnCount(){return this.columns.length;}
  column(key){
    if(typeof key==="number")return this.columns[key]||null;
    return this.columns.find(c=>c.name===key)||null;
  }
  indexOfColumn(name){return this.columns.findIndex(c=>c.name===name);}
  value(rowIndex,column){const c=column instanceof DataColumn?column:this.column(column);if(!c)throw new DatasetError("Unknown column '"+column+"'");return c.get(rowIndex);}
  completeCases(names){
    const cols=names.map(n=>{const c=this.column(n);if(!c)throw new DatasetError("Unknown column '"+n+"'");return c;});
    const rows=[];
    for(let i=0;i<this.rowCount;i++){
      const values=cols.map(c=>c.get(i));
      if(values.every(v=>!isMissing(v)))rows.push({rowId:this.rowIds[i],rowIndex:i,values:values});
    }
    return rows;
  }
  selectRows(indices){
    return new Dataset(this.columns.map(c=>new DataColumn(c.name,indices.map(i=>c.get(i)),c)),indices.map(i=>this.rowIds[i]),{name:this.name,source:this.source,revision:this.revision+1});
  }
  sortedBy(name,direction){
    const c=this.column(name);if(!c)throw new DatasetError("Unknown column '"+name+"'");const dir=direction==="desc"?-1:1;
    const idx=Array.from({length:this.rowCount},(_,i)=>i);
    idx.sort((a,b)=>{
      const x=c.get(a),y=c.get(b);if(isMissing(x)&&isMissing(y))return a-b;if(isMissing(x))return 1;if(isMissing(y))return -1;
      const nx=numericValue(x),ny=numericValue(y);if(nx!==null&&ny!==null)return (nx-ny)*dir||a-b;
      return String(x).localeCompare(String(y))*dir||a-b;
    });
    return this.selectRows(idx);
  }
  toRows(){return this.rowIds.map((id,i)=>({rowId:id,values:Object.fromEntries(this.columns.map(c=>[c.name,c.get(i)]))}));}
  toJSON(){return {type:"dataset",name:this.name,source:this.source,revision:this.revision,rowIds:this.rowIds.slice(),columns:this.columns.map(c=>c.toJSON())};}
  static fromJSON(d){return new Dataset((d.columns||[]).map(DataColumn.fromJSON),d.rowIds,d);}
  static fromDelimited(text,options){return parseDelimitedDataset(text,options);}
}

function detectDelimiter(firstLine){
  const counts=[["\t",(firstLine.match(/\t/g)||[]).length],[";",(firstLine.match(/;/g)||[]).length],[",",(firstLine.match(/,/g)||[]).length]];
  counts.sort((a,b)=>b[1]-a[1]);return counts[0][1]>0?counts[0][0]:null;
}
function parseCsvRows(text,delimiter){
  const rows=[],row=[];let current=[],field="",quoted=false;
  function pushField(){current.push(field);field="";}
  function pushRow(){pushField();rows.push(current);current=[];}
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(ch==='"')quoted=false;
      else field+=ch;
    }else{
      if(ch==='"')quoted=true;
      else if(ch===delimiter)pushField();
      else if(ch==="\n")pushRow();
      else if(ch!=="\r")field+=ch;
    }
  }
  if(quoted)throw new DatasetError("Unterminated quoted field");
  if(field.length||current.length)pushRow();
  return rows;
}
function parseNumericLocale(s,decimalComma){
  if(typeof s!=="string")return numericValue(s);
  let t=s.trim();if(!t)return null;
  if(decimalComma)t=t.replace(/\./g,"").replace(",",".");
  const n=Number(t);return Number.isFinite(n)?n:null;
}
function parseDelimitedDataset(text,options){
  options=options||{};text=String(text||"").replace(/^\uFEFF/,"").trim();if(!text)return new Dataset([]);
  const first=text.split(/\r?\n/)[0],delimiter=options.delimiter||detectDelimiter(first);
  let rows;
  if(delimiter)rows=parseCsvRows(text,delimiter);
  else rows=text.split(/\r?\n/).map(line=>line.trim().split(/\s+/));
  rows=rows.filter(r=>r.some(v=>String(v).trim()!==""));if(!rows.length)return new Dataset([]);
  const decimalComma=options.decimalComma!==undefined?!!options.decimalComma:(delimiter===";");
  const width=Math.max.apply(null,rows.map(r=>r.length));rows=rows.map(r=>Array.from({length:width},(_,i)=>r[i]===undefined?"":r[i]));
  const firstNumeric=rows[0].every(v=>v===""||parseNumericLocale(v,decimalComma)!==null);
  const hasHeader=options.header!==undefined?!!options.header:!firstNumeric;
  const rawNames=hasHeader?rows[0].map((v,i)=>String(v).trim()||"Column "+(i+1)):Array.from({length:width},(_,i)=>"Column "+(i+1));
  const usedNames=new Set(),names=rawNames.map(function(base){let name=base,n=2;while(usedNames.has(name))name=base+" ("+(n++)+")";usedNames.add(name);return name;});
  const body=hasHeader?rows.slice(1):rows;
  const columns=names.map((name,j)=>{
    const raw=body.map(r=>cleanCell(r[j]));
    const numericPresent=raw.filter(v=>!isMissing(v)).map(v=>parseNumericLocale(v,decimalComma));
    const numeric=numericPresent.length>0&&numericPresent.every(v=>v!==null);
    return new DataColumn(name,raw.map(v=>isMissing(v)?Missing:(numeric?parseNumericLocale(v,decimalComma):v)),{type:numeric?"numeric":"categorical"});
  });
  return new Dataset(columns,null,{source:{format:"delimited",delimiter:delimiter||"whitespace",decimalComma:decimalComma}});
}

function kahanSum(values){let sum=0,c=0;for(const x of values){const y=x-c,t=sum+y;c=(t-sum)-y;sum=t;}return sum;}
function welford(values){
  let n=0,mean=0,m2=0,min=Infinity,max=-Infinity;
  for(const x of values){n++;const d=x-mean;mean+=d/n;m2+=d*(x-mean);if(x<min)min=x;if(x>max)max=x;}
  return {n:n,mean:mean,m2:m2,min:min,max:max};
}
function quantile(values,p,method){
  method=method||"R7";if(method!=="R7")throw new StatisticsError("UNSUPPORTED_QUANTILE_METHOD","Only R7 quantiles are certified in Phase 6");
  if(!(p>=0&&p<=1))throw new StatisticsError("INVALID_PROBABILITY","Quantile probability must lie in [0,1]");
  const x=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b),n=x.length;if(!n)throw new StatisticsError("EMPTY_SAMPLE","Quantile requires observations");
  if(n===1)return x[0];const h=(n-1)*p,i=Math.floor(h),f=h-i;return x[i]+f*(x[Math.min(i+1,n-1)]-x[i]);
}
function median(values){return quantile(values,0.5);}
function describe(values,options){
  options=options||{};
  const source=values instanceof DataColumn?values.values:values;
  const nums=source.map(numericValue).filter(v=>v!==null),missing=source.length-nums.length;if(!nums.length)throw new StatisticsError("EMPTY_SAMPLE","No numeric observations");
  const w=welford(nums),sum=kahanSum(nums),sample=options.variance!=="population";
  const present=source.filter(v=>!isMissing(v)),allExact=present.length>0&&present.every(exactNumeric);
  let exactMean=null;if(allExact){let s=new M.Rational(0n);for(const v of present)s=s.add(v);exactMean=s.div(new M.Rational(BigInt(present.length)));}
  return {
    count:w.n,missing:missing,sum:sum,mean:w.mean,exactMean:exactMean,median:median(nums),min:w.min,max:w.max,
    q1:quantile(nums,0.25),q3:quantile(nums,0.75),iqr:quantile(nums,0.75)-quantile(nums,0.25),
    variancePopulation:w.m2/w.n,varianceSample:w.n>1?w.m2/(w.n-1):NaN,
    sdPopulation:Math.sqrt(w.m2/w.n),sdSample:w.n>1?Math.sqrt(w.m2/(w.n-1)):NaN,
    variance:sample?(w.n>1?w.m2/(w.n-1):NaN):w.m2/w.n,
    sd:sample?(w.n>1?Math.sqrt(w.m2/(w.n-1)):NaN):Math.sqrt(w.m2/w.n),
    quantileMethod:"R7"
  };
}
function weightedMean(values,weights){
  if(values.length!==weights.length)throw new StatisticsError("WEIGHT_MISMATCH","Values and weights must have equal length");
  let sw=0,s=0;for(let i=0;i<values.length;i++){const x=numericValue(values[i]),w=numericValue(weights[i]);if(x===null||w===null)continue;if(w<0)throw new StatisticsError("INVALID_WEIGHT","Weights must be non-negative");sw+=w;s+=w*x;}
  if(sw===0)throw new StatisticsError("INVALID_WEIGHT","Total weight must be positive");return s/sw;
}
function frequencyExpanded(values,frequencies){
  if(values.length!==frequencies.length)throw new StatisticsError("FREQUENCY_MISMATCH","Values and frequencies must have equal length");
  const out=[];for(let i=0;i<values.length;i++){const x=numericValue(values[i]),f=numericValue(frequencies[i]);if(x===null||f===null)continue;if(!Number.isInteger(f)||f<0)throw new StatisticsError("INVALID_FREQUENCY","Frequencies must be non-negative integers");for(let k=0;k<f;k++)out.push(x);}
  return out;
}

class Probability{
  constructor(value){value=Number(value);if(!(value>=0&&value<=1))throw new StatisticsError("INVALID_PROBABILITY","Probability must lie in [0,1]");this.value=value;Object.freeze(this);}
  complement(){return new Probability(1-this.value);}
  toString(){return M.formatNumber(this.value,12);}
  valueOf(){return this.value;}
}
class Event{
  constructor(name,probability){this.name=String(name||"Event");this.probability=probability instanceof Probability?probability:new Probability(probability);Object.freeze(this);}
  complement(name){return new Event(name||("not "+this.name),this.probability.complement());}
  toString(){return this.name+" (p="+this.probability.toString()+")";}
}
class FrequencyTable{
  constructor(values,frequencies){
    if(values.length!==frequencies.length)throw new StatisticsError("FREQUENCY_MISMATCH","Values and frequencies must have equal length");
    this.values=values.slice();this.frequencies=frequencies.map(f=>{const n=Number(f);if(!Number.isInteger(n)||n<0)throw new StatisticsError("INVALID_FREQUENCY","Frequencies must be non-negative integers");return n;});
    this.total=this.frequencies.reduce((a,b)=>a+b,0);Object.freeze(this.values);Object.freeze(this.frequencies);Object.freeze(this);
  }
  expanded(){return frequencyExpanded(this.values,this.frequencies);}
  describe(options){return describe(this.expanded(),options);}
}
class RandomVariable{
  constructor(name,distribution){if(!(distribution instanceof Distribution))throw new DistributionError("RandomVariable requires a Distribution");this.name=name||"X";this.distribution=distribution;Object.freeze(this);}
  mean(){return this.distribution.mean();}variance(){return this.distribution.variance();}cdf(x){return new Probability(this.distribution.cdf(x));}sf(x){return new Probability(this.distribution.sf(x));}quantile(p){return this.distribution.quantile(p instanceof Probability?p.value:p);}
}
class ConfidenceInterval{
  constructor(spec){Object.assign(this,spec);Object.freeze(this);}
  contains(x){return x>=this.lower&&x<=this.upper;}
  toString(){return "["+M.formatNumber(this.lower,12)+", "+M.formatNumber(this.upper,12)+"]";}
}
class HypothesisTest{
  constructor(spec){Object.assign(this,spec);this.pValue=this.pValue instanceof Probability?this.pValue:new Probability(this.pValue);Object.freeze(this);}
  toString(){return this.method+": statistic="+M.formatNumber(this.statistic,12)+", p="+this.pValue.toString();}
}

function pairedNumeric(dataset,aName,bName){
  const rows=dataset.completeCases([aName,bName]),pairs=[];
  for(const row of rows){const a=numericValue(row.values[0]),b=numericValue(row.values[1]);if(a!==null&&b!==null)pairs.push({rowId:row.rowId,a:a,b:b});}
  return pairs;
}
function covariance(dataset,aName,bName,sample){
  const p=pairedNumeric(dataset,aName,bName);if(p.length<(sample===false?1:2))throw new StatisticsError("INSUFFICIENT_DATA","Not enough paired observations");
  const ma=kahanSum(p.map(x=>x.a))/p.length,mb=kahanSum(p.map(x=>x.b))/p.length;let c=0;for(const x of p)c+=(x.a-ma)*(x.b-mb);
  return {value:c/(sample===false?p.length:p.length-1),n:p.length,excluded:dataset.rowCount-p.length,rowIds:p.map(x=>x.rowId)};
}
function pearson(dataset,aName,bName){
  const p=pairedNumeric(dataset,aName,bName);if(p.length<2)throw new StatisticsError("INSUFFICIENT_DATA","Pearson correlation needs at least two pairs");
  const xs=p.map(x=>x.a),ys=p.map(x=>x.b),sx=describe(xs).sdSample,sy=describe(ys).sdSample;if(sx===0||sy===0)throw new StatisticsError("UNDEFINED_CORRELATION","Correlation is undefined for a constant column");
  return {value:covariance(dataset,aName,bName,true).value/(sx*sy),n:p.length,excluded:dataset.rowCount-p.length,rowIds:p.map(x=>x.rowId)};
}
function rankWithTies(values){
  const pairs=values.map((v,i)=>({v:v,i:i})).sort((a,b)=>a.v-b.v),r=Array(values.length);let i=0;
  while(i<pairs.length){let j=i+1;while(j<pairs.length&&pairs[j].v===pairs[i].v)j++;const rank=(i+1+j)/2;for(let k=i;k<j;k++)r[pairs[k].i]=rank;i=j;}return r;
}
function spearman(dataset,aName,bName){
  const p=pairedNumeric(dataset,aName,bName);if(p.length<2)throw new StatisticsError("INSUFFICIENT_DATA","Spearman correlation needs at least two pairs");
  const ra=rankWithTies(p.map(x=>x.a)),rb=rankWithTies(p.map(x=>x.b));
  const temp=new Dataset([new DataColumn("a",ra),new DataColumn("b",rb)],p.map(x=>x.rowId));
  const r=pearson(temp,"a","b");return {value:r.value,n:p.length,excluded:dataset.rowCount-p.length,rowIds:p.map(x=>x.rowId),tieMethod:"average"};
}
function covarianceMatrix(dataset,names){
  const out=names.map(a=>names.map(b=>covariance(dataset,a,b,true).value));return new LA.Matrix(out);
}
function correlationMatrix(dataset,names){
  const out=names.map(a=>names.map(b=>a===b?1:pearson(dataset,a,b).value));return new LA.Matrix(out);
}

// Special functions
const LANCZOS=[
  0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,
  -176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7
];
function logGamma(z){
  if(z<0.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
  z-=1;let x=LANCZOS[0];for(let i=1;i<LANCZOS.length;i++)x+=LANCZOS[i]/(z+i);const t=z+7.5;
  return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);
}
function gamma(z){return Math.exp(logGamma(z));}
function regularizedGammaP(a,x){
  if(!(a>0)||x<0)throw new StatisticsError("SPECIAL_FUNCTION_DOMAIN","regularizedGammaP domain error");if(x===0)return 0;
  if(x<a+1){let ap=a,sum=1/a,del=sum;for(let n=1;n<=10000;n++){ap++;del*=x/ap;sum+=del;if(Math.abs(del)<Math.abs(sum)*1e-15)break;}return sum*Math.exp(-x+a*Math.log(x)-logGamma(a));}
  return 1-regularizedGammaQ(a,x);
}
function regularizedGammaQ(a,x){
  if(!(a>0)||x<0)throw new StatisticsError("SPECIAL_FUNCTION_DOMAIN","regularizedGammaQ domain error");if(x===0)return 1;
  if(x<a+1)return 1-regularizedGammaP(a,x);
  let b=x+1-a,c=1/1e-300,d=1/b,h=d;for(let i=1;i<=10000;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<1e-15)break;}
  return Math.exp(-x+a*Math.log(x)-logGamma(a))*h;
}
function betaFn(a,b){return Math.exp(logGamma(a)+logGamma(b)-logGamma(a+b));}
function betaContinuedFraction(a,b,x){
  const MAX=10000,EPS=3e-14,FPMIN=1e-300;let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;if(Math.abs(d)<FPMIN)d=FPMIN;d=1/d;let h=d;
  for(let m=1;m<=MAX;m++){let m2=2*m,aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;d=1/d;h*=d*c;aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<EPS)break;}return h;
}
function regularizedBeta(x,a,b){
  if(!(a>0&&b>0)||x<0||x>1)throw new StatisticsError("SPECIAL_FUNCTION_DOMAIN","regularizedBeta domain error");if(x===0)return 0;if(x===1)return 1;
  const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));
  return x<(a+1)/(a+b+2)?bt*betaContinuedFraction(a,b,x)/a:1-bt*betaContinuedFraction(b,a,1-x)/b;
}
function erfc(x){
  if(x===0)return 1;
  const z=Math.abs(x),t=1/(1+0.5*z);
  const tau=t*Math.exp(-z*z-1.26551223+t*(1.00002368+t*(0.37409196+t*(0.09678418+t*(-0.18628806+t*(0.27886807+t*(-1.13520398+t*(1.48851587+t*(-0.82215223+t*0.17087277)))))))));
  return x>=0?tau:2-tau;
}
function erf(x){if(x===0)return 0;return x>0?1-erfc(x):erfc(-x)-1;}

function normalQuantile(p){
  if(!(p>0&&p<1)){if(p===0)return -Infinity;if(p===1)return Infinity;throw new DistributionError("p must be in [0,1]");}
  const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239];
  const b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572];
  const c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
  const d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416];
  const pl=0.02425,ph=1-pl;let q,r;
  if(p<pl){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  if(p>ph){q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  q=p-0.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
function logChoose(n,k){if(k<0||k>n)return -Infinity;return logGamma(n+1)-logGamma(k+1)-logGamma(n-k+1);}
function clamp01(x){return Math.max(0,Math.min(1,x));}
function invertCdf(dist,p,lo,hi){
  if(p<=0)return lo;if(p>=1)return hi;let a=lo,b=hi;
  if(!Number.isFinite(a))a=-1; if(!Number.isFinite(b))b=1;
  let guard=0;while(dist.cdf(a)>p&&guard++<100)a*=2;guard=0;while(dist.cdf(b)<p&&guard++<100)b*=2;
  for(let i=0;i<120;i++){const m=(a+b)/2;if(dist.cdf(m)<p)a=m;else b=m;}return (a+b)/2;
}

class SeededRNG{
  constructor(seed){this.state=(Number(seed)||0x9e3779b9)>>>0;}
  next(){let x=this.state;x^=x<<13;x^=x>>>17;x^=x<<5;this.state=x>>>0;return this.state/4294967296;}
  normal(){let u=0,v=0;while(u===0)u=this.next();while(v===0)v=this.next();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
  toJSON(){return {type:"xorshift32",state:this.state};}
}
class Distribution{
  constructor(name,params,discrete){this.name=name;this.params=Object.freeze(Object.assign({},params));this.discrete=!!discrete;}
  sf(x){return clamp01(1-this.cdf(x));}
  sample(rng){throw new DistributionError("Sampling not implemented for "+this.name);}
  sampleN(n,seed){const rng=seed instanceof SeededRNG?seed:new SeededRNG(seed),out=[];for(let i=0;i<n;i++)out.push(this.sample(rng));return out;}
}
class Bernoulli extends Distribution{
  constructor(p){if(!(p>=0&&p<=1))throw new DistributionError("Bernoulli p must be in [0,1]");super("Bernoulli",{p:p},true);this.p=p;}
  pmf(k){return k===1?this.p:k===0?1-this.p:0;}cdf(x){return x<0?0:x<1?1-this.p:1;}quantile(p){return p<=1-this.p?0:1;}mean(){return this.p;}variance(){return this.p*(1-this.p);}sample(rng){return rng.next()<this.p?1:0;}
}
class Binomial extends Distribution{
  constructor(n,p){if(!Number.isInteger(n)||n<0||!(p>=0&&p<=1))throw new DistributionError("Binomial requires integer n >= 0 and p in [0,1]");super("Binomial",{n:n,p:p},true);this.n=n;this.p=p;}
  pmf(k){if(!Number.isInteger(k)||k<0||k>this.n)return 0;if(this.p===0)return k===0?1:0;if(this.p===1)return k===this.n?1:0;return Math.exp(logChoose(this.n,k)+k*Math.log(this.p)+(this.n-k)*Math.log1p(-this.p));}
  cdf(x){const k=Math.floor(x);if(k<0)return 0;if(k>=this.n)return 1;if(this.p===0)return 1;if(this.p===1)return 0;return clamp01(regularizedBeta(1-this.p,this.n-k,k+1));}
  sf(x){const k=Math.floor(x);if(k<0)return 1;if(k>=this.n)return 0;if(this.p===0)return 0;if(this.p===1)return 1;return clamp01(regularizedBeta(this.p,k+1,this.n-k));}
  quantile(p){if(p<=0)return 0;if(p>=1)return this.n;let lo=0,hi=this.n;while(lo<hi){const m=Math.floor((lo+hi)/2);if(this.cdf(m)>=p)hi=m;else lo=m+1;}return lo;}
  mean(){return this.n*this.p;}variance(){return this.n*this.p*(1-this.p);}sample(rng){let s=0;for(let i=0;i<this.n;i++)if(rng.next()<this.p)s++;return s;}
}
class Geometric extends Distribution{
  constructor(p){if(!(p>0&&p<=1))throw new DistributionError("Geometric p must be in (0,1]");super("Geometric",{p:p,convention:"failures-before-first-success"},true);this.p=p;}
  pmf(k){return Number.isInteger(k)&&k>=0?Math.pow(1-this.p,k)*this.p:0;}cdf(x){const k=Math.floor(x);return k<0?0:1-Math.pow(1-this.p,k+1);}sf(x){const k=Math.floor(x);return k<0?1:Math.pow(1-this.p,k+1);}quantile(q){return q<=0?0:Math.max(0,Math.ceil(Math.log1p(-q)/Math.log1p(-this.p))-1);}mean(){return (1-this.p)/this.p;}variance(){return (1-this.p)/(this.p*this.p);}sample(rng){return Math.floor(Math.log1p(-rng.next())/Math.log1p(-this.p));}
}
class NegativeBinomial extends Distribution{
  constructor(r,p){if(!Number.isInteger(r)||r<=0||!(p>0&&p<=1))throw new DistributionError("NegativeBinomial requires positive integer r and p in (0,1]");super("NegativeBinomial",{r:r,p:p,convention:"failures-before-r-successes"},true);this.r=r;this.p=p;}
  pmf(k){return Number.isInteger(k)&&k>=0?Math.exp(logChoose(k+this.r-1,k)+this.r*Math.log(this.p)+k*Math.log1p(-this.p)):0;}
  cdf(x){const k=Math.floor(x);return k<0?0:clamp01(regularizedBeta(this.p,this.r,k+1));}
  sf(x){const k=Math.floor(x);return k<0?1:clamp01(regularizedBeta(1-this.p,k+1,this.r));}quantile(q){if(q<=0)return 0;let k=0;while(this.cdf(k)<q&&k<1e6)k++;return k;}mean(){return this.r*(1-this.p)/this.p;}variance(){return this.r*(1-this.p)/(this.p*this.p);}
  sample(rng){let f=0,s=0;while(s<this.r){if(rng.next()<this.p)s++;else f++;}return f;}
}
class Hypergeometric extends Distribution{
  constructor(N,K,n){if(![N,K,n].every(Number.isInteger)||N<0||K<0||n<0||K>N||n>N)throw new DistributionError("Invalid Hypergeometric parameters");super("Hypergeometric",{N:N,K:K,n:n},true);this.N=N;this.K=K;this.n=n;}
  pmf(k){const lo=Math.max(0,this.n-(this.N-this.K)),hi=Math.min(this.n,this.K);if(!Number.isInteger(k)||k<lo||k>hi)return 0;return Math.exp(logChoose(this.K,k)+logChoose(this.N-this.K,this.n-k)-logChoose(this.N,this.n));}
  cdf(x){const hi=Math.min(Math.floor(x),Math.min(this.n,this.K)),lo=Math.max(0,this.n-(this.N-this.K));let s=0;for(let k=lo;k<=hi;k++)s+=this.pmf(k);return clamp01(s);}quantile(q){const lo=Math.max(0,this.n-(this.N-this.K)),hi=Math.min(this.n,this.K);let s=0;for(let k=lo;k<=hi;k++){s+=this.pmf(k);if(s>=q)return k;}return hi;}
  mean(){return this.n*this.K/this.N;}variance(){return this.n*(this.K/this.N)*(1-this.K/this.N)*((this.N-this.n)/(this.N-1));}
  sample(rng){let success=0,K=this.K,N=this.N;for(let i=0;i<this.n;i++){if(rng.next()<K/N){success++;K--;}N--;}return success;}
}
class Poisson extends Distribution{
  constructor(lambda){if(!(lambda>=0))throw new DistributionError("Poisson lambda must be >= 0");super("Poisson",{lambda:lambda},true);this.lambda=lambda;}
  pmf(k){if(!Number.isInteger(k)||k<0)return 0;if(this.lambda===0)return k===0?1:0;return Math.exp(-this.lambda+k*Math.log(this.lambda)-logGamma(k+1));}
  cdf(x){const k=Math.floor(x);if(k<0)return 0;if(this.lambda===0)return 1;return clamp01(regularizedGammaQ(k+1,this.lambda));}
  sf(x){const k=Math.floor(x);if(k<0)return 1;if(this.lambda===0)return 0;return clamp01(regularizedGammaP(k+1,this.lambda));}
  quantile(q){if(q<=0)return 0;let lo=0,hi=Math.max(10,Math.ceil(this.lambda+10*Math.sqrt(this.lambda+1)));while(this.cdf(hi)<q)hi*=2;while(lo<hi){const m=Math.floor((lo+hi)/2);if(this.cdf(m)>=q)hi=m;else lo=m+1;}return lo;}
  mean(){return this.lambda;}variance(){return this.lambda;}sample(rng){if(this.lambda<30){const L=Math.exp(-this.lambda);let k=0,p=1;do{k++;p*=rng.next();}while(p>L);return k-1;}return Math.max(0,Math.round(this.lambda+Math.sqrt(this.lambda)*rng.normal()));}
}
class Uniform extends Distribution{
  constructor(a,b){if(!(b>a))throw new DistributionError("Uniform requires b > a");super("Uniform",{a:a,b:b},false);this.a=a;this.b=b;}
  pdf(x){return x>=this.a&&x<=this.b?1/(this.b-this.a):0;}cdf(x){return x<=this.a?0:x>=this.b?1:(x-this.a)/(this.b-this.a);}quantile(p){return this.a+p*(this.b-this.a);}mean(){return (this.a+this.b)/2;}variance(){return Math.pow(this.b-this.a,2)/12;}sample(rng){return this.quantile(rng.next());}
}
class Normal extends Distribution{
  constructor(mu,sigma){mu=mu===undefined?0:mu;sigma=sigma===undefined?1:sigma;if(!(sigma>0))throw new DistributionError("Normal sigma must be > 0");super("Normal",{mu:mu,sigma:sigma},false);this.mu=mu;this.sigma=sigma;}
  pdf(x){const z=(x-this.mu)/this.sigma;return Math.exp(-0.5*z*z)/(this.sigma*Math.sqrt(2*Math.PI));}
  cdf(x){return 0.5*erfc(-(x-this.mu)/(this.sigma*Math.SQRT2));}
  sf(x){return 0.5*erfc((x-this.mu)/(this.sigma*Math.SQRT2));}
  quantile(p){return this.mu+this.sigma*normalQuantile(p);}mean(){return this.mu;}variance(){return this.sigma*this.sigma;}sample(rng){return this.mu+this.sigma*rng.normal();}
}
class Exponential extends Distribution{
  constructor(rate){if(!(rate>0))throw new DistributionError("Exponential rate must be > 0");super("Exponential",{rate:rate},false);this.rate=rate;}
  pdf(x){return x<0?0:this.rate*Math.exp(-this.rate*x);}cdf(x){return x<0?0:-Math.expm1(-this.rate*x);}sf(x){return x<0?1:Math.exp(-this.rate*x);}quantile(p){return p>=1?Infinity:-Math.log1p(-p)/this.rate;}mean(){return 1/this.rate;}variance(){return 1/(this.rate*this.rate);}sample(rng){return -Math.log1p(-rng.next())/this.rate;}
}
class GammaDistribution extends Distribution{
  constructor(shape,scale){scale=scale===undefined?1:scale;if(!(shape>0&&scale>0))throw new DistributionError("Gamma shape and scale must be > 0");super("Gamma",{shape:shape,scale:scale},false);this.shape=shape;this.scale=scale;}
  pdf(x){if(x<0)return 0;if(x===0)return this.shape<1?Infinity:this.shape===1?1/this.scale:0;return Math.exp((this.shape-1)*Math.log(x)-x/this.scale-logGamma(this.shape)-this.shape*Math.log(this.scale));}
  cdf(x){return x<=0?0:regularizedGammaP(this.shape,x/this.scale);}sf(x){return x<=0?1:regularizedGammaQ(this.shape,x/this.scale);}quantile(p){return invertCdf(this,p,0,Math.max(1,this.mean()+10*Math.sqrt(this.variance())));}mean(){return this.shape*this.scale;}variance(){return this.shape*this.scale*this.scale;}
  sample(rng){const k=this.shape;if(k<1){const g=new GammaDistribution(k+1,this.scale).sample(rng);return g*Math.pow(rng.next(),1/k);}const d=k-1/3,c=1/Math.sqrt(9*d);while(true){let x=rng.normal(),v=Math.pow(1+c*x,3);if(v<=0)continue;const u=rng.next();if(u<1-0.0331*x*x*x*x||Math.log(u)<0.5*x*x+d*(1-v+Math.log(v)))return d*v*this.scale;}}
}
class BetaDistribution extends Distribution{
  constructor(a,b){if(!(a>0&&b>0))throw new DistributionError("Beta parameters must be > 0");super("Beta",{a:a,b:b},false);this.a=a;this.b=b;}
  pdf(x){if(x<0||x>1)return 0;if(x===0||x===1)return 0;return Math.exp((this.a-1)*Math.log(x)+(this.b-1)*Math.log1p(-x)-Math.log(betaFn(this.a,this.b)));}
  cdf(x){return x<=0?0:x>=1?1:regularizedBeta(x,this.a,this.b);}sf(x){return x<=0?1:x>=1?0:regularizedBeta(1-x,this.b,this.a);}quantile(p){return invertCdf(this,p,0,1);}mean(){return this.a/(this.a+this.b);}variance(){return this.a*this.b/((this.a+this.b)**2*(this.a+this.b+1));}
  sample(rng){const x=new GammaDistribution(this.a,1).sample(rng),y=new GammaDistribution(this.b,1).sample(rng);return x/(x+y);}
}
class ChiSquare extends GammaDistribution{
  constructor(df){if(!(df>0))throw new DistributionError("Chi-square df must be > 0");super(df/2,2);this.name="ChiSquare";this.df=df;}
}
class StudentT extends Distribution{
  constructor(df){if(!(df>0))throw new DistributionError("Student t df must be > 0");super("StudentT",{df:df},false);this.df=df;}
  pdf(x){const v=this.df;return Math.exp(logGamma((v+1)/2)-logGamma(v/2)-0.5*Math.log(v*Math.PI)-((v+1)/2)*Math.log1p(x*x/v));}
  cdf(x){if(x===0)return 0.5;const v=this.df,z=v/(v+x*x),ib=regularizedBeta(z,v/2,0.5);return x>0?1-0.5*ib:0.5*ib;}
  sf(x){if(x>=0){const v=this.df,z=v/(v+x*x);return 0.5*regularizedBeta(z,v/2,0.5);}return 1-this.cdf(x);}quantile(p){return invertCdf(this,p,-10,10);}mean(){return this.df>1?0:NaN;}variance(){return this.df>2?this.df/(this.df-2):this.df>1?Infinity:NaN;}sample(rng){return rng.normal()/Math.sqrt(new ChiSquare(this.df).sample(rng)/this.df);}
}
class FDistribution extends Distribution{
  constructor(d1,d2){if(!(d1>0&&d2>0))throw new DistributionError("F dfs must be > 0");super("F",{d1:d1,d2:d2},false);this.d1=d1;this.d2=d2;}
  pdf(x){if(x<=0)return 0;const a=this.d1/2,b=this.d2/2;return Math.exp(a*Math.log(this.d1/this.d2)+(a-1)*Math.log(x)-(a+b)*Math.log1p(this.d1*x/this.d2)-Math.log(betaFn(a,b)));}
  cdf(x){if(x<=0)return 0;return regularizedBeta((this.d1*x)/(this.d1*x+this.d2),this.d1/2,this.d2/2);}sf(x){if(x<=0)return 1;return regularizedBeta(this.d2/(this.d2+this.d1*x),this.d2/2,this.d1/2);}quantile(p){return invertCdf(this,p,0,10);}mean(){return this.d2>2?this.d2/(this.d2-2):Infinity;}variance(){const d1=this.d1,d2=this.d2;return d2>4?2*d2*d2*(d1+d2-2)/(d1*(d2-2)**2*(d2-4)):Infinity;}sample(rng){return (new ChiSquare(this.d1).sample(rng)/this.d1)/(new ChiSquare(this.d2).sample(rng)/this.d2);}
}

function twoSidedPFromT(t,df){const d=new StudentT(df);return clamp01(2*d.sf(Math.abs(t)));}
function meanCI(values,confidence){
  confidence=confidence===undefined?0.95:confidence;const x=values.map(numericValue).filter(v=>v!==null),s=describe(x);if(x.length<2)throw new InferenceError("Mean CI needs at least two observations");
  const alpha=1-confidence,tcrit=new StudentT(x.length-1).quantile(1-alpha/2),se=s.sdSample/Math.sqrt(x.length);
  return new ConfidenceInterval({estimate:s.mean,lower:s.mean-tcrit*se,upper:s.mean+tcrit*se,confidence:confidence,method:"one-sample t",df:x.length-1,se:se,n:x.length});
}
function oneSampleT(values,mu0,alternative){
  const x=values.map(numericValue).filter(v=>v!==null),s=describe(x);if(x.length<2)throw new InferenceError("One-sample t-test needs at least two observations");
  const se=s.sdSample/Math.sqrt(x.length);if(se===0)throw new InferenceError("Test is undefined for zero sample variance");
  const t=(s.mean-mu0)/se,dist=new StudentT(x.length-1);let p=alternative==="greater"?dist.sf(t):alternative==="less"?dist.cdf(t):twoSidedPFromT(t,x.length-1);
  return new HypothesisTest({null:"mu = "+mu0,alternative:alternative||"two-sided",statistic:t,distribution:"t",df:x.length-1,pValue:p,estimate:s.mean,se:se,n:x.length,method:"one-sample t"});
}
function welchT(a,b,alternative){
  const x=a.map(numericValue).filter(v=>v!==null),y=b.map(numericValue).filter(v=>v!==null),sx=describe(x),sy=describe(y);if(x.length<2||y.length<2)throw new InferenceError("Welch t-test needs at least two observations per group");
  const vx=sx.varianceSample/x.length,vy=sy.varianceSample/y.length,se=Math.sqrt(vx+vy);if(se===0)throw new InferenceError("Welch test undefined for zero variance");
  const t=(sx.mean-sy.mean)/se,df=(vx+vy)**2/(vx*vx/(x.length-1)+vy*vy/(y.length-1)),dist=new StudentT(df);
  const p=alternative==="greater"?dist.sf(t):alternative==="less"?dist.cdf(t):twoSidedPFromT(t,df);
  return new HypothesisTest({null:"mu1 - mu2 = 0",alternative:alternative||"two-sided",statistic:t,distribution:"t",df:df,pValue:p,estimate:sx.mean-sy.mean,se:se,n1:x.length,n2:y.length,method:"Welch two-sample t"});
}
function pairedT(dataset,a,b,alternative){
  const p=pairedNumeric(dataset,a,b),diff=p.map(x=>x.a-x.b),res=oneSampleT(diff,0,alternative);
  return new HypothesisTest({null:res.null,alternative:res.alternative,statistic:res.statistic,distribution:res.distribution,df:res.df,pValue:res.pValue,estimate:res.estimate,se:res.se,n:res.n,method:"paired t",pairs:p.length,excluded:dataset.rowCount-p.length});
}
function wilsonInterval(successes,n,confidence){
  if(!Number.isInteger(successes)||!Number.isInteger(n)||n<=0||successes<0||successes>n)throw new InferenceError("Invalid proportion counts");
  confidence=confidence===undefined?0.95:confidence;const ph=successes/n,z=normalQuantile(1-(1-confidence)/2),den=1+z*z/n,center=(ph+z*z/(2*n))/den,half=z*Math.sqrt(ph*(1-ph)/n+z*z/(4*n*n))/den;
  return new ConfidenceInterval({estimate:ph,lower:Math.max(0,center-half),upper:Math.min(1,center+half),confidence:confidence,method:"Wilson score",n:n,successes:successes});
}
function oneProportionZ(successes,n,p0,alternative){
  if(!Number.isInteger(successes)||!Number.isInteger(n)||n<=0||successes<0||successes>n||!(p0>0&&p0<1))throw new InferenceError("Invalid one-proportion test parameters");
  const ph=successes/n,se=Math.sqrt(p0*(1-p0)/n),z=(ph-p0)/se,dist=new Normal(0,1);
  const p=alternative==="greater"?dist.sf(z):alternative==="less"?dist.cdf(z):Math.min(1,2*dist.sf(Math.abs(z)));
  return new HypothesisTest({null:"p = "+p0,alternative:alternative||"two-sided",statistic:z,distribution:"normal",pValue:p,estimate:ph,se:se,n:n,successes:successes,method:"one-proportion z"});
}
function chiSquareGOF(observed,expected){
  if(observed.length!==expected.length||observed.length<2)throw new InferenceError("Chi-square GOF requires matching category counts");
  let stat=0,total=0;for(let i=0;i<observed.length;i++){if(!(expected[i]>0)||observed[i]<0)throw new InferenceError("Expected counts must be positive and observations non-negative");stat+=(observed[i]-expected[i])**2/expected[i];total+=observed[i];}
  const df=observed.length-1,p=new ChiSquare(df).sf(stat);return new HypothesisTest({statistic:stat,df:df,pValue:p,distribution:"chi-square",method:"chi-square goodness-of-fit",n:total,warning:expected.some(x=>x<5)?"Some expected counts are below 5":null});
}
function chiSquareIndependence(table){
  const r=table.length,c=r?table[0].length:0;if(r<2||c<2||table.some(row=>row.length!==c))throw new InferenceError("Chi-square independence requires at least a 2x2 table");
  const rs=table.map(row=>kahanSum(row)),cs=Array.from({length:c},(_,j)=>kahanSum(table.map(row=>row[j]))),n=kahanSum(rs);let stat=0,minExp=Infinity;
  for(let i=0;i<r;i++)for(let j=0;j<c;j++){const e=rs[i]*cs[j]/n;if(e<=0)throw new InferenceError("Expected count is zero");minExp=Math.min(minExp,e);stat+=(table[i][j]-e)**2/e;}
  const df=(r-1)*(c-1);return new HypothesisTest({statistic:stat,df:df,pValue:new ChiSquare(df).sf(stat),distribution:"chi-square",method:"chi-square independence",n:n,warning:minExp<5?"Some expected counts are below 5":null});
}

class RegressionModel{
  constructor(spec){Object.assign(this,spec);Object.freeze(this);}
  predict(row){
    const x=[this.intercept?1:null].filter(v=>v!==null);for(const name of this.predictors)x.push(Number(row[name]));return this.coefficients.reduce((s,b,i)=>s+b*x[i],0);
  }
}
function fitRegression(dataset,response,predictors,options){
  options=options||{};const intercept=options.intercept!==false,names=predictors.slice(),needed=[response].concat(names),cases=dataset.completeCases(needed);
  const rows=[];const y=[];const used=[];
  for(const row of cases){
    const yy=numericValue(row.values[0]),xx=row.values.slice(1).map(numericValue);if(yy===null||xx.some(v=>v===null))continue;
    rows.push((intercept?[1]:[]).concat(xx));y.push(yy);used.push(row.rowId);
  }
  if(rows.length===0)throw new RegressionError("No complete numeric cases for regression");
  const X=new LA.Matrix(rows),yv=new LA.Vector(y),ls=LA.leastSquares(X,yv,options),coef=ls.solution.values.map(M.toNumber),p=coef.length,n=rows.length,meanY=kahanSum(y)/n;
  let sse=0,sst=0;const fitted=[],resid=[];for(let i=0;i<n;i++){const fit=rows[i].reduce((s,x,j)=>s+x*coef[j],0),e=y[i]-fit;fitted.push(fit);resid.push(e);sse+=e*e;sst+=(y[i]-meanY)**2;}
  const r2=sst===0?1:1-sse/sst,dfResidual=n-ls.rank,rse=dfResidual>0?Math.sqrt(sse/dfResidual):NaN,adj=dfResidual>0?1-(1-r2)*(n-1)/dfResidual:NaN,warnings=[];
  if(ls.rank<p)warnings.push("Design matrix is rank deficient; coefficients use the SVD pseudoinverse.");
  let se=Array(p).fill(NaN),t=Array(p).fill(NaN),pv=Array(p).fill(NaN);
  if(dfResidual>0){
    const pinv=LA.pseudoinverse(X),P=pinv.matrix,Pt=P.transpose(),cov=P.multiply(Pt).scale(rse*rse);
    for(let j=0;j<p;j++){se[j]=Math.sqrt(Math.max(0,M.toNumber(cov.get(j,j))));if(se[j]>0){t[j]=coef[j]/se[j];pv[j]=twoSidedPFromT(t[j],dfResidual);}}
  }
  const coefficientNames=(intercept?["Intercept"]:[]).concat(names),units={};
  const yCol=dataset.column(response);coefficientNames.forEach((name,j)=>{if(j===0&&intercept)units[name]=yCol&&yCol.unit||null;else{const xCol=dataset.column(names[j-(intercept?1:0)]);units[name]=(yCol&&yCol.unit||"y")+"/"+(xCol&&xCol.unit||names[j-(intercept?1:0)]);}});
  return new RegressionModel({response:response,predictors:names,intercept:intercept,coefficientNames:coefficientNames,coefficients:coef,standardErrors:se,tStatistics:t,pValues:pv,n:n,rank:ls.rank,dfResidual:dfResidual,r2:r2,adjustedR2:adj,residualStandardError:rse,sse:sse,fitted:fitted,residuals:resid,rowIds:used,excluded:dataset.rowCount-n,conditionNumber:LA.conditionNumber(X),warnings:warnings,coefficientUnits:units,method:"SVD least squares"});
}
function fitPolynomial(dataset,xName,yName,degree,options){
  degree=Number(degree);if(!Number.isInteger(degree)||degree<1||degree>12)throw new RegressionError("Polynomial degree must be 1..12");
  const rows=dataset.completeCases([yName,xName]),x=[],y=[],ids=[];for(const row of rows){const yy=numericValue(row.values[0]),xx=numericValue(row.values[1]);if(yy!==null&&xx!==null){x.push(xx);y.push(yy);ids.push(row.rowId);}}
  const cols=[new DataColumn(yName,y),new DataColumn(xName,x)];for(let d=2;d<=degree;d++)cols.push(new DataColumn(xName+"^"+d,x.map(v=>v**d)));
  const temp=new Dataset(cols,ids),pred=[xName].concat(Array.from({length:degree-1},(_,i)=>xName+"^"+(i+2)));const model=fitRegression(temp,yName,pred,options);return model;
}

function histogramModel(values,options){
  options=options||{};const x=values.map(numericValue).filter(v=>v!==null);if(!x.length)throw new StatisticsError("EMPTY_SAMPLE","Histogram needs observations");
  const s=describe(x),n=x.length;let bins=options.bins;
  if(!bins){const iqr=s.iqr,h=iqr>0?2*iqr/Math.cbrt(n):0;bins=h>0?Math.max(1,Math.ceil((s.max-s.min)/h)):Math.max(1,Math.ceil(Math.sqrt(n)));}
  bins=Math.max(1,Math.min(500,Math.floor(bins)));const min=options.min!==undefined?options.min:s.min,max=options.max!==undefined?options.max:s.max,width=max===min?1:(max-min)/bins,counts=Array(bins).fill(0);
  for(const v of x){let i=max===min?0:Math.floor((v-min)/width);if(i===bins)i--;if(i>=0&&i<bins)counts[i]++;}
  return {type:"histogram",n:n,min:min,max:max,width:width,bins:counts.map((count,i)=>({lo:min+i*width,hi:i===bins-1?max:min+(i+1)*width,count:count,density:count/(n*width)})),quantileMethod:"R7"};
}
function boxPlotModel(values){
  const x=values.map(numericValue).filter(v=>v!==null),s=describe(x),lo=s.q1-1.5*s.iqr,hi=s.q3+1.5*s.iqr,out=x.filter(v=>v<lo||v>hi);
  return {type:"boxplot",n:x.length,min:s.min,q1:s.q1,median:s.median,q3:s.q3,max:s.max,lowerFence:lo,upperFence:hi,outliers:out,quantileMethod:"R7"};
}
function scatterModel(dataset,xName,yName){
  const p=pairedNumeric(dataset,xName,yName);return {type:"scatter",x:xName,y:yName,points:p.map(v=>({rowId:v.rowId,x:v.a,y:v.b})),excluded:dataset.rowCount-p.length};
}
function distributionPlotModel(distribution,range,points){
  points=points||160;let lo=range&&range[0],hi=range&&range[1];if(lo===undefined||hi===undefined){lo=distribution.discrete?Math.max(0,Math.floor(distribution.quantile(0.001))):distribution.quantile(0.001);hi=distribution.quantile(0.999);}
  const rows=[];if(distribution.discrete){for(let x=Math.ceil(lo);x<=Math.floor(hi);x++)rows.push({x:x,y:distribution.pmf(x)});}else{for(let i=0;i<points;i++){const x=lo+(hi-lo)*i/(points-1);rows.push({x:x,y:distribution.pdf(x)});}}
  return {type:"distribution",distribution:distribution.name,discrete:distribution.discrete,points:rows};
}

class StatisticsWorkerClient{
  constructor(url){this.url=url||"./statistics-worker.js";this.worker=null;this.seq=0;this.pending=new Map();}
  ensure(){if(this.worker)return this.worker;if(typeof Worker==="undefined")throw new StatisticsError("WORKER_UNAVAILABLE","Web Workers unavailable");const self=this;this.worker=new Worker(this.url);this.worker.onmessage=e=>{const m=e.data||{},p=self.pending.get(m.id);if(!p)return;self.pending.delete(m.id);m.ok?p.resolve(m.result):p.reject(new StatisticsError(m.error&&m.error.code||"WORKER_ERROR",m.error&&m.error.message||"Worker failed",m.error&&m.error.details));};this.worker.onerror=e=>{const err=new StatisticsError("WORKER_ERROR",e&&e.message||"Statistics worker failed");self.pending.forEach(p=>p.reject(err));self.pending.clear();if(self.worker){self.worker.terminate();self.worker=null;}};return this.worker;}
  run(task,payload){const w=this.ensure(),id=++this.seq,self=this;return new Promise((resolve,reject)=>{self.pending.set(id,{resolve:resolve,reject:reject});w.postMessage({id:id,task:task,payload:payload});});}
  cancelAll(){if(this.worker){this.worker.terminate();this.worker=null;}this.pending.forEach(p=>p.reject(new StatisticsError("CANCELLED","Statistics task cancelled")));this.pending.clear();}
}

global.CalcStatistics={
  VERSION:"1.0.0-statistics",
  Missing:Missing,isMissing:isMissing,DataColumn:DataColumn,Dataset:Dataset,Probability:Probability,Event:Event,FrequencyTable:FrequencyTable,RandomVariable:RandomVariable,ConfidenceInterval:ConfidenceInterval,HypothesisTest:HypothesisTest,parseDelimitedDataset:parseDelimitedDataset,
  StatisticsError:StatisticsError,DatasetError:DatasetError,DistributionError:DistributionError,InferenceError:InferenceError,RegressionError:RegressionError,
  describe:describe,quantile:quantile,median:median,weightedMean:weightedMean,frequencyExpanded:frequencyExpanded,
  covariance:covariance,pearson:pearson,spearman:spearman,covarianceMatrix:covarianceMatrix,correlationMatrix:correlationMatrix,
  logGamma:logGamma,gamma:gamma,regularizedGammaP:regularizedGammaP,regularizedGammaQ:regularizedGammaQ,betaFn:betaFn,regularizedBeta:regularizedBeta,erf:erf,erfc:erfc,normalQuantile:normalQuantile,
  SeededRNG:SeededRNG,Distribution:Distribution,Bernoulli:Bernoulli,Binomial:Binomial,Geometric:Geometric,NegativeBinomial:NegativeBinomial,Hypergeometric:Hypergeometric,Poisson:Poisson,Uniform:Uniform,Normal:Normal,Exponential:Exponential,GammaDistribution:GammaDistribution,BetaDistribution:BetaDistribution,ChiSquare:ChiSquare,StudentT:StudentT,FDistribution:FDistribution,
  meanCI:meanCI,oneSampleT:oneSampleT,welchT:welchT,pairedT:pairedT,wilsonInterval:wilsonInterval,oneProportionZ:oneProportionZ,chiSquareGOF:chiSquareGOF,chiSquareIndependence:chiSquareIndependence,
  RegressionModel:RegressionModel,fitRegression:fitRegression,fitPolynomial:fitPolynomial,
  histogramModel:histogramModel,boxPlotModel:boxPlotModel,scatterModel:scatterModel,distributionPlotModel:distributionPlotModel,
  StatisticsWorkerClient:StatisticsWorkerClient
};
})(window);