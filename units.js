(function(global){
"use strict";

const M=global.CalcMath;
if(!M)throw new Error("CalcMath must load before CalcUnits");

class UnitError extends M.CalcError{
  constructor(code,message,details){super(code||"UNIT_ERROR",message,undefined,undefined,details);}
}
class DimensionError extends UnitError{constructor(message,details){super("DIMENSION_MISMATCH",message,details);}}
class AffineUnitError extends UnitError{constructor(message,details){super("AFFINE_UNIT_ERROR",message,details);}}
class UnknownUnitError extends UnitError{constructor(name){super("UNKNOWN_UNIT","Unknown unit '"+name+"'",{unit:name});}}
class EngineeringError extends UnitError{constructor(message,details){super("ENGINEERING_RELATION_ERROR",message,details);}}

function ratDecimal(s){return M.Rational.fromDecimal(String(s));}
function rat(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function isExactScalar(v){return M.isExactValue(v);}
function scalarNumber(v){return M.toNumber(v);}
function scalarMul(a,b){return M.mul(a,b);}
function scalarDiv(a,b){return M.div(a,b);}
function scalarAdd(a,b){return M.add(a,b);}
function scalarSub(a,b){return M.sub(a,b);}
function scalarPow(a,n){return M.power(a,new M.Rational(BigInt(n)),{complex:false});}
function scalarNeg(a){return M.neg(a);}

const DIM_KEYS=["L","M","T","I","Theta","N","J"];

class DimensionVector{
  constructor(values){
    this.v={L:0,M:0,T:0,I:0,Theta:0,N:0,J:0};
    if(values instanceof DimensionVector)values=values.v;
    if(Array.isArray(values)){for(var i=0;i<DIM_KEYS.length;i++)this.v[DIM_KEYS[i]]=Number(values[i]||0);}
    else if(values&&typeof values==="object")for(var k of DIM_KEYS)this.v[k]=Number(values[k]||0);
    Object.freeze(this.v);Object.freeze(this);
  }
  add(other){other=DimensionVector.from(other);var o={};for(var k of DIM_KEYS)o[k]=this.v[k]+other.v[k];return new DimensionVector(o);}
  sub(other){other=DimensionVector.from(other);var o={};for(var k of DIM_KEYS)o[k]=this.v[k]-other.v[k];return new DimensionVector(o);}
  scale(n){n=Number(n);if(!Number.isInteger(n))throw new DimensionError("Dimension exponents currently require integer powers");var o={};for(var k of DIM_KEYS)o[k]=this.v[k]*n;return new DimensionVector(o);}
  equals(other){other=DimensionVector.from(other);for(var k of DIM_KEYS)if(this.v[k]!==other.v[k])return false;return true;}
  isDimensionless(){return DIM_KEYS.every(k=>this.v[k]===0);}
  toArray(){return DIM_KEYS.map(k=>this.v[k]);}
  key(){return this.toArray().join(",");}
  toString(){
    var parts=[];var names={L:"L",M:"M",T:"T",I:"I",Theta:"Θ",N:"N",J:"J"};
    for(var k of DIM_KEYS)if(this.v[k])parts.push(names[k]+(this.v[k]===1?"":"^"+this.v[k]));
    return parts.length?parts.join(" "):"1";
  }
  static from(x){return x instanceof DimensionVector?x:new DimensionVector(x);}
}
DimensionVector.NONE=new DimensionVector();
DimensionVector.LENGTH=new DimensionVector({L:1});
DimensionVector.MASS=new DimensionVector({M:1});
DimensionVector.TIME=new DimensionVector({T:1});
DimensionVector.CURRENT=new DimensionVector({I:1});
DimensionVector.TEMPERATURE=new DimensionVector({Theta:1});
DimensionVector.AMOUNT=new DimensionVector({N:1});
DimensionVector.LUMINOUS=new DimensionVector({J:1});

function dim(o){return new DimensionVector(o);}
const DIMS=Object.freeze({
  none:DimensionVector.NONE,
  length:DimensionVector.LENGTH,
  area:dim({L:2}),
  volume:dim({L:3}),
  mass:DimensionVector.MASS,
  time:DimensionVector.TIME,
  current:DimensionVector.CURRENT,
  temperature:DimensionVector.TEMPERATURE,
  amount:DimensionVector.AMOUNT,
  luminous:DimensionVector.LUMINOUS,
  frequency:dim({T:-1}),
  speed:dim({L:1,T:-1}),
  acceleration:dim({L:1,T:-2}),
  force:dim({M:1,L:1,T:-2}),
  pressure:dim({M:1,L:-1,T:-2}),
  energy:dim({M:1,L:2,T:-2}),
  power:dim({M:1,L:2,T:-3}),
  charge:dim({I:1,T:1}),
  voltage:dim({M:1,L:2,T:-3,I:-1}),
  resistance:dim({M:1,L:2,T:-3,I:-2}),
  capacitance:dim({M:-1,L:-2,T:4,I:2}),
  magneticFlux:dim({M:1,L:2,T:-2,I:-1}),
  density:dim({M:1,L:-3}),
  information:DimensionVector.NONE,
  angle:DimensionVector.NONE
});

class UnitDefinition{
  constructor(spec){
    this.id=spec.id;this.symbol=spec.symbol||spec.id;this.aliases=(spec.aliases||[]).slice();
    this.dimension=DimensionVector.from(spec.dimension||DimensionVector.NONE);
    this.scale=spec.scale===undefined?rat(1):spec.scale;
    this.offset=spec.offset===undefined?rat(0):spec.offset;
    this.kind=spec.kind||null;
    this.mode=spec.mode||"multiplicative";
    this.prefixable=!!spec.prefixable;
    this.exact=spec.exact!==false&&isExactScalar(this.scale)&&isExactScalar(this.offset);
    this.category=spec.category||this.kind||"other";
    this.description=spec.description||this.symbol;
    Object.freeze(this.aliases);Object.freeze(this);
  }
}

const SI_PREFIXES=Object.freeze({
  Y:ratDecimal("1e24"),Z:ratDecimal("1e21"),E:ratDecimal("1e18"),P:ratDecimal("1e15"),T:ratDecimal("1e12"),G:ratDecimal("1e9"),M:ratDecimal("1e6"),k:ratDecimal("1e3"),h:ratDecimal("1e2"),da:ratDecimal("1e1"),
  d:ratDecimal("1e-1"),c:ratDecimal("1e-2"),m:ratDecimal("1e-3"),u:ratDecimal("1e-6"),n:ratDecimal("1e-9"),p:ratDecimal("1e-12"),f:ratDecimal("1e-15"),a:ratDecimal("1e-18"),z:ratDecimal("1e-21"),y:ratDecimal("1e-24")
});
const IEC_PREFIXES=Object.freeze({Ki:rat(1024),Mi:rat(1048576),Gi:rat(1073741824),Ti:new M.Rational(1099511627776n)});

class UnitRegistry{
  constructor(){this.byId=new Map();this.byAlias=new Map();this.prefixedCache=new Map();}
  register(spec){
    var u=spec instanceof UnitDefinition?spec:new UnitDefinition(spec);
    if(this.byId.has(u.id))throw new UnitError("DUPLICATE_UNIT","Duplicate unit id '"+u.id+"'");
    this.byId.set(u.id,u);
    [u.id,u.symbol].concat(u.aliases).forEach(a=>{if(a)this.byAlias.set(a,u);});
    return u;
  }
  get(name){
    if(this.byAlias.has(name))return this.byAlias.get(name);
    if(this.prefixedCache.has(name))return this.prefixedCache.get(name);
    var dynamic=this.resolvePrefix(name);if(dynamic){this.prefixedCache.set(name,dynamic);return dynamic;}
    return null;
  }
  require(name){var u=this.get(name);if(!u)throw new UnknownUnitError(name);return u;}
  resolvePrefix(name){
    var prefixes=Object.keys(SI_PREFIXES).sort((a,b)=>b.length-a.length);
    for(var p of prefixes){
      if(!name.startsWith(p)||name.length===p.length)continue;
      var baseName=name.slice(p.length),base=this.byAlias.get(baseName);
      if(base&&base.prefixable&&base.mode==="multiplicative"){
        return new UnitDefinition({id:name,symbol:name,dimension:base.dimension,scale:scalarMul(SI_PREFIXES[p],base.scale),kind:base.kind,mode:"multiplicative",prefixable:false,exact:base.exact,category:base.category,description:p+"-"+base.description});
      }
    }
    var iec=Object.keys(IEC_PREFIXES).sort((a,b)=>b.length-a.length);
    for(var ip of iec){
      if(!name.startsWith(ip)||name.length===ip.length)continue;
      var bname=name.slice(ip.length),b=this.byAlias.get(bname);
      if(b&&b.prefixable&&b.kind==="information"){
        return new UnitDefinition({id:name,symbol:name,dimension:b.dimension,scale:scalarMul(IEC_PREFIXES[ip],b.scale),kind:b.kind,mode:"multiplicative",category:b.category,exact:true});
      }
    }
    return null;
  }
  list(category){return Array.from(this.byId.values()).filter(u=>!category||u.category===category);}
}

const UNIT_REGISTRY=new UnitRegistry();

function registerUnits(){
  var R=UNIT_REGISTRY.register.bind(UNIT_REGISTRY);
  R({id:"m",symbol:"m",dimension:DIMS.length,scale:rat(1),kind:"length",category:"length",prefixable:true,description:"metre"});
  R({id:"in",symbol:"in",aliases:["inch"],dimension:DIMS.length,scale:new M.Rational(127n,5000n),kind:"length",category:"length"});
  R({id:"ft",symbol:"ft",aliases:["foot"],dimension:DIMS.length,scale:new M.Rational(381n,1250n),kind:"length",category:"length"});
  R({id:"yd",symbol:"yd",dimension:DIMS.length,scale:new M.Rational(1143n,1250n),kind:"length",category:"length"});
  R({id:"mi",symbol:"mi",aliases:["mile"],dimension:DIMS.length,scale:new M.Rational(201168n,125n),kind:"length",category:"length"});
  R({id:"nmi",symbol:"nmi",dimension:DIMS.length,scale:rat(1852),kind:"length",category:"length"});

  R({id:"g",symbol:"g",dimension:DIMS.mass,scale:ratDecimal("1e-3"),kind:"mass",category:"mass",prefixable:true,description:"gram"});
  R({id:"lb",symbol:"lb",dimension:DIMS.mass,scale:ratDecimal("0.45359237"),kind:"mass",category:"mass"});
  R({id:"oz",symbol:"oz",dimension:DIMS.mass,scale:ratDecimal("0.028349523125"),kind:"mass",category:"mass"});

  R({id:"s",symbol:"s",aliases:["sec"],dimension:DIMS.time,scale:rat(1),kind:"time",category:"time",prefixable:true,description:"second"});
  R({id:"min",symbol:"min",dimension:DIMS.time,scale:rat(60),kind:"time",category:"time"});
  R({id:"hr",symbol:"h",aliases:["hour"],dimension:DIMS.time,scale:rat(3600),kind:"time",category:"time"});
  R({id:"day",symbol:"day",dimension:DIMS.time,scale:rat(86400),kind:"time",category:"time"});
  R({id:"week",symbol:"week",dimension:DIMS.time,scale:rat(604800),kind:"time",category:"time"});

  R({id:"A",symbol:"A",dimension:DIMS.current,scale:rat(1),kind:"current",category:"electrical",prefixable:true,description:"ampere"});
  R({id:"mol",symbol:"mol",dimension:DIMS.amount,scale:rat(1),kind:"amount",category:"si-base",prefixable:true});
  R({id:"cd",symbol:"cd",dimension:DIMS.luminous,scale:rat(1),kind:"luminous-intensity",category:"si-base",prefixable:true});

  R({id:"K",symbol:"K",dimension:DIMS.temperature,scale:rat(1),offset:rat(0),kind:"absolute-temperature",mode:"affine",category:"temperature",description:"kelvin"});
  R({id:"degC",symbol:"°C",aliases:["Celsius"],dimension:DIMS.temperature,scale:rat(1),offset:ratDecimal("273.15"),kind:"absolute-temperature",mode:"affine",category:"temperature",description:"degree Celsius"});
  R({id:"degF",symbol:"°F",aliases:["Fahrenheit"],dimension:DIMS.temperature,scale:new M.Rational(5n,9n),offset:new M.Rational(45967n,180n),kind:"absolute-temperature",mode:"affine",category:"temperature",description:"degree Fahrenheit"});
  R({id:"dK",symbol:"ΔK",dimension:DIMS.temperature,scale:rat(1),kind:"temperature-difference",mode:"delta",category:"temperature"});
  R({id:"dC",symbol:"Δ°C",dimension:DIMS.temperature,scale:rat(1),kind:"temperature-difference",mode:"delta",category:"temperature"});
  R({id:"dF",symbol:"Δ°F",dimension:DIMS.temperature,scale:new M.Rational(5n,9n),kind:"temperature-difference",mode:"delta",category:"temperature"});

  R({id:"rad",symbol:"rad",dimension:DIMS.angle,scale:rat(1),kind:"angle",category:"angle",description:"radian"});
  R({id:"deg",symbol:"°",aliases:["degree"],dimension:DIMS.angle,scale:Math.PI/180,kind:"angle",category:"angle",exact:false,description:"degree"});
  R({id:"grad",symbol:"grad",dimension:DIMS.angle,scale:Math.PI/200,kind:"angle",category:"angle",exact:false});

  R({id:"L",symbol:"L",dimension:DIMS.volume,scale:ratDecimal("1e-3"),kind:"volume",category:"volume",prefixable:true,description:"litre"});
  R({id:"USgal",symbol:"gal_US",aliases:["gallon_US"],dimension:DIMS.volume,scale:ratDecimal("0.003785411784"),kind:"volume",category:"volume"});
  R({id:"USfloz",symbol:"fl_oz_US",dimension:DIMS.volume,scale:ratDecimal("0.0000295735295625"),kind:"volume",category:"volume"});

  R({id:"Hz",symbol:"Hz",dimension:DIMS.frequency,scale:rat(1),kind:"frequency",category:"derived",prefixable:true});
  R({id:"N",symbol:"N",dimension:DIMS.force,scale:rat(1),kind:"force",category:"derived",prefixable:true});
  R({id:"Pa",symbol:"Pa",dimension:DIMS.pressure,scale:rat(1),kind:"pressure",category:"pressure",prefixable:true});
  R({id:"bar",symbol:"bar",dimension:DIMS.pressure,scale:rat(100000),kind:"pressure",category:"pressure"});
  R({id:"psi",symbol:"psi",dimension:DIMS.pressure,scale:ratDecimal("6894.757293168"),kind:"pressure",category:"pressure",exact:false});
  R({id:"J",symbol:"J",dimension:DIMS.energy,scale:rat(1),kind:"energy",category:"energy",prefixable:true});
  R({id:"cal",symbol:"cal",dimension:DIMS.energy,scale:ratDecimal("4.184"),kind:"energy",category:"energy"});
  R({id:"eV",symbol:"eV",dimension:DIMS.energy,scale:ratDecimal("1.602176634e-19"),kind:"energy",category:"energy"});
  R({id:"Wh",symbol:"Wh",dimension:DIMS.energy,scale:rat(3600),kind:"energy",category:"energy",prefixable:true});
  R({id:"W",symbol:"W",dimension:DIMS.power,scale:rat(1),kind:"power",category:"power",prefixable:true});
  R({id:"Coul",symbol:"C",dimension:DIMS.charge,scale:rat(1),kind:"charge",category:"electrical",prefixable:true});
  R({id:"V",symbol:"V",dimension:DIMS.voltage,scale:rat(1),kind:"voltage",category:"electrical",prefixable:true});
  R({id:"ohm",symbol:"Ω",aliases:["Ohm"],dimension:DIMS.resistance,scale:rat(1),kind:"resistance",category:"electrical",prefixable:true});
  R({id:"F",symbol:"F",dimension:DIMS.capacitance,scale:rat(1),kind:"capacitance",category:"electrical",prefixable:true});

  R({id:"B",symbol:"B",aliases:["byte"],dimension:DIMS.information,scale:rat(1),kind:"information",category:"information",prefixable:true});
  R({id:"bit",symbol:"bit",aliases:["b"],dimension:DIMS.information,scale:new M.Rational(1n,8n),kind:"information",category:"information",prefixable:true});
}
registerUnits();

function unitForSymbol(name){return UNIT_REGISTRY.get(name);}

class Quantity{
  constructor(baseValue,dimension,options){
    options=options||{};
    this.baseValue=baseValue;
    this.dimension=DimensionVector.from(dimension);
    this.kind=options.kind||null;
    this.displayUnit=options.displayUnit||null;
    this.expressionUnits=options.expressionUnits||null;
    this.customDisplayScale=options.customDisplayScale||null;
    this.exact=options.exact!==false&&isExactScalar(baseValue);
    Object.freeze(this);
  }
  isDimensionless(){return this.dimension.isDimensionless()&&this.kind!=="angle"&&this.kind!=="information";}
  to(unitName){
    var u=typeof unitName==="string"?UNIT_REGISTRY.require(unitName):unitName;
    if(!this.dimension.equals(u.dimension))throw new DimensionError("Cannot convert "+this.dimension.toString()+" to "+u.dimension.toString(),{from:this.dimension.key(),to:u.dimension.key()});
    if(this.kind==="absolute-temperature"&&u.mode!=="affine")throw new AffineUnitError("Absolute temperature must convert to an absolute temperature unit");
    if(this.kind==="temperature-difference"&&u.mode==="affine")throw new AffineUnitError("Temperature differences must convert to ΔK, Δ°C, or Δ°F");
    return new Quantity(this.baseValue,this.dimension,{kind:this.kind,displayUnit:u,exact:this.exact&&u.exact});
  }
  displayMagnitude(){
    var u=this.displayUnit;if(!u)return this.baseValue;
    if(this.kind==="absolute-temperature"&&u.mode==="affine")return scalarDiv(scalarSub(this.baseValue,u.offset),u.scale);
    return scalarDiv(this.baseValue,u.scale);
  }
  toString(precision){
    var mag=this.displayMagnitude(),unit=this.displayUnit?this.displayUnit.symbol:(this.expressionUnits||canonicalUnitSymbol(this.dimension,this.kind));
    return M.formatValue(mag,precision||12)+(unit&&unit!=="1"?" "+unit:"");
  }
  approxString(precision){
    var mag=this.displayMagnitude();
    if(mag instanceof M.Rational&&mag.d!==1n)return "≈ "+M.formatNumber(mag.toNumber(),precision||12)+(this.displayUnit?" "+this.displayUnit.symbol:"");
    if(typeof mag==="number")return "";
    return "";
  }
}

function quantityFromUnit(value,unit){
  unit=typeof unit==="string"?UNIT_REGISTRY.require(unit):unit;
  if(unit.mode==="affine"){
    var base=scalarAdd(scalarMul(value,unit.scale),unit.offset);
    return new Quantity(base,unit.dimension,{kind:"absolute-temperature",displayUnit:unit,exact:isExactScalar(value)&&unit.exact});
  }
  var base2=scalarMul(value,unit.scale);
  return new Quantity(base2,unit.dimension,{kind:unit.kind,displayUnit:unit,exact:isExactScalar(value)&&unit.exact});
}

function canonicalUnitSymbol(dimension,kind){
  if(kind==="force")return "N";
  if(kind==="pressure")return "Pa";
  if(kind==="energy")return "J";
  if(kind==="power")return "W";
  if(kind==="voltage")return "V";
  if(kind==="resistance")return "Ω";
  if(kind==="charge")return "C";
  if(kind==="frequency")return "Hz";
  if(kind==="angle")return "rad";
  if(kind==="temperature-difference")return "ΔK";
  var d=dimension.v,parts=[],num=[],den=[];
  var map=[["kg","M"],["m","L"],["s","T"],["A","I"],["K","Theta"],["mol","N"],["cd","J"]];
  map.forEach(function(pair){
    var e=d[pair[1]];if(!e)return;var token=pair[0]+(Math.abs(e)===1?"":"^"+Math.abs(e));(e>0?num:den).push(token);
  });
  if(!num.length)num.push("1");
  return num.join("*")+(den.length?"/"+den.join("*"):"");
}

function inferKindMul(a,b,resultDim){
  var ak=a instanceof Quantity?a.kind:null,bk=b instanceof Quantity?b.kind:null;
  if((ak==="mass"&&bk==="acceleration")||(ak==="acceleration"&&bk==="mass"))return "force";
  if((ak==="voltage"&&bk==="current")||(ak==="current"&&bk==="voltage"))return "power";
  if((ak==="frequency"&&bk==="length")||(ak==="length"&&bk==="frequency"))return "speed";
  if((ak==="density"&&bk==="volume")||(ak==="volume"&&bk==="density"))return "mass";
  if(resultDim.equals(DIMS.frequency))return "frequency";
  if(resultDim.equals(DIMS.force))return "force";
  if(resultDim.equals(DIMS.pressure))return "pressure";
  if(resultDim.equals(DIMS.power))return "power";
  return null;
}
function inferKindDiv(a,b,resultDim){
  var ak=a instanceof Quantity?a.kind:null,bk=b instanceof Quantity?b.kind:null;
  if(ak==="length"&&bk==="time")return "speed";
  if(ak==="speed"&&bk==="time")return "acceleration";
  if(ak==="mass"&&bk==="volume")return "density";
  if(ak==="energy"&&bk==="time")return "power";
  if(ak==="voltage"&&bk==="current")return "resistance";
  if(resultDim.equals(DIMS.frequency))return "frequency";
  return null;
}

function ensureNotAbsoluteForProduct(q){
  if(q instanceof Quantity&&q.kind==="absolute-temperature"){
    if(q.displayUnit&&q.displayUnit.id==="K"&&M.isZero(q.displayUnit.offset))return;
    throw new AffineUnitError("Affine absolute temperatures cannot be multiplied, divided, or exponentiated; convert to kelvin or use a temperature difference");
  }
}
function asQuantityOrScalar(x){return x;}
function qAdd(a,b){
  if(a instanceof Quantity&&b instanceof Quantity){
    if(!a.dimension.equals(b.dimension))throw new DimensionError("Cannot add quantities with different dimensions");
    if(a.kind==="absolute-temperature"&&b.kind==="absolute-temperature")throw new AffineUnitError("Adding two absolute temperatures is not physically defined");
    if(a.kind==="absolute-temperature"&&b.kind==="temperature-difference")return new Quantity(scalarAdd(a.baseValue,b.baseValue),a.dimension,{kind:"absolute-temperature",displayUnit:a.displayUnit,exact:a.exact&&b.exact});
    if(a.kind==="temperature-difference"&&b.kind==="absolute-temperature")return new Quantity(scalarAdd(a.baseValue,b.baseValue),b.dimension,{kind:"absolute-temperature",displayUnit:b.displayUnit,exact:a.exact&&b.exact});
    if(a.kind==="temperature-difference"||b.kind==="temperature-difference"){
      if(a.kind!==b.kind)throw new AffineUnitError("Temperature difference can only be added to another difference or an absolute temperature");
      return new Quantity(scalarAdd(a.baseValue,b.baseValue),a.dimension,{kind:"temperature-difference",displayUnit:a.displayUnit||b.displayUnit,exact:a.exact&&b.exact});
    }
    return new Quantity(scalarAdd(a.baseValue,b.baseValue),a.dimension,{kind:a.kind===b.kind?a.kind:null,displayUnit:a.displayUnit||b.displayUnit,exact:a.exact&&b.exact});
  }
  if(a instanceof Quantity||b instanceof Quantity)throw new DimensionError("Cannot add a dimensional quantity and a plain scalar");
  return scalarAdd(a,b);
}
function qSub(a,b){
  if(a instanceof Quantity&&b instanceof Quantity){
    if(!a.dimension.equals(b.dimension))throw new DimensionError("Cannot subtract quantities with different dimensions");
    if(a.kind==="absolute-temperature"&&b.kind==="absolute-temperature"){
      var display=a.displayUnit&&a.displayUnit.id==="degF"?UNIT_REGISTRY.require("dF"):a.displayUnit&&a.displayUnit.id==="degC"?UNIT_REGISTRY.require("dC"):UNIT_REGISTRY.require("dK");
      return new Quantity(scalarSub(a.baseValue,b.baseValue),DIMS.temperature,{kind:"temperature-difference",displayUnit:display,exact:a.exact&&b.exact});
    }
    if(a.kind==="absolute-temperature"&&b.kind==="temperature-difference")return new Quantity(scalarSub(a.baseValue,b.baseValue),a.dimension,{kind:"absolute-temperature",displayUnit:a.displayUnit,exact:a.exact&&b.exact});
    if(a.kind==="temperature-difference"&&b.kind==="absolute-temperature")throw new AffineUnitError("Subtracting an absolute temperature from a temperature difference is not defined");
    return new Quantity(scalarSub(a.baseValue,b.baseValue),a.dimension,{kind:a.kind===b.kind?a.kind:null,displayUnit:a.displayUnit||b.displayUnit,exact:a.exact&&b.exact});
  }
  if(a instanceof Quantity||b instanceof Quantity)throw new DimensionError("Cannot subtract a dimensional quantity and a plain scalar");
  return scalarSub(a,b);
}
function qMul(a,b){
  if(a instanceof Quantity)ensureNotAbsoluteForProduct(a);if(b instanceof Quantity)ensureNotAbsoluteForProduct(b);
  if(a instanceof Quantity&&b instanceof Quantity){
    var d=a.dimension.add(b.dimension),kind=inferKindMul(a,b,d);
    return new Quantity(scalarMul(a.baseValue,b.baseValue),d,{kind:kind,exact:a.exact&&b.exact,expressionUnits:null});
  }
  if(a instanceof Quantity)return new Quantity(scalarMul(a.baseValue,b),a.dimension,{kind:a.kind,displayUnit:a.displayUnit,expressionUnits:a.expressionUnits,exact:a.exact&&isExactScalar(b)});
  if(b instanceof Quantity)return new Quantity(scalarMul(a,b.baseValue),b.dimension,{kind:b.kind,displayUnit:b.displayUnit,expressionUnits:b.expressionUnits,exact:b.exact&&isExactScalar(a)});
  return scalarMul(a,b);
}
function qDiv(a,b){
  if(a instanceof Quantity)ensureNotAbsoluteForProduct(a);if(b instanceof Quantity)ensureNotAbsoluteForProduct(b);
  if(a instanceof Quantity&&b instanceof Quantity){
    var d=a.dimension.sub(b.dimension);
    if(d.isDimensionless())return scalarDiv(a.baseValue,b.baseValue);
    return new Quantity(scalarDiv(a.baseValue,b.baseValue),d,{kind:inferKindDiv(a,b,d),exact:a.exact&&b.exact});
  }
  if(a instanceof Quantity)return new Quantity(scalarDiv(a.baseValue,b),a.dimension,{kind:a.kind,displayUnit:a.displayUnit,exact:a.exact&&isExactScalar(b)});
  if(b instanceof Quantity){
    var invDim=DimensionVector.NONE.sub(b.dimension);
    return new Quantity(scalarDiv(a,b.baseValue),invDim,{kind:null,exact:isExactScalar(a)&&b.exact});
  }
  return scalarDiv(a,b);
}
function qPow(a,b){
  if(a instanceof Quantity){
    ensureNotAbsoluteForProduct(a);
    if(b instanceof Quantity)throw new DimensionError("A quantity exponent must be dimensionless");
    var n;if(b instanceof M.Rational&&b.isInteger())n=Number(b.n);else if(typeof b==="number"&&Number.isInteger(b))n=b;else throw new DimensionError("Dimensionful quantities currently require integer exponents");
    return new Quantity(scalarPow(a.baseValue,n),a.dimension.scale(n),{kind:null,exact:a.exact&&isExactScalar(b)});
  }
  if(b instanceof Quantity)throw new DimensionError("A quantity cannot be used as an exponent");
  return M.power(a,b,{complex:false});
}
function qNeg(a){
  if(a instanceof Quantity)return new Quantity(scalarNeg(a.baseValue),a.dimension,{kind:a.kind,displayUnit:a.displayUnit,expressionUnits:a.expressionUnits,exact:a.exact});
  return scalarNeg(a);
}

function explicitAngleRadians(q){
  if(!(q instanceof Quantity)||q.kind!=="angle")throw new DimensionError("Expected an angle quantity");
  return scalarNumber(q.baseValue);
}
function qCall(name,args,options){
  options=options||{};name=name.toLowerCase();
  if(name==="sin"||name==="cos"||name==="tan"){
    var x=args[0],rad;
    if(x instanceof Quantity)rad=explicitAngleRadians(x);
    else{var n=scalarNumber(x),mode=options.angle||"RAD";rad=mode==="DEG"?n*Math.PI/180:mode==="GRAD"?n*Math.PI/200:n;}
    return name==="sin"?Math.sin(rad):name==="cos"?Math.cos(rad):Math.tan(rad);
  }
  if(name==="sqrt"){
    var y=args[0];
    if(y instanceof Quantity){
      ensureNotAbsoluteForProduct(y);var dv=y.dimension.v;
      for(var k of DIM_KEYS)if(dv[k]%2!==0)throw new DimensionError("Square root of a quantity requires even dimension exponents");
      var d2={};for(var kk of DIM_KEYS)d2[kk]=dv[kk]/2;
      return new Quantity(M.sqrtValue(y.baseValue,false),new DimensionVector(d2),{kind:null,exact:y.exact});
    }
    return M.sqrtValue(y,false);
  }
  if(name==="abs"){
    var a=args[0];if(a instanceof Quantity)return new Quantity(a.baseValue instanceof M.Rational?a.baseValue.abs():Math.abs(scalarNumber(a.baseValue)),a.dimension,{kind:a.kind,displayUnit:a.displayUnit,exact:a.exact});
    return a instanceof M.Rational?a.abs():Math.abs(scalarNumber(a));
  }
  if(name==="ln"||name==="log"||name==="log10"||name==="exp"){
    if(args.some(v=>v instanceof Quantity))throw new DimensionError(name+" requires a dimensionless scalar");
    var expr=name+"("+args.map(v=>M.formatValue(v)).join(",")+")";
    return M.evaluate(expr,{},Object.assign({},options,{commit:false,complex:false})).value;
  }
  throw new UnitError("UNSUPPORTED_QUANTITY_FUNCTION","Function '"+name+"' is not quantity-aware");
}

function normalizeUnitInput(raw){
  return String(raw)
    .replace(/Δ\s*°\s*C/g,"dC").replace(/Δ\s*°\s*F/g,"dF").replace(/Δ\s*K/g,"dK")
    .replace(/°\s*C/g,"degC").replace(/°\s*F/g,"degF")
    .replace(/Ω/g,"ohm").replace(/[µμ]/g,"u")
    .replace(/\bkm\/h\b/g,"km/hr");
}
function lookupEnv(env,name){
  var cur=env;
  while(cur&&cur!==Object.prototype){if(Object.prototype.hasOwnProperty.call(cur,name))return {found:true,value:cur[name]};cur=Object.getPrototypeOf(cur);}
  return {found:false};
}

class QuantityEvaluator{
  constructor(env,options){this.env=env||{};this.options=options||{};}
  eval(ast){
    if(ast.type==="literal")return ast.value;
    if(ast.type==="identifier"){
      var found=lookupEnv(this.env,ast.name);if(found.found)return found.value;
      var constant=CONSTANT_REGISTRY[ast.name];if(constant)return constant.quantity;
      var unit=UNIT_REGISTRY.get(ast.name);if(unit)return quantityFromUnit(rat(1),unit);
      if(Object.prototype.hasOwnProperty.call(M.CONSTANT_REGISTRY,ast.name))return M.CONSTANT_REGISTRY[ast.name].value;
      throw new M.UnknownIdentifierError(ast.name,ast.start,ast.end);
    }
    if(ast.type==="unary"){var u=this.eval(ast.arg);return ast.op==="-"?qNeg(u):u;}
    if(ast.type==="postfix"){
      var p=this.eval(ast.arg);if(ast.op==="%")return qDiv(p,rat(100));
      if(p instanceof Quantity)throw new DimensionError("Factorial requires a dimensionless integer");
      return M.evaluateAst(ast,this.env,Object.assign({},this.options,{complex:false}),0);
    }
    if(ast.type==="binary"){
      var l=this.eval(ast.left),r=this.eval(ast.right);
      if(ast.op==="+")return qAdd(l,r);if(ast.op==="-")return qSub(l,r);if(ast.op==="*")return qMul(l,r);if(ast.op==="/")return qDiv(l,r);if(ast.op==="^")return qPow(l,r);
      throw new UnitError("UNSUPPORTED_QUANTITY_OPERATOR","Unsupported quantity operator '"+ast.op+"'");
    }
    if(ast.type==="call")return qCall(ast.name,ast.args.map(a=>this.eval(a)),this.options);
    throw new UnitError("UNSUPPORTED_QUANTITY_AST","Unsupported quantity AST node '"+ast.type+"'");
  }
}

function unitTokensIn(raw){
  var normalized=normalizeUnitInput(raw),tokens=normalized.match(/[A-Za-z_][A-Za-z0-9_]*/g)||[];
  return tokens;
}
function shouldTryQuantity(raw,env){
  if(/^\s*(convert|constant|eng)\s*\(/.test(raw))return true;
  var normalized=normalizeUnitInput(raw),toks=unitTokensIn(raw);
  for(var t of toks){
    var found=lookupEnv(env,t);
    if(found.found&&found.value instanceof Quantity)return true;
    if(M.FUNCTION_REGISTRY&&Object.prototype.hasOwnProperty.call(M.FUNCTION_REGISTRY,t)){
      var callPattern=new RegExp("\\b"+t+"\\s*\\(");
      if(callPattern.test(normalized))continue;
    }
    if(UNIT_REGISTRY.get(t)||CONSTANT_REGISTRY[t])return true;
  }
  return /\s+to\s+/.test(raw);
}

function parseQuantityExpression(raw,env,options){
  var norm=normalizeUnitInput(raw),ast=M.parseExpression(norm),v=new QuantityEvaluator(env,options).eval(ast);
  return v;
}
function parseUnitExpression(raw){
  var norm=normalizeUnitInput(raw),ast=M.parseExpression(norm),v=new QuantityEvaluator({},{}).eval(ast);
  if(!(v instanceof Quantity))throw new UnitError("INVALID_UNIT_EXPRESSION","Target must be a unit expression");
  return v;
}

function findTopLevelTo(raw){
  var s=String(raw),depth=0;
  for(var i=0;i<s.length-3;i++){
    if(s[i]==="(")depth++;else if(s[i]===")")depth--;
    if(depth===0&&s.slice(i,i+4).toLowerCase()===" to ")return i;
  }
  return -1;
}
function convertQuantity(quantity,targetRaw){
  if(!(quantity instanceof Quantity))throw new DimensionError("Only quantities can be converted");
  var norm=normalizeUnitInput(targetRaw).trim(),simple=UNIT_REGISTRY.get(norm);
  if(simple)return quantity.to(simple);
  var target=parseUnitExpression(norm);
  if(!quantity.dimension.equals(target.dimension))throw new DimensionError("Conversion target has incompatible dimensions");
  if(quantity.kind==="absolute-temperature")throw new AffineUnitError("Absolute temperature conversion requires °C, °F, or K");
  var targetScale=target.baseValue;
  return new Quantity(quantity.baseValue,quantity.dimension,{kind:quantity.kind,expressionUnits:targetRaw,displayUnit:null,exact:quantity.exact&&target.exact,
    customDisplayScale:targetScale});
}

function quantityDisplayValue(q){
  if(q.customDisplayScale)return scalarDiv(q.baseValue,q.customDisplayScale);
  return q.displayMagnitude();
}
function formatQuantity(q,precision){
  if(!(q instanceof Quantity))return M.formatValue(q,precision);
  if(q.customDisplayScale){
    var mag=scalarDiv(q.baseValue,q.customDisplayScale);return M.formatValue(mag,precision||12)+" "+q.expressionUnits;
  }
  return q.toString(precision);
}
function approxQuantity(q,precision){
  if(!(q instanceof Quantity))return "";
  var mag=q.customDisplayScale?scalarDiv(q.baseValue,q.customDisplayScale):q.displayMagnitude(),unit=q.customDisplayScale?q.expressionUnits:(q.displayUnit?q.displayUnit.symbol:canonicalUnitSymbol(q.dimension,q.kind));
  if(mag instanceof M.Rational&&mag.d!==1n)return "≈ "+M.formatNumber(mag.toNumber(),precision||12)+(unit&&unit!=="1"?" "+unit:"");
  return "";
}

function resultFor(value,options,metadata){
  options=options||{};metadata=metadata||{};
  var isQ=value instanceof Quantity,display=isQ?formatQuantity(value,options.precision):M.formatValue(value,options.precision);
  return {value:value,display:display,approx:isQ?approxQuantity(value,options.precision):M.approxString(value,options.precision),exact:isQ?value.exact:M.isExactValue(value),kind:isQ?"quantity":M.numericKind(value),quantity:isQ,metadata:Object.assign({numericKind:isQ?"quantity":M.numericKind(value),exact:isQ?value.exact:M.isExactValue(value)},metadata)};
}

const CONSTANT_REGISTRY={};
function registerConstant(spec){
  var quantity=parseQuantityExpression(spec.value+" "+spec.unit,{}, {angle:"RAD",complex:false});
  if(spec.kind)quantity=new Quantity(quantity.baseValue,quantity.dimension,{kind:spec.kind,displayUnit:quantity.displayUnit,exact:spec.exact!==false&&quantity.exact});
  CONSTANT_REGISTRY[spec.id]=Object.freeze({id:spec.id,name:spec.name,symbol:spec.symbol||spec.id,quantity:quantity,exact:spec.exact!==false,source:spec.source||"SI/CODATA",description:spec.description||""});
}
registerConstant({id:"c0",name:"speed of light in vacuum",value:"299792458",unit:"m/s",kind:"speed",exact:true,source:"SI defining constant"});
registerConstant({id:"g0",name:"standard gravity",value:"9.80665",unit:"m/s^2",kind:"acceleration",exact:true,source:"standard definition"});
registerConstant({id:"h_planck",name:"Planck constant",value:"6.62607015e-34",unit:"J*s",exact:true,source:"SI defining constant"});
registerConstant({id:"e_charge",name:"elementary charge",value:"1.602176634e-19",unit:"C",kind:"charge",exact:true,source:"SI defining constant"});
registerConstant({id:"kB_const",name:"Boltzmann constant",value:"1.380649e-23",unit:"J/K",exact:true,source:"SI defining constant"});
registerConstant({id:"NA",name:"Avogadro constant",value:"6.02214076e23",unit:"1/mol",exact:true,source:"SI defining constant"});
registerConstant({id:"G_const",name:"Newtonian constant of gravitation",value:"6.67430e-11",unit:"m^3/(kg*s^2)",exact:false,source:"CODATA measured value"});

function dimensionOfFormulaAst(ast,vars){
  if(ast.type==="literal")return DIMS.none;
  if(ast.type==="identifier"){
    if(vars[ast.name])return vars[ast.name].dimension;
    if(CONSTANT_REGISTRY[ast.name])return CONSTANT_REGISTRY[ast.name].quantity.dimension;
    throw new EngineeringError("Unknown relation symbol '"+ast.name+"'");
  }
  if(ast.type==="unary")return dimensionOfFormulaAst(ast.arg,vars);
  if(ast.type==="binary"){
    var l=dimensionOfFormulaAst(ast.left,vars),r=dimensionOfFormulaAst(ast.right,vars);
    if(ast.op==="+"||ast.op==="-"){if(!l.equals(r))throw new DimensionError("Relation adds incompatible dimensions");return l;}
    if(ast.op==="*")return l.add(r);
    if(ast.op==="/")return l.sub(r);
    if(ast.op==="^"){
      if(!(ast.right.type==="literal"&&ast.right.value instanceof M.Rational&&ast.right.value.isInteger()))throw new DimensionError("Engineering relation exponents must be constant integers");
      return l.scale(Number(ast.right.value.n));
    }
  }
  if(ast.type==="call"){
    if(["sin","cos","tan","ln","log","log10","exp"].indexOf(ast.name)>=0){
      var ad=dimensionOfFormulaAst(ast.args[0],vars);if(!ad.isDimensionless())throw new DimensionError("Dimensionless function receives dimensional input in relation");return DIMS.none;
    }
    if(ast.name==="sqrt"){
      var sd=dimensionOfFormulaAst(ast.args[0],vars),o={};for(var k of DIM_KEYS){if(sd.v[k]%2!==0)throw new DimensionError("Relation sqrt requires even dimensions");o[k]=sd.v[k]/2;}return new DimensionVector(o);
    }
  }
  throw new EngineeringError("Unsupported relation formula node '"+ast.type+"'");
}

class EngineeringRelation{
  constructor(spec){
    this.id=spec.id;this.name=spec.name;this.variables=spec.variables;this.formula=spec.formula;this.solvers=spec.solvers;this.output=spec.output;
    this.ast=M.parseExpression(spec.formula);
    var expected=this.variables[this.output].dimension,got=dimensionOfFormulaAst(this.ast,this.variables);
    if(!expected.equals(got))throw new DimensionError("Engineering relation '"+this.id+"' has invalid output dimensions",{expected:expected.key(),got:got.key()});
    Object.freeze(this);
  }
  solve(given){
    var names=Object.keys(this.variables),missing=names.filter(n=>!Object.prototype.hasOwnProperty.call(given,n));
    if(missing.length>1)throw new EngineeringError("Relation '"+this.id+"' needs more information",{missing:missing});
    if(missing.length===0){
      var expected=this.solvers[this.output](given),actual=given[this.output];
      var diff=qSub(actual,expected),err=Math.abs(scalarNumber(diff.baseValue)),scale=Math.max(1,Math.abs(scalarNumber(actual.baseValue)));
      return {consistent:err<=1e-10*scale,residual:err};
    }
    var target=missing[0],solver=this.solvers[target];if(!solver)throw new EngineeringError("Relation cannot solve for "+target);
    var q=solver(given),spec=this.variables[target];if(!(q instanceof Quantity))throw new EngineeringError("Relation solver returned a non-quantity");
    if(!q.dimension.equals(spec.dimension))throw new DimensionError("Relation solver produced wrong dimensions",{variable:target});
    if(spec.kind)q=new Quantity(q.baseValue,q.dimension,{kind:spec.kind,displayUnit:spec.unit?UNIT_REGISTRY.get(spec.unit):q.displayUnit,exact:q.exact});
    return {variable:target,quantity:q};
  }
}
function vs(unit,kind){
  var u=UNIT_REGISTRY.require(unit);return {dimension:u.dimension,kind:kind||u.kind,unit:unit};
}
const ENGINEERING_RELATIONS={};
function regRelation(spec){ENGINEERING_RELATIONS[spec.id]=new EngineeringRelation(spec);}

regRelation({id:"ohm",name:"Ohm's law",formula:"I*R",output:"V",variables:{V:vs("V","voltage"),I:vs("A","current"),R:vs("ohm","resistance")},solvers:{
  V:g=>qMul(g.I,g.R),I:g=>qDiv(g.V,g.R),R:g=>qDiv(g.V,g.I)
}});
regRelation({id:"power",name:"Electrical power",formula:"V*I",output:"P",variables:{P:vs("W","power"),V:vs("V","voltage"),I:vs("A","current")},solvers:{
  P:g=>qMul(g.V,g.I),V:g=>qDiv(g.P,g.I),I:g=>qDiv(g.P,g.V)
}});
regRelation({id:"force",name:"Newton's second law",formula:"m*a",output:"F",variables:{F:vs("N","force"),m:vs("kg","mass"),a:{dimension:DIMS.acceleration,kind:"acceleration"}},solvers:{
  F:g=>qMul(g.m,g.a),m:g=>qDiv(g.F,g.a),a:g=>qDiv(g.F,g.m)
}});
regRelation({id:"kinetic",name:"Kinetic energy",formula:"0.5*m*v^2",output:"E",variables:{E:vs("J","energy"),m:vs("kg","mass"),v:{dimension:DIMS.speed,kind:"speed"}},solvers:{
  E:g=>qMul(rat(1,2),qMul(g.m,qPow(g.v,rat(2)))),
  m:g=>qDiv(qMul(rat(2),g.E),qPow(g.v,rat(2))),
  v:g=>{var inner=qDiv(qMul(rat(2),g.E),g.m);return qCall("sqrt",[inner],{});}
}});
regRelation({id:"wave",name:"Wave relation",formula:"f*lambda",output:"v",variables:{v:{dimension:DIMS.speed,kind:"speed"},f:vs("Hz","frequency"),lambda:vs("m","length")},solvers:{
  v:g=>qMul(g.f,g.lambda),f:g=>qDiv(g.v,g.lambda),lambda:g=>qDiv(g.v,g.f)
}});
regRelation({id:"density",name:"Density",formula:"m/V",output:"rho",variables:{rho:{dimension:DIMS.density,kind:"density"},m:vs("g","mass"),V:{dimension:DIMS.volume,kind:"volume",unit:"L"}},solvers:{
  rho:g=>qDiv(g.m,g.V),m:g=>qMul(g.rho,g.V),V:g=>qDiv(g.m,g.rho)
}});

function splitArgs(text){
  var out=[],depth=0,start=0;
  for(var i=0;i<text.length;i++){if(text[i]==="(")depth++;else if(text[i]===")")depth--;else if(text[i]===","&&depth===0){out.push(text.slice(start,i).trim());start=i+1;}}
  out.push(text.slice(start).trim());return out;
}
function parseAssignmentArg(arg){
  var i=arg.indexOf("=");if(i<1)throw new EngineeringError("Engineering inputs use name=value syntax");
  return {name:arg.slice(0,i).trim(),value:arg.slice(i+1).trim()};
}
function runCommand(raw,env,options){
  raw=String(raw).trim();options=options||{};
  var m=raw.match(/^constant\s*\(([^()]*)\)$/);if(m){
    var key=m[1].trim(),c=CONSTANT_REGISTRY[key];if(!c)throw new UnitError("UNKNOWN_CONSTANT","Unknown physical constant '"+key+"'");
    var res=resultFor(c.quantity,options,{operation:"constant",constant:key,source:c.source,exact:c.exact});res.display=c.symbol+" = "+formatQuantity(c.quantity,options.precision);return res;
  }
  var e=raw.match(/^eng\s*\((.*)\)$/s);if(e){
    var args=splitArgs(e[1]),relationId=(args.shift()||"").trim(),rel=ENGINEERING_RELATIONS[relationId];if(!rel)throw new EngineeringError("Unknown engineering relation '"+relationId+"'");
    var given={};args.forEach(function(arg){var a=parseAssignmentArg(arg),spec=rel.variables[a.name];if(!spec)throw new EngineeringError("Unknown variable '"+a.name+"' for "+relationId);var q=parseQuantityExpression(a.value,env,options);if(!(q instanceof Quantity))throw new EngineeringError(a.name+" must be a quantity");if(!q.dimension.equals(spec.dimension))throw new DimensionError(a.name+" has incompatible dimensions");given[a.name]=q;});
    var solved=rel.solve(given);
    if(solved.consistent!==undefined)return {value:null,display:solved.consistent?"Inputs are consistent":"Inputs are inconsistent",approx:"",exact:true,kind:"engineering-check",quantity:false,metadata:{operation:"eng",relation:relationId,consistent:solved.consistent,residual:solved.residual}};
    var rr=resultFor(solved.quantity,options,{operation:"eng",relation:relationId,variable:solved.variable});rr.display=solved.variable+" = "+formatQuantity(solved.quantity,options.precision);return rr;
  }
  var cv=raw.match(/^convert\s*\((.*)\)$/s);if(cv){
    var ca=splitArgs(cv[1]);if(ca.length!==2)throw new UnitError("ARITY_ERROR","convert expects quantity and target unit");
    var cq=parseQuantityExpression(ca[0],env,options);if(!(cq instanceof Quantity))throw new DimensionError("convert expects a quantity");
    return resultFor(convertQuantity(cq,ca[1]),options,{operation:"convert"});
  }
  return null;
}

function tryEvaluate(raw,env,options){
  env=env||{};options=options||{};
  var command=runCommand(raw,env,options);if(command)return command;
  if(/^\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*\([^=]*\))?\s*=/.test(raw))return null;
  var toIndex=findTopLevelTo(raw);
  if(toIndex>=0){
    var left=raw.slice(0,toIndex).trim(),target=raw.slice(toIndex+4).trim(),q=parseQuantityExpression(left,env,options);
    if(!(q instanceof Quantity))throw new DimensionError("Left side of 'to' must be a quantity");
    return resultFor(convertQuantity(q,target),options,{operation:"convert",target:target});
  }
  if(!shouldTryQuantity(raw,env))return null;
  var value=parseQuantityExpression(raw,env,options);
  if(!(value instanceof Quantity))return resultFor(value,options,{operation:"quantity-expression"});
  return resultFor(value,options,{operation:"quantity-expression",dimension:value.dimension.key(),quantityKind:value.kind});
}

function convert(value,from,to){
  var q=quantityFromUnit(value,from),r=convertQuantity(q,to);return quantityDisplayValue(r);
}
function serializeQuantity(q){
  if(!(q instanceof Quantity))throw new UnitError("SERIALIZATION_ERROR","Expected Quantity");
  return {type:"quantity",baseValue:M.serializeValue(q.baseValue),dimension:q.dimension.toArray(),kind:q.kind,displayUnit:q.displayUnit?q.displayUnit.id:null,expressionUnits:q.expressionUnits||null,customDisplayScale:q.customDisplayScale?M.serializeValue(q.customDisplayScale):null,exact:q.exact};
}
function deserializeQuantity(data){
  if(!data||data.type!=="quantity")throw new UnitError("SERIALIZATION_ERROR","Invalid quantity payload");
  return new Quantity(M.deserializeValue(data.baseValue),new DimensionVector(data.dimension),{kind:data.kind,displayUnit:data.displayUnit?UNIT_REGISTRY.require(data.displayUnit):null,expressionUnits:data.expressionUnits,customDisplayScale:data.customDisplayScale?M.deserializeValue(data.customDisplayScale):null,exact:data.exact});
}

const CONVERTER_CATEGORIES=Object.freeze({
  length:["m","km","cm","mm","in","ft","yd","mi","nmi"],
  area:["m^2","km^2","cm^2","ft^2","in^2"],
  mass:["kg","g","mg","lb","oz"],
  time:["s","ms","min","hr","day","week"],
  speed:["m/s","km/hr","mi/hr","ft/s"],
  volume:["L","mL","m^3","USgal","USfloz"],
  temperature:["K","degC","degF","dK","dC","dF"],
  energy:["J","kJ","Wh","kWh","cal","eV"],
  pressure:["Pa","kPa","bar","psi"],
  information:["B","kB","MB","GB","KiB","MiB","GiB"],
  angle:["rad","deg","grad"]
});

function validateRegistry(){
  var errors=[];
  UNIT_REGISTRY.byId.forEach(function(u,id){if(!u.dimension)errors.push(id+": missing dimension");if(u.mode==="affine"&&!u.dimension.equals(DIMS.temperature))errors.push(id+": affine non-temperature unit");});
  Object.keys(ENGINEERING_RELATIONS).forEach(function(id){try{var r=ENGINEERING_RELATIONS[id];dimensionOfFormulaAst(r.ast,r.variables);}catch(e){errors.push(id+": "+e.message);}});
  if(errors.length)throw new UnitError("REGISTRY_INVALID","Unit/engineering registry validation failed",{errors:errors});
  return true;
}
validateRegistry();

global.CalcUnits={
  VERSION:"1.0.0-quantities",
  UnitError:UnitError,DimensionError:DimensionError,AffineUnitError:AffineUnitError,UnknownUnitError:UnknownUnitError,EngineeringError:EngineeringError,
  DimensionVector:DimensionVector,DIMS:DIMS,UnitDefinition:UnitDefinition,UnitRegistry:UnitRegistry,UNIT_REGISTRY:UNIT_REGISTRY,SI_PREFIXES:SI_PREFIXES,IEC_PREFIXES:IEC_PREFIXES,
  Quantity:Quantity,quantityFromUnit:quantityFromUnit,formatQuantity:formatQuantity,approxQuantity:approxQuantity,
  qAdd:qAdd,qSub:qSub,qMul:qMul,qDiv:qDiv,qPow:qPow,qNeg:qNeg,qCall:qCall,
  parseQuantityExpression:parseQuantityExpression,convertQuantity:convertQuantity,convert:convert,tryEvaluate:tryEvaluate,runCommand:runCommand,
  CONSTANT_REGISTRY:CONSTANT_REGISTRY,ENGINEERING_RELATIONS:ENGINEERING_RELATIONS,CONVERTER_CATEGORIES:CONVERTER_CATEGORIES,
  serializeQuantity:serializeQuantity,deserializeQuantity:deserializeQuantity,validateRegistry:validateRegistry,normalizeUnitInput:normalizeUnitInput
};
})(window);