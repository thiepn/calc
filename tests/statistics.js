"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../linear-algebra.js");
require("../statistics.js");

const M=global.CalcMath;
const LA=global.CalcLinearAlgebra;
const S=global.CalcStatistics;

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,t,m){if(Math.abs(a-b)>t)throw new Error((m||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,m){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}

// Dataset parsing, row identity and explicit missingness.
const csv='name,x,y\n"a",1,3\n"b",2,5\n"c",,7\n"d",4,9';
const ds=S.Dataset.fromDelimited(csv);
eq(ds.rowCount,4,"dataset rows");
eq(ds.columnCount,3,"dataset columns");
eq(ds.column("x").type,"numeric","numeric inference");
eq(ds.column("x").missingCount(),1,"explicit missing count");
assert(S.isMissing(ds.column("x").get(2)),"missing sentinel retained");
eq(ds.completeCases(["x","y"]).length,3,"complete cases");
const sorted=ds.sortedBy("y","desc");
eq(sorted.rowIds[0],ds.rowIds[3],"sorting preserves row identity");
eq(sorted.column("name").get(0),"d","sorting keeps aligned columns");

const quoted=S.Dataset.fromDelimited('id,text\n1,"hello, world"\n2,"line1\nline2"');
eq(quoted.column("text").get(0),"hello, world","quoted delimiter");
eq(quoted.column("text").get(1),"line1\nline2","quoted newline");

const german=S.Dataset.fromDelimited("x;y\n1,5;2,75\n3,0;4,25");
approx(german.column("x").get(0),1.5,1e-12,"German decimal comma");
approx(german.column("y").get(1),4.25,1e-12,"German semicolon CSV");

const wire=JSON.parse(JSON.stringify(ds.toJSON()));
const restored=S.Dataset.fromJSON(wire);
eq(restored.rowCount,ds.rowCount,"dataset round trip rows");
assert(S.isMissing(restored.column("x").get(2)),"dataset round trip missing");

// Descriptive statistics and quantile convention.
const d=S.describe([1,2,3,4]);
eq(d.count,4,"describe count");
approx(d.mean,2.5,1e-12,"mean");
approx(d.median,2.5,1e-12,"median");
approx(d.q1,1.75,1e-12,"R7 q1");
approx(d.q3,3.25,1e-12,"R7 q3");
approx(d.varianceSample,5/3,1e-12,"sample variance");
approx(d.variancePopulation,1.25,1e-12,"population variance");
eq(d.quantileMethod,"R7","quantile convention");

const exact=S.describe([new M.Rational(1n,3n),new M.Rational(2n,3n)]);
eq(exact.exactMean.toString(),"1/2","exact Rational mean");

approx(S.weightedMean([1,2,3],[1,2,1]),2,1e-12,"weighted mean");
const ft=new S.FrequencyTable([1,2,3],[1,2,1]);
approx(ft.describe().mean,2,1e-12,"frequency expansion semantics");

// Paired covariance/correlation and row exclusion.
const pairDs=new S.Dataset([
  new S.DataColumn("x",[1,2,S.Missing,4,5]),
  new S.DataColumn("y",[2,4,6,8,10])
],["a","b","c","d","e"]);
const cov=S.covariance(pairDs,"x","y",true);
eq(cov.n,4,"paired covariance n");
eq(cov.excluded,1,"paired covariance excluded");
approx(S.pearson(pairDs,"x","y").value,1,1e-12,"Pearson correlation");
approx(S.spearman(pairDs,"x","y").value,1,1e-12,"Spearman correlation");
const cm=S.correlationMatrix(pairDs,["x","y"]);
approx(M.toNumber(cm.get(0,1)),1,1e-12,"correlation matrix");

// Special functions.
approx(S.gamma(5),24,1e-10,"gamma(5)");
approx(S.regularizedGammaP(2,1),1-2/Math.E,1e-10,"regularized gamma");
approx(S.regularizedBeta(0.5,2,3),0.6875,1e-10,"regularized beta");
approx(S.erf(0),0,1e-12,"erf zero");

// Probability objects.
const prob=new S.Probability(0.25);
approx(prob.complement().value,0.75,1e-12,"probability complement");
throwsCode(()=>new S.Probability(1.2),"INVALID_PROBABILITY","probability bounds");
const event=new S.Event("A",0.25);
eq(event.name,"A","event name");
approx(event.complement().probability.value,0.75,1e-12,"event complement");

// Distributions: PMF/PDF/CDF/SF/quantiles.
const bern=new S.Bernoulli(0.3);
approx(bern.pmf(1),0.3,1e-12,"Bernoulli pmf");
approx(bern.mean(),0.3,1e-12,"Bernoulli mean");

const bin=new S.Binomial(10,0.5);
approx(bin.pmf(5),0.24609375,1e-12,"Binomial pmf");
approx(bin.cdf(5),0.623046875,1e-10,"Binomial cdf");
approx(bin.sf(5),0.376953125,1e-10,"Binomial sf");
eq(bin.quantile(0.6),5,"Binomial discrete quantile");

const geo=new S.Geometric(0.25);
approx(geo.mean(),3,1e-12,"Geometric failures convention mean");
eq(geo.quantile(0.25),0,"Geometric quantile convention");

const nb=new S.NegativeBinomial(2,0.5);
approx(nb.pmf(0),0.25,1e-12,"Negative binomial pmf");
approx(nb.mean(),2,1e-12,"Negative binomial mean");

const hyp=new S.Hypergeometric(20,7,5);
approx(hyp.mean(),1.75,1e-12,"Hypergeometric mean");
approx(hyp.cdf(5),1,1e-12,"Hypergeometric support");

const pois=new S.Poisson(3);
approx(pois.pmf(2),0.22404180765538775,1e-12,"Poisson pmf");
approx(pois.cdf(2),0.42319008112684353,1e-10,"Poisson cdf");
approx(pois.sf(2),0.5768099188731565,1e-10,"Poisson sf");

const uni=new S.Uniform(-2,2);
approx(uni.cdf(0),0.5,1e-12,"Uniform cdf");
approx(uni.variance(),4/3,1e-12,"Uniform variance");

const norm=new S.Normal(0,1);
approx(norm.cdf(0),0.5,1e-8,"Normal cdf zero");
approx(norm.quantile(0.975),1.959963984540054,5e-7,"Normal quantile");
assert(norm.sf(8)>0,"Normal extreme upper tail remains nonzero");
approx(norm.sf(8),6.220960574e-16,2e-18,"Normal extreme tail");

const exp=new S.Exponential(2);
approx(exp.cdf(1),1-Math.exp(-2),1e-12,"Exponential cdf");
approx(exp.sf(1),Math.exp(-2),1e-12,"Exponential sf");

const gam=new S.GammaDistribution(2,3);
approx(gam.mean(),6,1e-12,"Gamma mean");
approx(gam.variance(),18,1e-12,"Gamma variance");
approx(gam.cdf(3),1-2/Math.E,1e-10,"Gamma cdf");

const beta=new S.BetaDistribution(2,3);
approx(beta.mean(),0.4,1e-12,"Beta mean");
approx(beta.cdf(0.5),0.6875,1e-10,"Beta cdf");
approx(beta.sf(0.5),0.3125,1e-10,"Beta direct sf");

const chi=new S.ChiSquare(2);
approx(chi.cdf(2),1-Math.exp(-1),1e-10,"Chi-square cdf");

const td=new S.StudentT(10);
approx(td.cdf(0),0.5,1e-12,"t cdf zero");
approx(td.quantile(0.975),2.2281388519649385,2e-6,"t quantile");
assert(td.sf(12)>0,"Student t tail remains nonzero");

const fd=new S.FDistribution(5,5);
approx(fd.cdf(1),0.5,1e-10,"F symmetry cdf");
approx(fd.sf(1),0.5,1e-10,"F direct sf");

const rv=new S.RandomVariable("X",bin);
approx(rv.mean(),5,1e-12,"RandomVariable mean");
assert(rv.cdf(5) instanceof S.Probability,"RandomVariable returns Probability");

// Seeded sampling reproducibility.
const rng1=new S.SeededRNG(12345),rng2=new S.SeededRNG(12345);
const sample1=norm.sampleN(20,rng1),sample2=norm.sampleN(20,rng2);
eq(JSON.stringify(sample1),JSON.stringify(sample2),"seeded RNG reproducibility");
assert(sample1.every(Number.isFinite),"seeded sample finite");

// Confidence intervals and hypothesis tests.
const ci=S.meanCI([1,2,3,4],0.95);
assert(ci instanceof S.ConfidenceInterval,"typed mean CI");
approx(ci.estimate,2.5,1e-12,"mean CI estimate");
assert(ci.contains(2.5),"CI contains estimate");

const t1=S.oneSampleT([1,2,3,4],0);
assert(t1 instanceof S.HypothesisTest,"typed t-test");
approx(t1.statistic,3.872983346207417,1e-10,"one-sample t statistic");
approx(t1.pValue.value,0.030466291662170977,5e-6,"one-sample t p-value");

const wt=S.welchT([1,2,3],[4,5,6]);
approx(wt.statistic,-3.6742346141747673,1e-10,"Welch statistic");
approx(wt.df,4,1e-10,"Welch df");
approx(wt.pValue.value,0.021311641128756727,5e-6,"Welch p");

const pairedDs=new S.Dataset([new S.DataColumn("before",[5,6,7,8]),new S.DataColumn("after",[4,5,5,7])]);
const pt=S.pairedT(pairedDs,"before","after");
eq(pt.method,"paired t","paired test method");
eq(pt.pairs,4,"paired test count");

const wil=S.wilsonInterval(5,10,0.95);
approx(wil.estimate,0.5,1e-12,"Wilson estimate");
approx(wil.lower,0.2365930905,5e-7,"Wilson lower");
approx(wil.upper,0.7634069095,5e-7,"Wilson upper");
const propz=S.oneProportionZ(60,100,0.5);
approx(propz.statistic,2,1e-12,"one-proportion z statistic");
approx(propz.pValue.value,0.04550026,5e-6,"one-proportion z p");

const gof=S.chiSquareGOF([10,20,30],[20,20,20]);
approx(gof.statistic,10,1e-12,"chi-square GOF statistic");
approx(gof.pValue.value,Math.exp(-5),1e-10,"chi-square GOF p");

const ind=S.chiSquareIndependence([[10,20],[20,10]]);
approx(ind.statistic,20/3,1e-12,"chi-square independence statistic");
approx(ind.pValue.value,0.0098232745,5e-7,"chi-square independence p");

// Regression through Phase 5 SVD backend.
const regDs=new S.Dataset([
  new S.DataColumn("x",[1,2,3,4]),
  new S.DataColumn("y",[3,5,7,9])
],["r1","r2","r3","r4"]);
const reg=S.fitRegression(regDs,"y",["x"]);
eq(reg.method,"SVD least squares","regression backend");
approx(reg.coefficients[0],1,1e-10,"regression intercept");
approx(reg.coefficients[1],2,1e-10,"regression slope");
approx(reg.r2,1,1e-12,"regression R2");
eq(reg.rank,2,"regression rank");
eq(JSON.stringify(reg.rowIds),JSON.stringify(["r1","r2","r3","r4"]),"regression row provenance");

const rankDef=new S.Dataset([
  new S.DataColumn("x1",[1,2,3,4]),
  new S.DataColumn("x2",[2,4,6,8]),
  new S.DataColumn("y",[1,2,3,4])
]);
const rd=S.fitRegression(rankDef,"y",["x1","x2"]);
assert(rd.rank<3,"rank deficiency detected");
assert(rd.warnings.some(w=>w.includes("rank deficient")),"rank deficiency warning");

const polyDs=new S.Dataset([new S.DataColumn("x",[-2,-1,0,1,2]),new S.DataColumn("y",[4,1,0,1,4])]);
const pr=S.fitPolynomial(polyDs,"x","y",2);
approx(pr.coefficients[0],0,1e-9,"poly intercept");
approx(pr.coefficients[1],0,1e-9,"poly linear");
approx(pr.coefficients[2],1,1e-9,"poly quadratic");

// Visualization models share statistical semantics.
const hist=S.histogramModel([1,2,3,4,5,6,7,8,9,10],{bins:5});
eq(hist.bins.reduce((s,b)=>s+b.count,0),10,"histogram counts total");
approx(hist.bins.reduce((s,b)=>s+b.density*hist.width,0),1,1e-12,"histogram density area");

const box=S.boxPlotModel([1,2,3,4,5,100]);
approx(box.q1,S.quantile([1,2,3,4,5,100],0.25),1e-12,"boxplot q1 uses R7");
eq(box.quantileMethod,"R7","boxplot quantile convention");
assert(box.outliers.includes(100),"boxplot outlier");

const sc=S.scatterModel(pairDs,"x","y");
eq(sc.points.length,4,"scatter complete pairs");
eq(sc.points[0].rowId,"a","scatter preserves row id");

const distModel=S.distributionPlotModel(new S.Binomial(4,0.5));
assert(distModel.discrete&&distModel.points.length>0,"discrete distribution model");

// Correlation/covariance return Phase 5 Matrix objects.
const covM=S.covarianceMatrix(regDs,["x","y"]);
assert(covM instanceof LA.Matrix,"covariance matrix type");

// Property checks: CDF monotonic/bounded and quantile round trips.
const distributions=[new S.Normal(0,1),new S.Exponential(2),new S.GammaDistribution(3,2),new S.BetaDistribution(2,5),new S.StudentT(8),new S.FDistribution(4,9)];
for(const dist of distributions){
  let prev=0;for(let i=0;i<=50;i++){const p=i/50,x=dist.quantile(Math.min(0.999999,Math.max(0.000001,p))),cdf=dist.cdf(x);assert(cdf>=0&&cdf<=1,dist.name+" cdf bounded");assert(cdf+1e-10>=prev,dist.name+" cdf monotone");prev=cdf;}
  for(const p of [0.01,0.1,0.5,0.9,0.99]){const x=dist.quantile(p);approx(dist.cdf(x),p,2e-5,dist.name+" quantile round trip "+p);}
}

// Discrete quantile definition: inf{x : F(x) >= p}.
for(const dist of [new S.Binomial(12,0.3),new S.Poisson(4),new S.Geometric(0.2)]){
  for(const p of [0.1,0.5,0.9]){const q=dist.quantile(p);assert(dist.cdf(q)>=p-1e-12,dist.name+" quantile upper condition");if(q>0)assert(dist.cdf(q-1)<p+1e-12,dist.name+" quantile infimum condition");}
}

console.log("Probability Statistics and Data V2 certification tests passed");
