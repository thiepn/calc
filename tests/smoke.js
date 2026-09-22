"use strict";
global.window=global;
require("../math.js");
const M=global.CalcMath;

function assert(cond,msg){if(!cond)throw new Error(msg);}
function eq(actual,expected,msg){if(actual!==expected)throw new Error((msg||"Mismatch")+": expected "+expected+", got "+actual);}

const env={};
eq(M.evaluate("1/3 + 1/6",env,{commit:true}).display,"1/2","exact rational arithmetic");
eq(M.evaluate("-2^2",env,{commit:true}).display,"-4","unary minus precedence");
eq(M.evaluate("(-2)^2",env,{commit:true}).display,"4","parenthesized power");
eq(M.evaluate("2^3^2",env,{commit:true}).display,"512","right associative powers");
eq(M.evaluate("a = 5",env,{commit:true}).display,"a = 5","assignment");
eq(M.evaluate("2a + 3",env,{commit:true}).display,"13","implicit multiplication");
eq(M.evaluate("gcd(84,30)",env,{commit:true}).display,"6","gcd");
eq(M.evaluate("ncr(10,3)",env,{commit:true}).display,"120","combinatorics");

const A=M.matrixFromStrings([["1","2"],["3","4"]],{},{commit:false});
eq(M.formatValue(M.determinant(A)),"-2","determinant");
const inv=M.matrixToStrings(M.inverse(A));
eq(inv[0][0],"-2","inverse 00");
eq(inv[0][1],"1","inverse 01");
eq(inv[1][0],"3/2","inverse 10");
eq(inv[1][1],"-1/2","inverse 11");
const rr=M.matrixToStrings(M.rref([A[0].slice(),[new M.Rational(2n),new M.Rational(4n)]]).matrix);
eq(rr[1][0],"0","rref zero row");

const st=M.stats([1,2,3,4]);
assert(Math.abs(st.mean-2.5)<1e-12,"mean");
assert(Math.abs(st.varianceSample-5/3)<1e-12,"sample variance");
const reg=M.linearRegression([1,2,3,4],[3,5,7,9]);
assert(Math.abs(reg.slope-2)<1e-12&&Math.abs(reg.intercept-1)<1e-12,"linear regression");

assert(Math.abs(M.convertUnit(72,"km/h","m/s","speed")-20)<1e-12,"speed conversion");
assert(Math.abs(M.convertUnit(0,"C","F","temperature")-32)<1e-12,"temperature conversion");

const loan=M.loan(1200,0,1,12);
assert(Math.abs(loan.payment-100)<1e-12,"zero-interest loan");
eq(M.dateDiffDays("2024-02-28","2024-03-01"),2,"leap day difference");

const tri=M.triangleSSS(3,4,5);
assert(Math.abs(tri.area-6)<1e-12,"triangle area");

eq(M.parseBigIntBase("FF",16).toString(),"255","hex parse");
eq(M.bitInterpret(255n,8,true).toString(),"-1","two's complement");

console.log("Calc smoke tests passed");