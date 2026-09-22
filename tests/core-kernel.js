"use strict";
global.window=global;
require("../math.js");
const M=global.CalcMath;

function assert(cond,msg){if(!cond)throw new Error(msg||"Assertion failed");}
function eq(actual,expected,msg){if(actual!==expected)throw new Error((msg||"Mismatch")+": expected "+expected+", got "+actual);}
function approx(actual,expected,tol,msg){if(Math.abs(actual-expected)>tol)throw new Error((msg||"Approx mismatch")+": expected "+expected+", got "+actual);}
function throwsCode(fn,code,msg){
  let threw=false;
  try{fn();}catch(e){threw=true;if(e.code!==code)throw new Error((msg||"Wrong error code")+": expected "+code+", got "+e.code+" ("+e.message+")");}
  if(!threw)throw new Error((msg||"Expected error")+": expected "+code);
}

// Exact numeric tower and literal semantics.
eq(M.evaluate("0.1 + 0.2",{},{}).display,"3/10","finite decimals stay exact");
eq(M.evaluate(".5 + .25",{},{}).display,"3/4","leading-dot decimals");
eq(M.evaluate("1e-3",{},{}).display,"1/1000","scientific literal stays exact");
eq(M.evaluate("2e3 + 4",{},{}).display,"2004","positive scientific exponent stays exact");
eq(M.evaluate("999999999999999999999999999999 + 1",{},{}).display,"1000000000000000000000000000000","arbitrary integer arithmetic");
eq(M.evaluate("2/3 * 9/4",{},{}).display,"3/2","rational multiplication");
eq(M.evaluate("2² + 3³",{},{}).display,"31","superscript normalization");
eq(M.evaluate("20%",{},{}).display,"1/5","postfix percentage");
eq(M.evaluate("100 * 20%",{},{}).display,"20","percentage multiplication");
eq(M.evaluate("100 + 20%",{},{}).display,"501/5","percentage is a value, not contextual percent-add");

// Parser precedence and implicit multiplication.
eq(M.evaluate("-2^2",{},{}).display,"-4","unary minus precedence");
eq(M.evaluate("(-2)^2",{},{}).display,"4","grouped negative power");
eq(M.evaluate("2^3^2",{},{}).display,"512","power is right associative");
eq(M.evaluate("2(3+4)",{},{}).display,"14","implicit multiplication before grouping");
eq(M.evaluate("2pi",{},{}).kind,"real","constant implicit multiplication");
throwsCode(()=>M.evaluate("1..2",{},{}),"PARSE_ERROR","malformed decimal rejected");
throwsCode(()=>M.evaluate("2 3",{},{}),"PARSE_ERROR","adjacent numeric literals rejected");

// Exact roots and complex promotion.
eq(M.evaluate("sqrt(81)",{},{}).display,"9","perfect-square root exact");
eq(M.evaluate("sqrt(1/4)",{},{}).display,"1/2","perfect rational square root exact");
const sqNeg=M.evaluate("sqrt(-4)",{},{complex:true});
eq(sqNeg.display,"2i","negative square root promotes to exact complex");
assert(sqNeg.exact,"sqrt(-4) should be exact complex");
eq(M.evaluate("(1+i)^2",{},{}).display,"2i","exact complex integer power");
const complexFraction=M.evaluate("(1/2 + i/3) + (1/2 - i/3)",{},{});
eq(complexFraction.display,"1","exact complex cancellation");
throwsCode(()=>M.evaluate("sqrt(-1)",{},{complex:false}),"DOMAIN_ERROR","real-only square root rejects negative");

// Deliberate power/domain semantics.
throwsCode(()=>M.evaluate("0^0",{},{}),"DOMAIN_ERROR","0^0 policy");
throwsCode(()=>M.evaluate("1/0",{},{}),"DIVISION_BY_ZERO","division by zero typed");
throwsCode(()=>M.evaluate("0^-1",{},{}),"DIVISION_BY_ZERO","negative power of zero");
throwsCode(()=>M.evaluate("exp(10000)",{},{}),"NON_FINITE_RESULT","non-finite results do not leak");

// Angle modes and exact common-degree values.
eq(M.evaluate("sin(30)",{},{angle:"DEG"}).display,"1/2","sin 30 degrees exact");
eq(M.evaluate("cos(60)",{},{angle:"DEG"}).display,"1/2","cos 60 degrees exact");
eq(M.evaluate("tan(45)",{},{angle:"DEG"}).display,"1","tan 45 degrees exact");
eq(M.evaluate("asin(1/2)",{},{angle:"DEG"}).display,"30","asin exact degree value");
throwsCode(()=>M.evaluate("tan(90)",{},{angle:"DEG"}),"DOMAIN_ERROR","undefined degree tangent");
eq(M.evaluate("sin(0)",{},{angle:"RAD"}).display,"0","sin zero exact");

// Variables, preview isolation, and controlled environment-chain lookup.
const env={};
eq(M.evaluate("a = 5",env,{commit:true}).display,"a = 5","assignment");
eq(M.evaluate("2a + 1",env,{}).display,"11","committed variable lookup");
const preview=Object.create(env);
eq(M.evaluate("3a",preview,{commit:false}).display,"15","preview can read inherited environment");
M.evaluate("b = 9",preview,{commit:false});
assert(!Object.prototype.hasOwnProperty.call(preview,"b")&&!Object.prototype.hasOwnProperty.call(env,"b"),"preview assignment must not mutate environment");

