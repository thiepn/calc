(function(global){
"use strict";

const M=global.CalcMath;
const C=global.CalcCalculus;
const U=global.CalcUnits;
if(!M||!C||!U)throw new Error("CalcMath, CalcCalculus and CalcUnits must load before CalcTools");

class ToolError extends M.CalcError{
  constructor(code,message,details){super(code||"TOOL_ERROR",message,undefined,undefined,details);}
}
class ToolInputError extends ToolError{constructor(message,details){super("TOOL_INPUT_ERROR",message,details);}}
class ToolDomainError extends ToolError{constructor(message,details){super("TOOL_DOMAIN_ERROR",message,details);}}
class FinanceError extends ToolError{constructor(message,details){super("FINANCE_ERROR",message,details);}}
class DateToolError extends ToolError{constructor(message,details){super("DATE_TOOL_ERROR",message,details);}}
class ProgrammerError extends ToolError{constructor(message,details){super("PROGRAMMER_ERROR",message,details);}}
class GeometryError extends ToolError{constructor(message,details){super("GEOMETRY_ERROR",message,details);}}

function finite(v,name){
  const n=Number(v);if(!Number.isFinite(n))throw new ToolInputError((name||"Value")+" must be finite");return n;
}
function positive(v,name,allowZero){
  const n=finite(v,name);if(allowZero?n<0:n<=0)throw new ToolInputError((name||"Value")+" must be "+(allowZero?"non-negative":"positive"));return n;
}
function integer(v,name,min){
  const n=Number(v);if(!Number.isInteger(n)||(min!==undefined&&n<min))throw new ToolInputError((name||"Value")+" must be an integer"+(min!==undefined?" ≥ "+min:""));return n;
}
function pct(v){return finite(v,"Percentage")/100;}
function fmt(v,p){return typeof v==="bigint"?v.toString():M.formatNumber(Number(v),p||12);}
function gcdBig(a,b){return M.gcdBig(BigInt(a),BigInt(b));}
function lcmBig(a,b){return M.lcmBig(BigInt(a),BigInt(b));}

const CURRENCY_DIGITS=Object.freeze({EUR:2,USD:2,GBP:2,CHF:2,JPY:0,KRW:0,CNY:2,CAD:2,AUD:2,KWD:3});
class Money{
  constructor(minor,currency){currency=String(currency||"EUR").toUpperCase();this.currency=currency;this.digits=CURRENCY_DIGITS[currency]===undefined?2:CURRENCY_DIGITS[currency];this.minor=BigInt(minor);Object.freeze(this);}
  static fromMajor(value,currency){
    currency=String(currency||"EUR").toUpperCase();const digits=CURRENCY_DIGITS[currency]===undefined?2:CURRENCY_DIGITS[currency],scale=Math.pow(10,digits),n=finite(value,"Money");
    return new Money(BigInt(Math.round(n*scale)),currency);
  }
  major(){return Number(this.minor)/Math.pow(10,this.digits);}
  assertCurrency(other){if(!(other instanceof Money)||other.currency!==this.currency)throw new FinanceError("Money arithmetic requires the same currency",{left:this.currency,right:other&&other.currency});}
  add(other){this.assertCurrency(other);return new Money(this.minor+other.minor,this.currency);}
  sub(other){this.assertCurrency(other);return new Money(this.minor-other.minor,this.currency);}
  multiply(k){return Money.fromMajor(this.major()*finite(k),this.currency);}
  toString(){return this.currency+" "+this.major().toFixed(this.digits);}
  toJSON(){return {type:"money",minor:this.minor.toString(),currency:this.currency};}
  static fromJSON(d){return new Money(BigInt(d.minor),d.currency);}
}

class DateValue{
  constructor(year,month,day){
    this.year=integer(year,"Year");this.month=integer(month,"Month",1);this.day=integer(day,"Day",1);
    if(this.month>12||this.day>daysInMonth(this.year,this.month))throw new DateToolError("Invalid calendar date");
    Object.freeze(this);
  }
  static parse(s){
    const m=String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)throw new DateToolError("Date must use YYYY-MM-DD");
    return new DateValue(Number(m[1]),Number(m[2]),Number(m[3]));
  }
  epochDay(){return Math.floor(Date.UTC(this.year,this.month-1,this.day)/86400000);}
  add(period){return addCalendarPeriod(this,period);}
  toString(){return String(this.year).padStart(4,"0")+"-"+String(this.month).padStart(2,"0")+"-"+String(this.day).padStart(2,"0");}
}
class CalendarPeriod{
  constructor(years,months,days){this.years=integer(years||0,"Years");this.months=integer(months||0,"Months");this.days=integer(days||0,"Days");Object.freeze(this);}
  toString(){return [this.years&&this.years+"y",this.months&&this.months+"m",this.days&&this.days+"d"].filter(Boolean).join(" ")||"0d";}
}
class Duration{
  constructor(days){this.days=finite(days,"Duration days");Object.freeze(this);}
  toString(){return fmt(this.days)+" days";}
}
function leapYear(y){return y%4===0&&(y%100!==0||y%400===0);}
function daysInMonth(y,m){return [31,leapYear(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1];}
function addCalendarPeriod(date,period){
  if(!(date instanceof DateValue))date=DateValue.parse(date);if(!(period instanceof CalendarPeriod))period=new CalendarPeriod(period.years,period.months,period.days);
  let y=date.year+period.years,total=(date.month-1)+period.months;y+=Math.floor(total/12);let m=((total%12)+12)%12+1,d=Math.min(date.day,daysInMonth(y,m));
  const base=new DateValue(y,m,d),ms=Date.UTC(base.year,base.month-1,base.day)+period.days*86400000,dt=new Date(ms);
  return new DateValue(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());
}
function elapsedDays(a,b){a=a instanceof DateValue?a:DateValue.parse(a);b=b instanceof DateValue?b:DateValue.parse(b);return b.epochDay()-a.epochDay();}
function calendarDifference(a,b){
  a=a instanceof DateValue?a:DateValue.parse(a);b=b instanceof DateValue?b:DateValue.parse(b);let sign=1;if(b.epochDay()<a.epochDay()){const t=a;a=b;b=t;sign=-1;}
  let years=b.year-a.year,anchor=addCalendarPeriod(a,new CalendarPeriod(years,0,0));if(anchor.epochDay()>b.epochDay()){years--;anchor=addCalendarPeriod(a,new CalendarPeriod(years,0,0));}
  let months=(b.year-anchor.year)*12+(b.month-anchor.month),anchor2=addCalendarPeriod(anchor,new CalendarPeriod(0,months,0));if(anchor2.epochDay()>b.epochDay()){months--;anchor2=addCalendarPeriod(anchor,new CalendarPeriod(0,months,0));}
  const days=elapsedDays(anchor2,b);return {sign:sign,years:years,months:months,days:days,toString:function(){return (sign<0?"−":"")+years+"y "+months+"m "+days+"d";}};
}
function weekday(date){date=date instanceof DateValue?date:DateValue.parse(date);return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(Date.UTC(date.year,date.month-1,date.day)).getUTCDay()];}
function isoWeek(date){
  date=date instanceof DateValue?date:DateValue.parse(date);const d=new Date(Date.UTC(date.year,date.month-1,date.day)),day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear(),start=new Date(Date.UTC(year,0,1)),week=Math.ceil((((d-start)/86400000)+1)/7);return {year:year,week:week};
}
function businessDays(a,b,holidays){
  a=a instanceof DateValue?a:DateValue.parse(a);b=b instanceof DateValue?b:DateValue.parse(b);const sign=b.epochDay()>=a.epochDay()?1:-1,start=sign>0?a:b,end=sign>0?b:a,holidaySet=new Set((holidays||[]).filter(Boolean).map(String));let count=0;
  for(let day=start.epochDay();day<end.epochDay();day++){const d=new Date(day*86400000),dow=d.getUTCDay(),iso=d.toISOString().slice(0,10);if(dow!==0&&dow!==6&&!holidaySet.has(iso))count++;}
  return sign*count;
}

function pow10Big(n){return 10n**BigInt(n);}
class BitInteger{
  constructor(raw,width,signed){
    width=integer(width,"Bit width",1);if(width>256)throw new ProgrammerError("Bit width is limited to 256");
    this.width=width;this.signed=!!signed;this.modulus=1n<<BigInt(width);this.mask=this.modulus-1n;this.raw=((BigInt(raw)%this.modulus)+this.modulus)%this.modulus;Object.freeze(this);
  }
  static parse(text,base,width,signed){base=integer(base,"Base",2);if(![2,8,10,16].includes(base))throw new ProgrammerError("Base must be 2, 8, 10, or 16");return new BitInteger(M.parseBigIntBase(String(text),base),width,signed);}
  value(){return this.signed&&this.raw>=(1n<<BigInt(this.width-1))?this.raw-this.modulus:this.raw;}
  withRaw(raw){return new BitInteger(raw,this.width,this.signed);}
  and(b){return this.withRaw(this.raw&this.assert(b).raw);}or(b){return this.withRaw(this.raw|this.assert(b).raw);}xor(b){return this.withRaw(this.raw^this.assert(b).raw);}not(){return this.withRaw((~this.raw)&this.mask);}
  shl(n){n=this.shiftCount(n);return this.withRaw((this.raw<<BigInt(n))&this.mask);}
  shrLogical(n){n=this.shiftCount(n);return this.withRaw(this.raw>>BigInt(n));}
  shrArithmetic(n){n=this.shiftCount(n);return this.withRaw(this.value()>>BigInt(n));}
  rol(n){n=this.shiftCount(n)%this.width;if(n===0)return this;const k=BigInt(n),w=BigInt(this.width);return this.withRaw(((this.raw<<k)|(this.raw>>(w-k)))&this.mask);}
  ror(n){n=this.shiftCount(n)%this.width;if(n===0)return this;const k=BigInt(n),w=BigInt(this.width);return this.withRaw(((this.raw>>k)|(this.raw<<(w-k)))&this.mask);}
  add(b){return this.withRaw(this.raw+this.assert(b).raw);}sub(b){return this.withRaw(this.raw-this.assert(b).raw);}mul(b){return this.withRaw(this.raw*this.assert(b).raw);}
  assert(b){if(!(b instanceof BitInteger)||b.width!==this.width||b.signed!==this.signed)throw new ProgrammerError("Bit operands must have matching width and signedness");return b;}
  shiftCount(n){n=integer(n,"Shift count",0);if(n>this.width*4)throw new ProgrammerError("Shift count is unreasonably large");return n;}
  format(base){return M.formatBase(this.raw,base,base===2?this.width:undefined);}
  toJSON(){return {type:"bit-integer",raw:this.raw.toString(),width:this.width,signed:this.signed};}
}

function extGcd(a,b){a=BigInt(a);b=BigInt(b);let oldR=a,r=b,oldS=1n,s=0n,oldT=0n,t=1n;while(r!==0n){const q=oldR/r;[oldR,r]=[r,oldR-q*r];[oldS,s]=[s,oldS-q*s];[oldT,t]=[t,oldT-q*t];}if(oldR<0n){oldR=-oldR;oldS=-oldS;oldT=-oldT;}return {gcd:oldR,x:oldS,y:oldT};}
function mod(a,m){a=BigInt(a);m=BigInt(m);if(m<=0n)throw new ToolDomainError("Modulus must be positive");return ((a%m)+m)%m;}
function modInverse(a,m){const e=extGcd(mod(a,m),BigInt(m));if(e.gcd!==1n)throw new ToolDomainError("Modular inverse does not exist",{gcd:e.gcd.toString()});return mod(e.x,m);}
function crt(congruences){
  if(!congruences.length)throw new ToolInputError("CRT needs at least one congruence");let x=0n,Mm=1n;
  for(const c of congruences){const a=BigInt(c.a),m=BigInt(c.m);if(m<=0n)throw new ToolDomainError("CRT moduli must be positive");const g=gcdBig(Mm,m),delta=a-x;if(delta%g!==0n)throw new ToolDomainError("Congruences are inconsistent");const m2=m/g,k=mod((delta/g)*modInverse(Mm/g,m2),m2);x+=Mm*k;Mm*=m2;x=mod(x,Mm);}
  return {x:x,modulus:Mm};
}
function modPow(a,e,m){a=mod(a,m);e=BigInt(e);let r=1n;while(e>0n){if(e&1n)r=r*a%m;a=a*a%m;e>>=1n;}return r;}
function isPrime(n){n=BigInt(n);if(n<2n)return false;for(const p of [2n,3n,5n,7n,11n,13n,17n,19n,23n,29n,31n,37n]){if(n===p)return true;if(n%p===0n)return false;}let d=n-1n,s=0;while((d&1n)===0n){d>>=1n;s++;}const bases=n<341550071728321n?[2n,3n,5n,7n,11n,13n,17n]:[2n,325n,9375n,28178n,450775n,9780504n,1795265022n];for(let a of bases){a%=n;if(a===0n)continue;let x=modPow(a,d,n);if(x===1n||x===n-1n)continue;let witness=true;for(let r=1;r<s;r++){x=x*x%n;if(x===n-1n){witness=false;break;}}if(witness)return false;}return true;}
function primeFactors(n,limit){
  n=BigInt(n);limit=limit||1000000;if(n===0n)throw new ToolDomainError("Zero has no finite prime factorization");const out=[];if(n<0n){out.push(-1n);n=-n;}let p=2n,steps=0;while(p*p<=n){while(n%p===0n){out.push(p);n/=p;}p=p===2n?3n:p+2n;if(++steps>limit)throw new ToolError("COMPLEXITY_LIMIT","Factorization exceeded trial-division budget");}if(n>1n)out.push(n);return out;}
function divisors(n){n=BigInt(n);if(n===0n)throw new ToolDomainError("Zero has infinitely many divisors");n=n<0n?-n:n;const fs=primeFactors(n),counts=new Map();for(const p of fs)if(p>0n)counts.set(p,(counts.get(p)||0)+1);let out=[1n];for(const [p,c] of counts){const base=out.slice();let pow=1n;for(let k=1;k<=c;k++){pow*=p;for(const v of base)out.push(v*pow);}}return out.sort((a,b)=>a<b?-1:a>b?1:0);}

class Line2D{
  constructor(a,b,c){this.a=finite(a);this.b=finite(b);this.c=finite(c);if(Math.hypot(this.a,this.b)===0)throw new GeometryError("Line coefficients a and b cannot both be zero");Object.freeze(this);}
  static through(x1,y1,x2,y2){x1=finite(x1);y1=finite(y1);x2=finite(x2);y2=finite(y2);if(x1===x2&&y1===y2)throw new GeometryError("Two distinct points are required");return new Line2D(y1-y2,x2-x1,x1*y2-x2*y1);}
  slope(){return this.b===0?null:-this.a/this.b;}
  intersection(other){const det=this.a*other.b-other.a*this.b;if(Math.abs(det)<1e-14)return null;return {x:(this.b*other.c-other.b*this.c)/det,y:(this.c*other.a-other.c*this.a)/det};}
  toString(){return fmt(this.a)+"x + "+fmt(this.b)+"y + "+fmt(this.c)+" = 0";}
}

function deg(x){return x*180/Math.PI;}function rad(x){return x*Math.PI/180;}
function triangleAreaHeron(a,b,c){const s=(a+b+c)/2,v=s*(s-a)*(s-b)*(s-c);if(v<-1e-12)throw new GeometryError("Sides do not form a triangle");return Math.sqrt(Math.max(0,v));}
function validateTriangleSides(a,b,c){if(!(a>0&&b>0&&c>0)||a+b<=c||a+c<=b||b+c<=a)throw new GeometryError("Sides do not form a non-degenerate triangle");}
function triangleFromSSS(a,b,c){
  a=positive(a,"a");b=positive(b,"b");c=positive(c,"c");validateTriangleSides(a,b,c);
  const A=deg(Math.acos((b*b+c*c-a*a)/(2*b*c))),B=deg(Math.acos((a*a+c*c-b*b)/(2*a*c))),C=180-A-B;
  return triangleResult(a,b,c,A,B,C,"SSS");
}
function triangleResult(a,b,c,A,B,C,caseName){
  const area=triangleAreaHeron(a,b,c),s=(a+b+c)/2;return {a:a,b:b,c:c,A:A,B:B,C:C,area:area,perimeter:a+b+c,inradius:area/s,circumradius:a*b*c/(4*area),case:caseName};
}
function solveTriangle(spec){
  const blank=function(v){return v===""||v===undefined||v===null;};
  const a=blank(spec.a)?null:positive(spec.a,"a"),b=blank(spec.b)?null:positive(spec.b,"b"),c=blank(spec.c)?null:positive(spec.c,"c");
  const A0=blank(spec.A)?null:finite(spec.A,"A"),B0=blank(spec.B)?null:finite(spec.B,"B"),C0=blank(spec.C)?null:finite(spec.C,"C");
  for(const x of [A0,B0,C0])if(x!==null&&!(x>0&&x<180))throw new GeometryError("Angles must lie between 0° and 180°");
  const sides=[a,b,c].filter(x=>x!==null).length,angles=[A0,B0,C0].filter(x=>x!==null).length;
  if(sides===3)return [triangleFromSSS(a,b,c)];
  if(angles>=2&&sides>=1){
    const A=A0!==null?A0:(180-B0-C0),B=B0!==null?B0:(180-A-C0),C=C0!==null?C0:(180-A-B0);if(Math.abs(A+B+C-180)>1e-8||Math.min(A,B,C)<=0)throw new GeometryError("Angles do not form a triangle");
    const pairs=[[a,A],[b,B],[c,C]].filter(p=>p[0]!==null),known=pairs[0],scale=known[0]/Math.sin(rad(known[1]));
    const aa=a!==null?a:scale*Math.sin(rad(A)),bb=b!==null?b:scale*Math.sin(rad(B)),cc=c!==null?c:scale*Math.sin(rad(C));
    return [triangleResult(aa,bb,cc,A,B,C,angles===3?"AAS/ASA":"ASA/AAS")];
  }
  if(sides===2&&angles===1){
    // SAS if the known angle is included between the known sides; otherwise SSA.
    if(A0!==null&&b!==null&&c!==null){const aa=Math.sqrt(b*b+c*c-2*b*c*Math.cos(rad(A0)));return [Object.assign(triangleFromSSS(aa,b,c),{case:"SAS"})];}
    if(B0!==null&&a!==null&&c!==null){const bb=Math.sqrt(a*a+c*c-2*a*c*Math.cos(rad(B0)));return [Object.assign(triangleFromSSS(a,bb,c),{case:"SAS"})];}
    if(C0!==null&&a!==null&&b!==null){const cc=Math.sqrt(a*a+b*b-2*a*b*Math.cos(rad(C0)));return [Object.assign(triangleFromSSS(a,b,cc),{case:"SAS"})];}
    let knownSide,knownAngle,otherSide,otherName;
    if(A0!==null&&a!==null){knownSide=a;knownAngle=A0;if(b!==null){otherSide=b;otherName="b";}else{otherSide=c;otherName="c";}}
    else if(B0!==null&&b!==null){knownSide=b;knownAngle=B0;if(a!==null){otherSide=a;otherName="a";}else{otherSide=c;otherName="c";}}
    else if(C0!==null&&c!==null){knownSide=c;knownAngle=C0;if(a!==null){otherSide=a;otherName="a";}else{otherSide=b;otherName="b";}}
    if(!knownSide)throw new GeometryError("The supplied two sides and angle are insufficient/unsupported");
    const sinOther=otherSide*Math.sin(rad(knownAngle))/knownSide;if(sinOther>1+1e-12)return [];const base=deg(Math.asin(Math.max(-1,Math.min(1,sinOther)))),candidates=[base];if(base>1e-10&&Math.abs(base-90)>1e-10)candidates.push(180-base);
    const results=[];for(const otherAngle of candidates){
      let A=A0,B=B0,C=C0;if(otherName==="a")A=otherAngle;if(otherName==="b")B=otherAngle;if(otherName==="c")C=otherAngle;
      if(A===null)A=180-B-C;if(B===null)B=180-A-C;if(C===null)C=180-A-B;if(Math.min(A,B,C)<=0||Math.abs(A+B+C-180)>1e-7)continue;
      const scale=knownSide/Math.sin(rad(knownAngle)),aa=a!==null?a:scale*Math.sin(rad(A)),bb=b!==null?b:scale*Math.sin(rad(B)),cc=c!==null?c:scale*Math.sin(rad(C));
      try{results.push(triangleResult(aa,bb,cc,A,B,C,"SSA"));}catch(e){}
    }
    return results;
  }
  throw new GeometryError("Provide SSS, SAS, ASA/AAS, or SSA data");
}

function compoundFutureValue(principal,annualRate,years,compounds,continuous){
  principal=finite(principal,"Principal");annualRate=finite(annualRate,"Annual rate");years=finite(years,"Years");if(years<0)throw new FinanceError("Years must be non-negative");
  return continuous?principal*Math.exp(annualRate*years):principal*Math.pow(1+annualRate/integer(compounds,"Compounds",1),integer(compounds,"Compounds",1)*years);
}
function presentValue(future,annualRate,years,compounds){return future/Math.pow(1+annualRate/compounds,compounds*years);}
function annuityPayment(pv,annualRate,periods,timing){
  pv=finite(pv,"Present value");annualRate=finite(annualRate,"Rate");periods=integer(periods,"Periods",1);const r=annualRate;
  let p=r===0?pv/periods:pv*r/(1-Math.pow(1+r,-periods));if(timing==="due")p/=1+r;return p;
}
function loanSchedule(principal,annualRate,years,paymentsPerYear){
  principal=positive(principal,"Principal");annualRate=finite(annualRate,"Annual rate");if(annualRate<-1)throw new FinanceError("Annual rate is invalid");years=positive(years,"Years");paymentsPerYear=integer(paymentsPerYear,"Payments per year",1);const n=Math.round(years*paymentsPerYear),r=annualRate/paymentsPerYear,payment=r===0?principal/n:principal*r/(1-Math.pow(1+r,-n));
  let balance=principal,totalInterest=0,schedule=[];for(let i=1;i<=n;i++){const interest=balance*r,principalPart=Math.min(balance,payment-interest),actual=i===n?balance+interest:payment;balance=Math.max(0,balance-principalPart);totalInterest+=interest;schedule.push({period:i,payment:actual,principal:principalPart,interest:interest,balance:balance});}
  return {payment:payment,totalPaid:principal+totalInterest,totalInterest:totalInterest,schedule:schedule,periodicRate:r};
}
function npv(rate,cashflows){rate=finite(rate,"Rate");if(rate<=-1)throw new FinanceError("NPV rate must be greater than -100%");return cashflows.reduce((s,c,t)=>s+c/Math.pow(1+rate,t),0);}
function parseCashflows(v){const arr=Array.isArray(v)?v:String(v).split(/[;,\s]+/).filter(Boolean).map(Number);if(!arr.length||arr.some(x=>!Number.isFinite(x)))throw new FinanceError("Cash flows must be finite values");return arr;}
function irrAll(cashflows){
  cashflows=parseCashflows(cashflows);const roots=[],grid=[];for(let i=0;i<=300;i++){const u=i/300,rate=-0.999+Math.expm1(u*Math.log(12));grid.push(rate);}
  let prev=grid[0],fp=npv(prev,cashflows);for(let i=1;i<grid.length;i++){const x=grid[i],fx=npv(x,cashflows);if(fp===0)roots.push(prev);if(Number.isFinite(fp)&&Number.isFinite(fx)&&Math.sign(fp)!==Math.sign(fx)){let a=prev,b=x,fa=fp;for(let k=0;k<120;k++){const m=(a+b)/2,fm=npv(m,cashflows);if(Math.sign(fa)===Math.sign(fm)){a=m;fa=fm;}else b=m;}roots.push((a+b)/2);}prev=x;fp=fx;}return dedupe(roots,1e-8);
}
function dedupe(v,tol){const s=v.slice().sort((a,b)=>a-b),o=[];for(const x of s)if(!o.length||Math.abs(x-o[o.length-1])>tol*Math.max(1,Math.abs(x)))o.push(x);return o;}

class FormulaRelation{
  constructor(spec){this.id=spec.id;this.variables=Object.freeze(Object.assign({},spec.variables));this.solvers=Object.freeze(Object.assign({},spec.solvers));this.validate=spec.validate||null;Object.freeze(this);}
  solve(values,target){
    if(this.validate)this.validate(values);
    const missing=Object.keys(this.variables).filter(k=>values[k]===undefined||values[k]===null||values[k]==="");
    target=target|| (missing.length===1?missing[0]:null);if(!target||!this.solvers[target])throw new ToolDomainError("Relation needs exactly one supported unknown",{missing:missing});
    const result=this.solvers[target](values);const check=Object.assign({},values,{[target]:result});if(this.validate)this.validate(check);return {variable:target,value:result};
  }
}

class ToolDefinition{
  constructor(spec){
    this.id=spec.id;this.name=spec.name;this.category=spec.category;this.description=spec.description||"";this.aliases=(spec.aliases||[]).slice();this.inputs=(spec.inputs||[]).map(x=>Object.freeze(Object.assign({},x)));this.run=spec.run;this.examples=(spec.examples||[]).slice();this.specialized=!!spec.specialized;this.version=spec.version||1;this.enabled=spec.enabled!==false;
    Object.freeze(this.aliases);Object.freeze(this.inputs);Object.freeze(this.examples);Object.freeze(this);
  }
}
class ToolRegistry{
  constructor(){this.map=new Map();this.aliasMap=new Map();}
  register(spec){const d=spec instanceof ToolDefinition?spec:new ToolDefinition(spec);if(this.map.has(d.id))throw new ToolError("DUPLICATE_TOOL","Duplicate tool '"+d.id+"'");this.map.set(d.id,d);[d.id,d.name].concat(d.aliases).forEach(a=>this.aliasMap.set(String(a).toLowerCase(),d.id));return d;}
  get(id){return this.map.get(id)||this.map.get(this.aliasMap.get(String(id).toLowerCase()))||null;}
  list(category){return Array.from(this.map.values()).filter(t=>t.enabled&&(!category||t.category===category));}
  search(query){query=String(query||"").trim().toLowerCase();if(!query)return this.list();return this.list().map(t=>({tool:t,score:(t.name.toLowerCase().startsWith(query)?100:0)+(t.id.includes(query)?40:0)+(t.aliases.some(a=>a.toLowerCase().includes(query))?25:0)+(t.description.toLowerCase().includes(query)?10:0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.tool.name.localeCompare(b.tool.name)).map(x=>x.tool);}
  execute(id,rawInputs,context){const t=this.get(id);if(!t||!t.enabled)throw new ToolError("UNKNOWN_TOOL","Unknown tool '"+id+"'");const inputs=parseInputs(t,rawInputs||{});const out=t.run(inputs,context||{});return normalizeToolResult(t,out,inputs);}
}
function parseInputs(tool,raw){
  const out={};for(const spec of tool.inputs){let v=raw[spec.id];if((v===undefined||v==="")&&spec.default!==undefined)v=spec.default;if((v===undefined||v==="")&&spec.required!==false)throw new ToolInputError(spec.label+" is required",{input:spec.id});
    if(v===undefined||v===""){out[spec.id]=null;continue;}
    if(spec.type==="number")v=finite(v,spec.label);else if(spec.type==="integer")v=integer(v,spec.label,spec.min);else if(spec.type==="percent")v=pct(v);else if(spec.type==="bigint"){try{v=BigInt(String(v).trim());}catch(e){throw new ToolInputError(spec.label+" must be an integer");}}else if(spec.type==="date")v=DateValue.parse(v);else if(spec.type==="cashflows")v=parseCashflows(v);else if(spec.type==="boolean")v=v===true||v==="true"||v==="1";else v=String(v);
    if(spec.min!==undefined&&typeof v==="number"&&v<spec.min)throw new ToolInputError(spec.label+" must be ≥ "+spec.min);if(spec.max!==undefined&&typeof v==="number"&&v>spec.max)throw new ToolInputError(spec.label+" must be ≤ "+spec.max);out[spec.id]=v;
  }return out;
}
function normalizeToolResult(tool,out,inputs){
  if(out&&out.toolResult)return out;const r=out&&typeof out==="object"&&!Array.isArray(out)?out:{value:out};return {toolResult:true,toolId:tool.id,toolVersion:tool.version,title:r.title||tool.name,display:r.display||String(r.value===undefined?"":r.value),value:r.value,details:r.details||{},warnings:r.warnings||[],inputs:inputs};
}
function result(display,value,details,warnings){return {display:display,value:value,details:details||{},warnings:warnings||[]};}

const REGISTRY=new ToolRegistry();
function reg(spec){return REGISTRY.register(spec);}
const categories=["Everyday","Finance","Geometry","Dates & Time","Programmer","Number Theory","Units & Measurement","Engineering"];

reg({id:"percentage-of",name:"Percentage of value",category:"Everyday",aliases:["percent","percentage"],description:"Find p% of a value.",inputs:[{id:"value",label:"Value",type:"number",default:200},{id:"percent",label:"Percentage",type:"number",default:15}],run:i=>{const v=i.value*i.percent/100;return result(fmt(v),v,{formula:"value × percent / 100"});},examples:[{value:200,percent:15}]});
reg({id:"percent-change",name:"Percentage change",category:"Everyday",description:"Relative change from old to new value.",inputs:[{id:"old",label:"Old value",type:"number",default:100},{id:"new",label:"New value",type:"number",default:120}],run:i=>{if(i.old===0)throw new ToolDomainError("Percentage change is undefined when old value is zero");const v=(i.new-i.old)/i.old*100;return result(fmt(v)+"%",v,{absoluteChange:i.new-i.old});}});
reg({id:"reverse-percent",name:"Reverse percentage",category:"Everyday",description:"Recover an original value after a percentage increase/decrease.",inputs:[{id:"final",label:"Final value",type:"number",default:120},{id:"percent",label:"Change (%)",type:"number",default:20},{id:"direction",label:"Direction",type:"select",options:[["increase","Increase"],["decrease","Decrease"]],default:"increase"}],run:i=>{const f=i.direction==="increase"?1+i.percent/100:1-i.percent/100;if(f===0)throw new ToolDomainError("Reverse percentage denominator is zero");const v=i.final/f;return result(fmt(v),v);}});
reg({id:"ratio",name:"Ratio & proportion",category:"Everyday",description:"Simplify a ratio and solve a:b = c:x.",inputs:[{id:"a",label:"a",type:"number",default:2},{id:"b",label:"b",type:"number",default:3},{id:"c",label:"c",type:"number",default:10}],run:i=>{if(i.a===0||i.b===0)throw new ToolDomainError("Ratio terms used for proportion must be nonzero");const x=i.b*i.c/i.a;return result(i.a+":"+i.b+" = "+i.c+":"+fmt(x),x);}});
reg({id:"fraction-percent",name:"Fraction / decimal / percent",category:"Everyday",description:"Convert an exact fraction to decimal and percent.",inputs:[{id:"numerator",label:"Numerator",type:"bigint",default:"1"},{id:"denominator",label:"Denominator",type:"bigint",default:"3"}],run:i=>{if(i.denominator===0n)throw new ToolDomainError("Denominator cannot be zero");const r=new M.Rational(i.numerator,i.denominator),n=r.toNumber();return result(r.toString()+" = "+M.formatNumber(n,12)+" = "+M.formatNumber(n*100,12)+"%",r,{decimal:n,percent:n*100});}});
reg({id:"split-tip",name:"Split bill & tip",category:"Everyday",description:"Add a tip and split a bill.",inputs:[{id:"bill",label:"Bill",type:"number",default:80,min:0},{id:"tip",label:"Tip (%)",type:"number",default:15,min:0},{id:"people",label:"People",type:"integer",default:2,min:1},{id:"currency",label:"Currency",type:"select",options:[["EUR","EUR"],["USD","USD"],["GBP","GBP"],["JPY","JPY"]],default:"EUR"}],run:i=>{const total=Money.fromMajor(i.bill*(1+i.tip/100),i.currency),share=Money.fromMajor(total.major()/i.people,i.currency);return result("Total "+total.toString()+"\nPer person "+share.toString(),share,{total:total,people:i.people});}});

reg({id:"compound-interest",name:"Compound interest",category:"Finance",description:"Future value with periodic or continuous compounding.",inputs:[{id:"principal",label:"Principal",type:"number",default:10000},{id:"rate",label:"Annual rate (%)",type:"number",default:5},{id:"years",label:"Years",type:"number",default:10,min:0},{id:"compounds",label:"Compounds/year",type:"integer",default:12,min:1},{id:"continuous",label:"Continuous",type:"boolean",required:false,default:false}],run:i=>{const fv=compoundFutureValue(i.principal,i.rate/100,i.years,i.compounds,i.continuous);return result("Future value "+fmt(fv),fv,{interest:fv-i.principal});}});
reg({id:"present-value",name:"Present value",category:"Finance",description:"Discount a future value.",inputs:[{id:"future",label:"Future value",type:"number",default:10000},{id:"rate",label:"Annual rate (%)",type:"number",default:5},{id:"years",label:"Years",type:"number",default:5,min:0},{id:"compounds",label:"Compounds/year",type:"integer",default:12,min:1}],run:i=>{const pv=presentValue(i.future,i.rate/100,i.years,i.compounds);return result(fmt(pv),pv);}});
reg({id:"annuity-payment",name:"Annuity payment",category:"Finance",description:"Payment for ordinary or annuity-due cash flows.",inputs:[{id:"pv",label:"Present value",type:"number",default:100000},{id:"periodicRate",label:"Periodic rate (%)",type:"number",default:0.5},{id:"periods",label:"Periods",type:"integer",default:120,min:1},{id:"timing",label:"Timing",type:"select",options:[["ordinary","End of period"],["due","Beginning of period"]],default:"ordinary"}],run:i=>{const p=annuityPayment(i.pv,i.periodicRate/100,i.periods,i.timing);return result(fmt(p),p);}});
reg({id:"loan",name:"Loan & amortization",category:"Finance",description:"Payment, interest, total and reconciled amortization schedule.",inputs:[{id:"principal",label:"Principal",type:"number",default:250000,min:0},{id:"rate",label:"Annual rate (%)",type:"number",default:4.5},{id:"years",label:"Years",type:"number",default:30,min:0.0001},{id:"frequency",label:"Payments/year",type:"integer",default:12,min:1}],run:i=>{const l=loanSchedule(i.principal,i.rate/100,i.years,i.frequency);return result("Payment "+fmt(l.payment)+"\nTotal interest "+fmt(l.totalInterest)+"\nTotal paid "+fmt(l.totalPaid)+"\nPayments "+l.schedule.length,l,{payment:l.payment,totalInterest:l.totalInterest,totalPaid:l.totalPaid,payments:l.schedule.length});}});
reg({id:"npv",name:"NPV",category:"Finance",description:"Net present value with t=0 as the first cash flow.",inputs:[{id:"cashflows",label:"Cash flows",type:"cashflows",default:"-1000,400,400,400"},{id:"rate",label:"Discount rate (%)",type:"number",default:10}],run:i=>{const v=npv(i.rate/100,i.cashflows);return result(fmt(v),v,{timing:"first cash flow at t=0"});}});
reg({id:"irr",name:"IRR",category:"Finance",description:"Find real IRRs in the certified search range and report multiplicity.",inputs:[{id:"cashflows",label:"Cash flows",type:"cashflows",default:"-1000,600,600"}],run:i=>{const roots=irrAll(i.cashflows),warnings=roots.length>1?["Multiple IRRs found; IRR is not unique."]:roots.length===0?["No IRR found in the certified search range."]:[];return result(roots.length?roots.map(r=>fmt(r*100)+"%").join(", "):"No IRR found",roots,{roots:roots},warnings);}});
reg({id:"cagr",name:"CAGR",category:"Finance",description:"Compound annual growth rate.",inputs:[{id:"start",label:"Start value",type:"number",default:100},{id:"end",label:"End value",type:"number",default:200},{id:"years",label:"Years",type:"number",default:5,min:0.000001}],run:i=>{if(i.start<=0||i.end<0)throw new FinanceError("CAGR requires positive start and non-negative end");const v=Math.pow(i.end/i.start,1/i.years)-1;return result(fmt(v*100)+"%",v);}});
reg({id:"roi",name:"ROI",category:"Finance",description:"Return on investment.",inputs:[{id:"cost",label:"Cost",type:"number",default:100},{id:"gain",label:"Final/gain value",type:"number",default:130}],run:i=>{if(i.cost===0)throw new FinanceError("ROI cost cannot be zero");const v=(i.gain-i.cost)/i.cost;return result(fmt(v*100)+"%",v);}});
reg({id:"margin-markup",name:"Margin & markup",category:"Finance",description:"Compare markup on cost with margin on selling price.",inputs:[{id:"cost",label:"Cost",type:"number",default:80},{id:"price",label:"Price",type:"number",default:100}],run:i=>{if(i.cost===0||i.price===0)throw new FinanceError("Cost and price must be nonzero");const markup=(i.price-i.cost)/i.cost,margin=(i.price-i.cost)/i.price;return result("Markup "+fmt(markup*100)+"%\nMargin "+fmt(margin*100)+"%",{markup:markup,margin:margin});}});
reg({id:"break-even",name:"Break-even",category:"Finance",description:"Break-even units from fixed cost and contribution margin.",inputs:[{id:"fixed",label:"Fixed cost",type:"number",default:10000,min:0},{id:"price",label:"Price/unit",type:"number",default:50},{id:"variable",label:"Variable cost/unit",type:"number",default:30}],run:i=>{const c=i.price-i.variable;if(c<=0)throw new FinanceError("Contribution margin must be positive");const units=i.fixed/c;return result(fmt(units)+" units",units,{contributionMargin:c,wholeUnits:Math.ceil(units)});}});

reg({id:"triangle",name:"Triangle solver",category:"Geometry",description:"Solve SSS, SAS, ASA/AAS, or ambiguous SSA triangles.",inputs:[{id:"a",label:"Side a",type:"number",required:false,default:3},{id:"b",label:"Side b",type:"number",required:false,default:4},{id:"c",label:"Side c",type:"number",required:false,default:5},{id:"A",label:"Angle A (°)",type:"number",required:false},{id:"B",label:"Angle B (°)",type:"number",required:false},{id:"C",label:"Angle C (°)",type:"number",required:false}],run:i=>{const sols=solveTriangle(i);if(!sols.length)return result("No triangle satisfies the supplied data",[],{},["0 solutions"]);const text=sols.map((t,k)=>"Solution "+(k+1)+" ("+t.case+")\na="+fmt(t.a)+" b="+fmt(t.b)+" c="+fmt(t.c)+"\nA="+fmt(t.A)+"° B="+fmt(t.B)+"° C="+fmt(t.C)+"°\nArea="+fmt(t.area)+" Perimeter="+fmt(t.perimeter)).join("\n\n");return result(text,sols,{solutions:sols.length});}});
reg({id:"circle",name:"Circle",category:"Geometry",description:"Solve circle measures from radius.",inputs:[{id:"radius",label:"Radius",type:"number",default:3,min:0}],run:i=>{const r=positive(i.radius,"Radius");return result("Diameter "+fmt(2*r)+"\nCircumference "+fmt(2*Math.PI*r)+"\nArea "+fmt(Math.PI*r*r),{radius:r,diameter:2*r,circumference:2*Math.PI*r,area:Math.PI*r*r});}});
reg({id:"rectangle",name:"Rectangle",category:"Geometry",description:"Area, perimeter, and diagonal.",inputs:[{id:"width",label:"Width",type:"number",default:4,min:0},{id:"height",label:"Height",type:"number",default:3,min:0}],run:i=>{const w=positive(i.width,"Width"),h=positive(i.height,"Height"),v={area:w*h,perimeter:2*(w+h),diagonal:Math.hypot(w,h)};return result("Area "+fmt(v.area)+"\nPerimeter "+fmt(v.perimeter)+"\nDiagonal "+fmt(v.diagonal),v);}});
reg({id:"regular-polygon",name:"Regular polygon",category:"Geometry",description:"Area and perimeter of a regular polygon.",inputs:[{id:"sides",label:"Sides",type:"integer",default:6,min:3},{id:"side",label:"Side length",type:"number",default:2,min:0}],run:i=>{const n=i.sides,s=positive(i.side,"Side length"),per=n*s,area=n*s*s/(4*Math.tan(Math.PI/n));return result("Perimeter "+fmt(per)+"\nArea "+fmt(area),{perimeter:per,area:area});}});
reg({id:"coordinate-distance",name:"Distance & midpoint",category:"Geometry",description:"Distance and midpoint between two points.",inputs:[{id:"x1",label:"x₁",type:"number",default:0},{id:"y1",label:"y₁",type:"number",default:0},{id:"x2",label:"x₂",type:"number",default:3},{id:"y2",label:"y₂",type:"number",default:4}],run:i=>{const d=Math.hypot(i.x2-i.x1,i.y2-i.y1),mid={x:(i.x1+i.x2)/2,y:(i.y1+i.y2)/2};return result("Distance "+fmt(d)+"\nMidpoint ("+fmt(mid.x)+", "+fmt(mid.y)+")",{distance:d,midpoint:mid});}});
reg({id:"line-intersection",name:"Line intersection",category:"Geometry",description:"Intersect two lines defined by two points each; vertical lines are supported.",inputs:[{id:"x1",label:"L1 x₁",type:"number",default:0},{id:"y1",label:"L1 y₁",type:"number",default:0},{id:"x2",label:"L1 x₂",type:"number",default:0},{id:"y2",label:"L1 y₂",type:"number",default:4},{id:"x3",label:"L2 x₁",type:"number",default:-1},{id:"y3",label:"L2 y₁",type:"number",default:2},{id:"x4",label:"L2 x₂",type:"number",default:1},{id:"y4",label:"L2 y₂",type:"number",default:2}],run:i=>{const a=Line2D.through(i.x1,i.y1,i.x2,i.y2),b=Line2D.through(i.x3,i.y3,i.x4,i.y4),p=a.intersection(b);return result(p?"("+fmt(p.x)+", "+fmt(p.y)+")":"Parallel/coincident — no unique intersection",p,{line1:a.toString(),line2:b.toString()});}});

reg({id:"date-difference",name:"Date difference",category:"Dates & Time",description:"Elapsed days and calendar years/months/days.",inputs:[{id:"start",label:"Start date",type:"date",default:"2026-01-01"},{id:"end",label:"End date",type:"date",default:"2026-12-31"}],run:i=>{const elapsed=elapsedDays(i.start,i.end),cal=calendarDifference(i.start,i.end);return result(elapsed+" days\nCalendar "+cal.toString(),{elapsedDays:elapsed,calendar:cal});}});
reg({id:"date-add",name:"Add calendar period",category:"Dates & Time",description:"Add years/months/days with end-of-month clamping.",inputs:[{id:"date",label:"Date",type:"date",default:"2024-02-29"},{id:"years",label:"Years",type:"integer",default:1},{id:"months",label:"Months",type:"integer",default:0},{id:"days",label:"Days",type:"integer",default:0}],run:i=>{const d=addCalendarPeriod(i.date,new CalendarPeriod(i.years,i.months,i.days));return result(d.toString(),d);}});
reg({id:"age",name:"Age",category:"Dates & Time",description:"Calendar age on a target date.",inputs:[{id:"birth",label:"Birth date",type:"date",default:"2000-01-01"},{id:"on",label:"On date",type:"date",default:"2026-09-22"}],run:i=>{if(i.on.epochDay()<i.birth.epochDay())throw new DateToolError("Target date precedes birth date");const c=calendarDifference(i.birth,i.on);return result(c.toString(),c);}});
reg({id:"weekday",name:"Weekday & ISO week",category:"Dates & Time",description:"Weekday and ISO week number.",inputs:[{id:"date",label:"Date",type:"date",default:"2026-09-22"}],run:i=>{const w=weekday(i.date),iso=isoWeek(i.date);return result(w+" · ISO "+iso.year+"-W"+String(iso.week).padStart(2,"0"),{weekday:w,iso:iso});}});
reg({id:"business-days",name:"Business days",category:"Dates & Time",description:"Monday–Friday business days, with optional holiday exclusions.",inputs:[{id:"start",label:"Start date",type:"date",default:"2026-09-21"},{id:"end",label:"End date",type:"date",default:"2026-09-28"},{id:"holidays",label:"Holidays (comma-separated YYYY-MM-DD)",type:"text",required:false,default:""}],run:i=>{const h=i.holidays?i.holidays.split(/[,;\s]+/).filter(Boolean):[],n=businessDays(i.start,i.end,h);return result(n+" business days",n,{weekend:"Saturday/Sunday",holidays:h});}});

reg({id:"bit-inspector",name:"Bit integer inspector",category:"Programmer",description:"Synchronized binary/octal/decimal/hex with fixed width and signed interpretation.",inputs:[{id:"value",label:"Value",type:"text",default:"FF"},{id:"base",label:"Input base",type:"select",options:[[2,"Binary"],[8,"Octal"],[10,"Decimal"],[16,"Hexadecimal"]],default:"16"},{id:"width",label:"Width",type:"select",options:[[8,"8-bit"],[16,"16-bit"],[32,"32-bit"],[64,"64-bit"]],default:"8"},{id:"signed",label:"Signed",type:"boolean",required:false,default:true}],run:i=>{const b=BitInteger.parse(i.value,Number(i.base),Number(i.width),i.signed);return result("HEX "+b.format(16)+"\nDEC unsigned "+b.raw+" · interpreted "+b.value()+"\nOCT "+b.format(8)+"\nBIN "+b.format(2),b);}});
reg({id:"bit-ops",name:"Bit operations",category:"Programmer",description:"AND/OR/XOR, shifts and rotations with explicit width.",inputs:[{id:"a",label:"A",type:"text",default:"F0"},{id:"b",label:"B",type:"text",default:"0F"},{id:"base",label:"Base",type:"select",options:[[2,"Binary"],[8,"Octal"],[10,"Decimal"],[16,"Hexadecimal"]],default:"16"},{id:"width",label:"Width",type:"select",options:[[8,"8-bit"],[16,"16-bit"],[32,"32-bit"],[64,"64-bit"]],default:"8"},{id:"operation",label:"Operation",type:"select",options:[["and","AND"],["or","OR"],["xor","XOR"],["shl","Shift left A by B"],["lshr","Logical right A by B"],["ashr","Arithmetic right A by B"],["rol","Rotate left A by B"],["ror","Rotate right A by B"]],default:"and"}],run:i=>{const a=BitInteger.parse(i.a,Number(i.base),Number(i.width),true),b=BitInteger.parse(i.b,Number(i.base),Number(i.width),true);let r;if(i.operation==="and")r=a.and(b);else if(i.operation==="or")r=a.or(b);else if(i.operation==="xor")r=a.xor(b);else{const n=Number(b.raw);r=i.operation==="shl"?a.shl(n):i.operation==="lshr"?a.shrLogical(n):i.operation==="ashr"?a.shrArithmetic(n):i.operation==="rol"?a.rol(n):a.ror(n);}return result("HEX "+r.format(16)+"\nDEC "+r.value()+"\nBIN "+r.format(2),r);}});

reg({id:"gcd-bezout",name:"GCD / LCM / Bézout",category:"Number Theory",description:"Greatest common divisor, least common multiple, and Bézout coefficients.",inputs:[{id:"a",label:"a",type:"bigint",default:"240"},{id:"b",label:"b",type:"bigint",default:"46"}],run:i=>{const e=extGcd(i.a,i.b),l=lcmBig(i.a,i.b);return result("gcd = "+e.gcd+"\nlcm = "+l+"\n"+i.a+"·("+e.x+") + "+i.b+"·("+e.y+") = "+e.gcd,e);}});
reg({id:"modular-inverse",name:"Modular inverse",category:"Number Theory",description:"Find a⁻¹ mod m when gcd(a,m)=1.",inputs:[{id:"a",label:"a",type:"bigint",default:"3"},{id:"m",label:"modulus m",type:"bigint",default:"11"}],run:i=>{const v=modInverse(i.a,i.m);return result(v.toString(),v);}});
reg({id:"crt",name:"Chinese remainder theorem",category:"Number Theory",description:"Solve two congruences, including compatible non-coprime moduli.",inputs:[{id:"a1",label:"x ≡ a₁",type:"bigint",default:"2"},{id:"m1",label:"mod m₁",type:"bigint",default:"3"},{id:"a2",label:"x ≡ a₂",type:"bigint",default:"3"},{id:"m2",label:"mod m₂",type:"bigint",default:"5"}],run:i=>{const r=crt([{a:i.a1,m:i.m1},{a:i.a2,m:i.m2}]);return result("x ≡ "+r.x+" (mod "+r.modulus+")",r);}});
reg({id:"primality",name:"Primality",category:"Number Theory",description:"Deterministic Miller–Rabin over the certified 64-bit range.",inputs:[{id:"n",label:"n",type:"bigint",default:"104729"}],run:i=>{const p=isPrime(i.n);return result(p?"Prime":"Composite",p);}});
reg({id:"factorization",name:"Prime factorization",category:"Number Theory",description:"Bounded exact trial factorization for moderate integers.",inputs:[{id:"n",label:"n",type:"bigint",default:"360"}],run:i=>{const f=primeFactors(i.n);return result(f.join(" × "),f);}});
reg({id:"divisors",name:"Divisors",category:"Number Theory",description:"List positive divisors of a moderate integer.",inputs:[{id:"n",label:"n",type:"bigint",default:"60"}],run:i=>{const d=divisors(i.n);return result(d.join(", "),d,{count:d.length});}});

reg({id:"unit-converter",name:"Unit converter",category:"Units & Measurement",description:"Typed physical, angle, temperature and information conversion.",specialized:true,inputs:[],run:function(){throw new ToolError("SPECIALIZED_TOOL","Unit converter uses the specialized unit runtime");}});
reg({id:"engineering-relations",name:"Engineering relations",category:"Engineering",description:"Dimension-validated engineering FormulaRelations from Phase 4.",specialized:true,inputs:[],run:function(){throw new ToolError("SPECIALIZED_TOOL","Engineering relation tool uses the specialized engineering runtime");}});

function validateRegistry(){
  const errors=[],ids=new Set();for(const t of REGISTRY.list()){if(ids.has(t.id))errors.push("duplicate "+t.id);ids.add(t.id);if(!t.name||!t.category)errors.push(t.id+": missing name/category");if(!categories.includes(t.category))errors.push(t.id+": unknown category");if(typeof t.run!=="function")errors.push(t.id+": no runtime");const inputIds=new Set();for(const i of t.inputs){if(inputIds.has(i.id))errors.push(t.id+": duplicate input "+i.id);inputIds.add(i.id);}}
  if(errors.length)throw new ToolError("TOOL_REGISTRY_INVALID","Tool registry validation failed",{errors:errors});return true;
}
validateRegistry();

global.CalcTools={
  VERSION:"1.0.0-tools-v2",categories:categories,
  ToolError:ToolError,ToolInputError:ToolInputError,ToolDomainError:ToolDomainError,FinanceError:FinanceError,DateToolError:DateToolError,ProgrammerError:ProgrammerError,GeometryError:GeometryError,
  Money:Money,DateValue:DateValue,CalendarPeriod:CalendarPeriod,Duration:Duration,BitInteger:BitInteger,Line2D:Line2D,
  FormulaRelation:FormulaRelation,ToolDefinition:ToolDefinition,ToolRegistry:ToolRegistry,REGISTRY:REGISTRY,
  leapYear:leapYear,daysInMonth:daysInMonth,addCalendarPeriod:addCalendarPeriod,elapsedDays:elapsedDays,calendarDifference:calendarDifference,weekday:weekday,isoWeek:isoWeek,businessDays:businessDays,
  extGcd:extGcd,mod:mod,modInverse:modInverse,crt:crt,isPrime:isPrime,primeFactors:primeFactors,divisors:divisors,
  solveTriangle:solveTriangle,triangleFromSSS:triangleFromSSS,
  compoundFutureValue:compoundFutureValue,presentValue:presentValue,annuityPayment:annuityPayment,loanSchedule:loanSchedule,npv:npv,irrAll:irrAll,
  validateRegistry:validateRegistry
};
})(window);