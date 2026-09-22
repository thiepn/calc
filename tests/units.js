"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../units.js");

const M=global.CalcMath;
const U=global.CalcUnits;

function assert(cond,msg){if(!cond)throw new Error(msg||"Assertion failed");}
function eq(actual,expected,msg){if(actual!==expected)throw new Error((msg||"Mismatch")+": expected "+expected+", got "+actual);}
function approx(actual,expected,tol,msg){if(Math.abs(actual-expected)>tol)throw new Error((msg||"Approx mismatch")+": expected "+expected+", got "+actual);}
function throwsCode(fn,code,msg){
  let ok=false;
  try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((msg||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}
  if(!ok)throw new Error((msg||"Expected error")+": "+code);
}

assert(U.validateRegistry(),"registry validation");

// Dimension algebra.
eq(U.DIMS.length.add(U.DIMS.time.scale(-1)).key(),U.DIMS.speed.key(),"speed dimension");
eq(U.DIMS.force.add(U.DIMS.length).key(),U.DIMS.energy.key(),"force times length dimension");
assert(U.DIMS.none.isDimensionless(),"dimensionless vector");

// Prefix engine and exact conversion factors.
eq(M.formatValue(U.UNIT_REGISTRY.require("km").scale),"1000","kilo prefix");
eq(M.formatValue(U.UNIT_REGISTRY.require("cm").scale),"1/100","centi prefix");
eq(M.formatValue(U.UNIT_REGISTRY.require("ms").scale),"1/1000","milli-second prefix");
eq(M.formatValue(U.UNIT_REGISTRY.require("kg").scale),"1","kilogram via gram prefix");
eq(M.formatValue(U.UNIT_REGISTRY.require("KiB").scale),"1024","IEC prefix");
eq(M.formatValue(U.UNIT_REGISTRY.require("kB").scale),"1000","SI information prefix");

// Direct quantity arithmetic.
let r=U.tryEvaluate("5 km + 300 m",{}, {precision:12,angle:"RAD"});
eq(r.display,"53/10 km","compatible addition preserves left display unit");
eq(r.approx,"≈ 5.3 km","quantity exact plus approximate display");

r=U.tryEvaluate("80 km / 1.25 hr to km/hr",{}, {precision:12,angle:"RAD"});
eq(r.display,"64 km/hr","speed calculation and composite conversion");

r=U.tryEvaluate("5 kg * 9.81 m/s^2",{}, {precision:12,angle:"RAD"});
eq(r.display,"981/20 N","mass times acceleration infers force");
eq(r.metadata.quantityKind,"force","force semantic kind");

// Squared/cubed prefix correctness.
eq(U.tryEvaluate("1 cm^2 to m^2",{},{}).display,"1/10000 m^2","square prefix");
eq(U.tryEvaluate("1 cm^3 to m^3",{},{}).display,"1/1000000 m^3","cube prefix");

// Dimensional safety.
throwsCode(()=>U.tryEvaluate("1 m + 1 s",{},{}),"DIMENSION_MISMATCH","incompatible addition");
throwsCode(()=>U.tryEvaluate("ln(2 m)",{},{}),"DIMENSION_MISMATCH","log dimensional input");
throwsCode(()=>U.tryEvaluate("sqrt(2 m)",{},{}),"DIMENSION_MISMATCH","sqrt odd dimension");

// Explicit angle quantities are independent of global angle mode.
approx(U.tryEvaluate("sin(90 deg)",{}, {angle:"RAD"}).value,1,1e-12,"explicit degree in RAD mode");
approx(U.tryEvaluate("sin(90 deg)",{}, {angle:"DEG"}).value,1,1e-12,"explicit degree in DEG mode");
approx(U.tryEvaluate("cos(pi rad)",{}, {angle:"DEG"}).value,-1,1e-12,"explicit radians");

// Affine temperature semantics.
eq(U.tryEvaluate("20 degC to degF",{},{}).display,"68 °F","Celsius to Fahrenheit");
eq(U.tryEvaluate("30 degC - 20 degC",{},{}).display,"10 Δ°C","absolute temperature subtraction gives delta");
eq(U.tryEvaluate("20 degC + 10 dC",{},{}).display,"30 °C","absolute plus difference");
throwsCode(()=>U.tryEvaluate("20 degC + 10 degC",{},{}),"AFFINE_UNIT_ERROR","absolute temperatures cannot be added");
throwsCode(()=>U.tryEvaluate("20 degC * 2",{},{}),"AFFINE_UNIT_ERROR","affine multiplication blocked");
eq(U.tryEvaluate("-273.15 degC to K",{},{}).display,"0 K","absolute zero accepted");
throwsCode(()=>U.tryEvaluate("-274 degC",{},{}),"PHYSICAL_DOMAIN_ERROR","below absolute zero rejected");
throwsCode(()=>U.tryEvaluate("1 K - 2 dK",{},{}),"PHYSICAL_DOMAIN_ERROR","temperature arithmetic cannot cross below absolute zero");

// SI vs IEC data.
eq(U.tryEvaluate("1 KiB to B",{},{}).display,"1024 B","IEC KiB");
eq(U.tryEvaluate("1 kB to B",{},{}).display,"1000 B","SI kB");
eq(U.tryEvaluate("8 bit to B",{},{}).display,"1 B","bit to byte");

// Semantic kind conservatism.
const energy=U.tryEvaluate("1 J",{},{}).value;
eq(energy.kind,"energy","joule semantic kind");
const torqueLike=U.tryEvaluate("1 N * 1 m",{},{}).value;
assert(torqueLike.kind!== "energy","N*m is not aggressively relabelled as energy");

// Constants.
const g0=U.tryEvaluate("constant(g0)",{},{});
assert(g0.display.startsWith("g0 = "),"constant command display");
assert(g0.exact===true&&g0.metadata.source,"standard gravity metadata");

const c0=U.tryEvaluate("c0",{},{}).value;
eq(U.formatQuantity(c0),"299792458 m/s","direct exact speed-of-light constant");
assert(U.CONSTANT_REGISTRY.h_planck.exact,"Planck constant exact by SI definition");
assert(U.formatQuantity(U.CONSTANT_REGISTRY.h_planck.quantity).includes("J*s"),"Planck constant preserves declared composite unit");
assert(U.formatQuantity(U.CONSTANT_REGISTRY.kB_const.quantity).includes("J/K"),"Boltzmann constant preserves declared composite unit");
assert(U.CONSTANT_REGISTRY.G_const.exact===false,"gravitational constant marked measured");

// Variable names win over unit symbols.
const env={m:new M.Rational(5n)};
eq(U.tryEvaluate("2m",env,{}).display,"10","user variable m wins over metre symbol");
eq(U.tryEvaluate("m = 5",env,{}),null,"assignments left to core evaluator");
eq(U.tryEvaluate("min(1,2)",{},{}),null,"min function is not mistaken for minute unit");

// Serialization round-trip.
const q=U.tryEvaluate("12.5 km/hr",{},{}).value;
const wire=JSON.parse(JSON.stringify(U.serializeQuantity(q)));
const restored=U.deserializeQuantity(wire);
eq(U.formatQuantity(restored),U.formatQuantity(q),"quantity serialization");
const composite=U.tryEvaluate("80 km / 1.25 hr to km/hr",{},{}).value;
const compositeWire=JSON.parse(JSON.stringify(U.serializeQuantity(composite)));
eq(U.formatQuantity(U.deserializeQuantity(compositeWire)),"64 km/hr","composite display scale serialization");

// Converter API.
eq(M.formatValue(U.convert(1,"mi","km")),"25146/15625","mile to kilometre exact");
eq(M.formatValue(U.convert(1,"degC","degF")),"169/5","affine converter exact");

// Engineering relations.
let eng=U.tryEvaluate("eng(ohm, V=12 V, R=6 ohm)",{},{});
eq(eng.display,"I = 2 A","Ohm relation solve current");

eng=U.tryEvaluate("eng(power, V=12 V, I=2 A)",{},{});
eq(eng.display,"P = 24 W","electrical power relation");

eng=U.tryEvaluate("eng(force, F=10 N, m=2 kg)",{},{});
eq(eng.display,"a = 5 m/s^2","Newton relation solve acceleration");

eng=U.tryEvaluate("eng(wave, f=2 Hz, lambda=3 m)",{},{});
eq(eng.display,"v = 6 m/s","wave relation");

eng=U.tryEvaluate("eng(ohm, V=12 V, I=2 A, R=6 ohm)",{},{});
eq(eng.display,"Inputs are consistent","relation overdetermined consistency check");
eng=U.tryEvaluate("eng(ohm, V=12 V, I=2 A, R=5 ohm)",{},{});
eq(eng.display,"Inputs are inconsistent","relation inconsistency detected");
throwsCode(()=>U.tryEvaluate("eng(ohm, V=12 V)",{},{}),"ENGINEERING_RELATION_ERROR","underdetermined relation");

// Property-style round-trip tests for exact multiplicative units.
const pairs=[["m","km"],["m","ft"],["kg","lb"],["s","hr"],["J","cal"],["Pa","bar"],["B","KiB"]];
for(const [a,b] of pairs){
  const source=U.quantityFromUnit(new M.Rational(12345n,67n),a);
  const bq=source.to(U.UNIT_REGISTRY.require(b));
  const back=bq.to(U.UNIT_REGISTRY.require(a));
  eq(M.formatValue(back.displayMagnitude()),"12345/67","unit round trip "+a+" -> "+b+" -> "+a);
}

console.log("Units quantities constants and engineering certification tests passed");
