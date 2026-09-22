"use strict";
global.window=global;
require("../math.js");
require("../calculus.js");
require("../units.js");
require("../tools.js");

const M=global.CalcMath;
const T=global.CalcTools;

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,t,m){if(Math.abs(a-b)>t)throw new Error((m||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,m){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}

// Registry integrity and discovery.
assert(T.validateRegistry(),"tool registry valid");
assert(T.REGISTRY.list().length>=35,"meaningful enabled tool count");
eq(T.REGISTRY.get("percentage-of").name,"Percentage of value","registry lookup");
eq(T.REGISTRY.get("percent").id,"percentage-of","alias lookup");
assert(T.REGISTRY.search("loan").some(t=>t.id==="loan"),"registry search");
assert(T.REGISTRY.search("modular").some(t=>t.id==="modular-inverse"),"number theory search");

// Every generic enabled tool must execute deterministically using its declared defaults.
for(const tool of T.REGISTRY.list()){
  if(tool.specialized)continue;
  const raw={};for(const input of tool.inputs)if(input.default!==undefined)raw[input.id]=input.default;
  let a,b;
  try{a=T.REGISTRY.execute(tool.id,raw,{});b=T.REGISTRY.execute(tool.id,raw,{});}
  catch(e){throw new Error("Registry default example failed for "+tool.id+": "+e.code+" / "+e.message);}
  assert(a.toolResult&&a.toolId===tool.id,"tool result envelope "+tool.id);
  eq(a.display,b.display,"deterministic tool result "+tool.id);
}

// FormulaRelation solve-any-unknown contract.
const rel=new T.FormulaRelation({
  id:"sum",variables:{a:{},b:{},c:{}},
  solvers:{a:v=>v.c-v.b,b:v=>v.c-v.a,c:v=>v.a+v.b}
});
eq(rel.solve({a:2,b:3,c:""}).value,5,"relation solves c");
eq(rel.solve({a:"",b:3,c:5}).value,2,"relation solves a");
throwsCode(()=>rel.solve({a:"",b:"",c:5}),"TOOL_DOMAIN_ERROR","relation underdetermined");

// Money semantics.
const eur=T.Money.fromMajor(12.34,"EUR"),eur2=T.Money.fromMajor(1.66,"EUR");
eq(eur.add(eur2).toString(),"EUR 14.00","same-currency money addition");
eq(T.Money.fromJSON(JSON.parse(JSON.stringify(eur.toJSON()))).toString(),"EUR 12.34","money serialization");
throwsCode(()=>eur.add(T.Money.fromMajor(1,"USD")),"FINANCE_ERROR","cross-currency arithmetic blocked");
eq(T.Money.fromMajor(123.6,"JPY").toString(),"JPY 124","currency-specific rounding");

// Everyday tools.
eq(T.REGISTRY.execute("percentage-of",{value:200,percent:15}).display,"30","percentage of");
eq(T.REGISTRY.execute("percent-change",{old:100,new:120}).value,20,"percentage change");
throwsCode(()=>T.REGISTRY.execute("percent-change",{old:0,new:1}),"TOOL_DOMAIN_ERROR","percent change zero base");
approx(T.REGISTRY.execute("reverse-percent",{final:120,percent:20,direction:"increase"}).value,100,1e-12,"reverse percentage");
approx(T.REGISTRY.execute("ratio",{a:2,b:3,c:10}).value,15,1e-12,"proportion");
eq(T.REGISTRY.execute("fraction-percent",{numerator:"1",denominator:"3"}).value.toString(),"1/3","fraction exactness");
eq(T.REGISTRY.execute("split-tip",{bill:100,tip:20,people:3,currency:"EUR"}).value.toString(),"EUR 40.00","split/tip practical rounding");

// Finance.
approx(T.compoundFutureValue(1000,0.05,1,1,false),1050,1e-12,"compound interest annual");
approx(T.compoundFutureValue(1000,0.05,1,1,true),1000*Math.exp(0.05),1e-12,"continuous compound");
approx(T.presentValue(1050,0.05,1,1),1000,1e-12,"present value inverse");
approx(T.annuityPayment(1200,0,12,"ordinary"),100,1e-12,"zero-rate annuity");

const loan=T.loanSchedule(1200,0,1,12);
approx(loan.payment,100,1e-12,"zero-rate loan payment");
approx(loan.schedule[loan.schedule.length-1].balance,0,1e-12,"loan final balance reconciles");
approx(loan.schedule.reduce((s,x)=>s+x.payment,0),loan.totalPaid,1e-9,"loan schedule total reconciles");

eq(T.npv(0,[-100,40,70]),10,"NPV zero rate equals cash-flow sum");
const irr=T.irrAll([-100,110]);
assert(irr.length===1,"single IRR");
approx(irr[0],0.1,1e-8,"IRR reference");
const noIrr=T.irrAll([100,10,10]);
eq(noIrr.length,0,"no IRR explicit");

approx(T.REGISTRY.execute("cagr",{start:100,end:200,years:5}).value,Math.pow(2,0.2)-1,1e-12,"CAGR");
approx(T.REGISTRY.execute("roi",{cost:100,gain:130}).value,0.3,1e-12,"ROI");
const mm=T.REGISTRY.execute("margin-markup",{cost:80,price:100}).value;
approx(mm.markup,0.25,1e-12,"markup 25%");
approx(mm.margin,0.20,1e-12,"margin 20%");
approx(T.REGISTRY.execute("break-even",{fixed:10000,price:50,variable:30}).value,500,1e-12,"break-even units");

// Calendar/date model.
assert(T.leapYear(2000),"2000 leap year");
assert(!T.leapYear(1900),"1900 not leap year");
eq(T.daysInMonth(2024,2),29,"leap February");
const leap=T.DateValue.parse("2024-02-29");
eq(T.addCalendarPeriod(leap,new T.CalendarPeriod(1,0,0)).toString(),"2025-02-28","leap-date year clamp");
const jan31=T.DateValue.parse("2025-01-31");
eq(T.addCalendarPeriod(jan31,new T.CalendarPeriod(0,1,0)).toString(),"2025-02-28","month clamp");
eq(T.addCalendarPeriod(jan31,new T.CalendarPeriod(0,2,0)).toString(),"2025-03-31","direct two-month clamp");
const chained=T.addCalendarPeriod(T.addCalendarPeriod(jan31,new T.CalendarPeriod(0,1,0)),new T.CalendarPeriod(0,1,0));
eq(chained.toString(),"2025-03-28","calendar addition chaining semantics explicit");

eq(T.elapsedDays("2026-01-01","2026-01-02"),1,"elapsed day");
eq(T.calendarDifference("2000-01-01","2026-09-22").toString(),"26y 8m 21d","calendar difference");
eq(T.weekday("2026-09-22"),"Tuesday","weekday");
const iw=T.isoWeek("2026-01-01");
eq(iw.year,2026,"ISO week-year");eq(iw.week,1,"ISO week number");
eq(T.businessDays("2026-09-21","2026-09-28",[]),5,"business days Mon-to-Mon");
eq(T.businessDays("2026-09-21","2026-09-28",["2026-09-23"]),4,"holiday exclusion");
throwsCode(()=>T.DateValue.parse("2026-02-30"),"DATE_TOOL_ERROR","invalid date rejected");

// Triangle geometry.
let tris=T.solveTriangle({a:3,b:4,c:5});
eq(tris.length,1,"SSS one solution");
approx(tris[0].C,90,1e-10,"3-4-5 right angle");
approx(tris[0].area,6,1e-12,"3-4-5 area");

tris=T.solveTriangle({a:3,b:4,c:null,A:null,B:null,C:90});
eq(tris.length,1,"SAS solution");
approx(tris[0].c,5,1e-12,"SAS missing side");

tris=T.solveTriangle({a:5,b:null,c:null,A:30,B:60,C:null});
eq(tris.length,1,"ASA/AAS solution");
approx(tris[0].C,90,1e-12,"ASA third angle");
approx(tris[0].c,10,1e-10,"ASA scale");

tris=T.solveTriangle({a:5,b:8,c:null,A:30,B:null,C:null});
eq(tris.length,2,"SSA ambiguous two solutions");
assert(tris.every(t=>Math.abs(t.A+t.B+t.C-180)<1e-8),"SSA angle sums");

tris=T.solveTriangle({a:5,b:11,c:null,A:30,B:null,C:null});
eq(tris.length,0,"SSA impossible zero solutions");

const circle=T.REGISTRY.execute("circle",{radius:3}).value;
approx(circle.area,9*Math.PI,1e-12,"circle area");
const rect=T.REGISTRY.execute("rectangle",{width:3,height:4}).value;
approx(rect.diagonal,5,1e-12,"rectangle diagonal");

const line1=T.Line2D.through(0,0,0,4),line2=T.Line2D.through(-1,2,1,2),hit=line1.intersection(line2);
approx(hit.x,0,1e-12,"vertical line intersection x");
approx(hit.y,2,1e-12,"vertical line intersection y");
eq(line1.slope(),null,"vertical slope undefined");

// Fixed-width programmer semantics.
let bits=T.BitInteger.parse("FF",16,8,true);
eq(bits.raw,255n,"raw 8-bit FF");
eq(bits.value(),-1n,"signed two's complement interpretation");
eq(bits.not().format(16),"0","masked NOT");
eq(T.BitInteger.parse("80",16,8,true).shrArithmetic(1).format(16),"c0","arithmetic right shift");
eq(T.BitInteger.parse("80",16,8,true).shrLogical(1).format(16),"40","logical right shift");
eq(T.BitInteger.parse("81",16,8,true).rol(1).format(16),"3","rotate left wraps");
eq(T.BitInteger.parse("1",16,8,true).ror(1).format(16),"80","rotate right wraps");
eq(T.BitInteger.parse("FF",16,8,true).add(T.BitInteger.parse("02",16,8,true)).format(16),"1","width-aware addition wraps");

// Number theory.
const eg=T.extGcd(240n,46n);
eq(eg.gcd,2n,"extended gcd");
eq(240n*eg.x+46n*eg.y,2n,"Bézout identity");
eq(T.mod(-1n,5n),4n,"canonical modulus");
eq(T.modInverse(3n,11n),4n,"mod inverse");
const crt=T.crt([{a:2n,m:3n},{a:3n,m:5n}]);
eq(crt.x,8n,"CRT solution");eq(crt.modulus,15n,"CRT modulus");
const crtCompat=T.crt([{a:2n,m:4n},{a:6n,m:8n}]);
eq(crtCompat.x,6n,"compatible non-coprime CRT");eq(crtCompat.modulus,8n,"LCM modulus CRT");
throwsCode(()=>T.crt([{a:1n,m:2n},{a:0n,m:2n}]),"TOOL_DOMAIN_ERROR","inconsistent CRT");
assert(T.isPrime(2n)&&T.isPrime(104729n),"primes detected");
assert(!T.isPrime(1n)&&!T.isPrime(104728n),"composites detected");
eq(T.primeFactors(360n).join(","),"2,2,2,3,3,5","prime factors");
eq(T.divisors(12n).join(","),"1,2,3,4,6,12","divisors");

// Specialized tools are present in the same registry even though their UI runtime is custom.
assert(T.REGISTRY.get("unit-converter").specialized,"unit converter registered specialized");
assert(T.REGISTRY.get("engineering-relations").specialized,"engineering registered specialized");

console.log("Specialized calculators V2 certification tests passed");