// User-defined functions, multiple arguments, and nested function lookup.
M.evaluate("f(x, y) = x^2 + y",env,{commit:true});
eq(M.evaluate("f(3, 4)",env,{}).display,"13","multi-argument user function");
M.evaluate("g(t) = f(t, 2)",env,{commit:true});
eq(M.evaluate("g(5)",env,{}).display,"27","user function can call earlier user function");
throwsCode(()=>M.evaluate("f(1)",env,{}),"ARITY_ERROR","user-function arity");
throwsCode(()=>M.evaluate("pi = 3",env,{}),"INVALID_IDENTIFIER","constants cannot be overwritten");
throwsCode(()=>M.evaluate("sin = 3",env,{}),"INVALID_IDENTIFIER","built-ins cannot be overwritten");
throwsCode(()=>M.evaluate("__proto__ = 1",env,{}),"INVALID_IDENTIFIER","prototype pollution identifier blocked");

// Built-in arity, combinatorics, integer semantics.
eq(M.evaluate("gcd(84, 30)",{},{}).display,"6","gcd");
eq(M.evaluate("lcm(12, 18)",{},{}).display,"36","lcm");
eq(M.evaluate("mod(-1, 5)",{},{}).display,"4","canonical positive modulus");
eq(M.evaluate("ncr(10, 3)",{},{}).display,"120","nCr");
eq(M.evaluate("npr(10, 3)",{},{}).display,"720","nPr");
throwsCode(()=>M.evaluate("sqrt(1,2)",{},{}),"ARITY_ERROR","built-in arity typed");
throwsCode(()=>M.evaluate("(-1)!",{},{}),"DOMAIN_ERROR","factorial domain");

// Structured result metadata.
const result=M.evaluate("1/3",{}, {angle:"DEG",precision:10});
eq(result.kind,"rational","result numeric kind");
assert(result.exact===true,"rational result exact flag");
eq(result.metadata.angleMode,"DEG","result angle metadata");
eq(result.metadata.normalizedSource,"1/3","normalized source metadata");
assert(result.approx.startsWith("≈ "),"fraction carries approximate view");

// Source spans and AST round-trip serialization.
const ast=M.parseExpression("2*(x+3)");
assert(ast.start===0&&ast.end===7,"AST root span");
const astWire=M.serializeAst(ast);
const ast2=M.deserializeAst(astWire);
const astEnv={x:new M.Rational(4n)};
eq(M.formatValue(M.evaluateAst(ast2,astEnv,{},0)),"14","AST serialization round trip");

// Value serialization preserves exactness and complex components.
const wire=M.serializeValue(new M.Complex(new M.Rational(1n,3n),new M.Rational(-2n,5n)));
const restored=M.deserializeValue(wire);
assert(restored instanceof M.Complex&&M.isExactValue(restored),"complex round trip exact");
eq(M.formatValue(restored),"1/3 − 2/5i","complex serialization formatting");

// Rational algebra property checks with deterministic pseudo-random cases.
let seed=0x12345678;
function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed;}
for(let i=0;i<250;i++){
  const an=BigInt((rnd()%2001)-1000),ad=BigInt((rnd()%99)+1);
  const bn=BigInt((rnd()%2001)-1000),bd=BigInt((rnd()%99)+1);
  const a=new M.Rational(an,ad),b=new M.Rational(bn,bd);
  eq(M.formatValue(M.add(a,b)),M.formatValue(M.add(b,a)),"rational addition commutative #"+i);
  eq(M.formatValue(M.mul(a,b)),M.formatValue(M.mul(b,a)),"rational multiplication commutative #"+i);
  eq(M.formatValue(M.sub(M.add(a,b),b)),M.formatValue(a),"add/sub inverse #"+i);
  if(!b.isZero())eq(M.formatValue(M.div(M.mul(a,b),b)),M.formatValue(a),"mul/div inverse #"+i);
  assert(a.d>0n&&M.gcdBig(a.n,a.d)===1n,"rational canonical invariant #"+i);
}

// Matrix consumers still receive exact scalar behavior after kernel replacement.
const A=M.matrixFromStrings([["1/3","2"],["3","4"]],{},{commit:false});
eq(M.formatValue(M.determinant(A)),"-14/3","exact matrix determinant after kernel hardening");
const I=M.matMul(A,M.inverse(A));
const Is=M.matrixToStrings(I);
eq(Is[0][0],"1","inverse reconstruction 00");
eq(Is[0][1],"0","inverse reconstruction 01");
eq(Is[1][0],"0","inverse reconstruction 10");
eq(Is[1][1],"1","inverse reconstruction 11");

// Error position/type sanity.
try{M.parseExpression("1 + @");throw new Error("expected parse error");}
catch(e){eq(e.code,"PARSE_ERROR","parse error code");assert(Number.isInteger(e.start),"parse error source start");}

console.log("Core kernel hardening tests passed");