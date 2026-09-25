"use strict";
global.window=global;
require("../math.js");
require("../discrete-mathematics.js");

const D=global.CalcDiscrete;
function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,m){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}

// Exact counting and classical sequences.
eq(D.VERSION,"2.6.0-u7","U7 version");
eq(D.chooseBig(52n,5n),2598960n,"52 choose 5");
eq(D.permutationBig(10n,3n),720n,"10 P 3");
eq(D.multinomialBig(10n,[2n,3n,5n]),2520n,"multinomial");
eq(D.catalanBig(10n),16796n,"Catalan C10");
eq(D.stirlingSecondBig(5n,2n),15n,"Stirling second kind");
eq(D.stirlingFirstUnsignedBig(5n,2n),50n,"unsigned Stirling first kind");
eq(D.bellBig(5n),52n,"Bell B5");
eq(D.derangementBig(6n),265n,"derangements !6");
eq(D.partitionCountBig(10n),42n,"integer partitions p(10)");
eq(D.starsAndBars(7n,3n,false),36n,"nonnegative stars and bars");
eq(D.starsAndBars(7n,3n,true),15n,"positive stars and bars");
eq(D.pigeonholeMinimum(10n,3n),4n,"pigeonhole lower bound");
eq(D.cayleyTreesBig(5n),125n,"Cayley labeled trees");
eq(D.fibonacciBig(100n),354224848179261915075n,"Fibonacci fast doubling");
throwsCode(()=>D.chooseBig(10001n,1n),"DISCRETE_COMPLEXITY_LIMIT","counting safety bound");

// Modular arithmetic and exact congruences.
let e=D.extendedGcd(240n,46n);eq(e.gcd,2n,"extended gcd");eq(240n*e.x+46n*e.y,2n,"Bezout certificate");
eq(D.modularInverse(3n,11n),4n,"modular inverse");
eq(D.modularPower(2n,1000n,1009n),942n,"modular exponentiation");
let cr=D.crt([[2n,3n],[3n,5n],[2n,7n]]);eq(cr.residue,23n,"CRT residue");eq(cr.modulus,105n,"CRT modulus");
cr=D.crt([[2n,6n],[8n,14n]]);eq(cr.residue,8n,"generalized CRT residue");eq(cr.modulus,42n,"generalized CRT lcm modulus");
throwsCode(()=>D.crt([[0n,2n],[1n,2n]]),"INCONSISTENT_CONGRUENCES","incompatible CRT");
let lc=D.solveLinearCongruence(14n,30n,100n);eq(lc.base,45n,"linear congruence base");eq(lc.reducedModulus,50n,"linear congruence reduced modulus");eq(lc.solutionCount,2n,"linear congruence solution count");

// Finite sets.
let A=D.parseSet("a,b,c"),B=D.parseSet("b,c,d");
eq(D.setUnion(A,B).join(","),"a,b,c,d","set union");
eq(D.setIntersection(A,B).join(","),"b,c","set intersection");
eq(D.setDifference(A,B).join(","),"a","set difference");
eq(D.setSymmetricDifference(A,B).join(","),"a,d","symmetric difference");
eq(D.cartesianProduct(["a","b"],["1","2"]).length,4,"cartesian product");
eq(D.powerSet(["a","b","c"]).length,8,"powerset");
throwsCode(()=>D.powerSet(Array.from({length:13},(_,i)=>String(i))),"DISCRETE_COMPLEXITY_LIMIT","powerset safety bound");

// Constant-coefficient recurrences and OGF construction.
eq(D.linearRecurrenceTerm([1n,1n],[0n,1n],20n),6765n,"Fibonacci recurrence term");
eq(D.linearRecurrenceSequence([1n,1n],[0n,1n],10n).join(","),"0,1,1,2,3,5,8,13,21,34","recurrence sequence");
let gf=D.recurrenceGeneratingFunction([1n,1n],[0n,1n]);eq(gf.numerator.join(","),"0,1","Fibonacci OGF numerator");eq(gf.denominator.join(","),"1,-1,-1","Fibonacci OGF denominator");

// Propositional logic.
let t=D.truthTable("p -> q");eq(t.trueCount,3,"implication true rows");eq(t.falseCount,1,"implication false rows");eq(t.classification,"contingency","implication classification");
eq(D.truthTable("p | !p").classification,"tautology","excluded middle");
eq(D.truthTable("p & !p").classification,"contradiction","contradiction");
assert(D.logicEquivalent("!(p & q)","!p | !q").equivalent,"De Morgan equivalence");
assert(!D.logicEquivalent("p","q").equivalent,"non-equivalence witness");
eq(D.canonicalCNF("p -> q").form,"(!p | q)","canonical CNF");
throwsCode(()=>D.truthTable("a&b&c&d&e&f&g&h&i"),"DISCRETE_COMPLEXITY_LIMIT","truth-table safety bound");

// Relations, equivalence classes, closures, and Hasse covers.
let u=["a","b","c"],pairs=D.parseRelationPairs(u,"a>a,b>b,c>c,a>b,b>a"),ra=D.analyzeRelation(u,pairs);
assert(ra.reflexive&&ra.symmetric&&ra.transitive&&ra.equivalence,"equivalence relation certificate");
eq(D.equivalenceClasses(u,pairs).length,2,"equivalence classes");
let poU=["1","2","4"],po=D.parseRelationPairs(poU,"1>1,2>2,4>4,1>2,1>4,2>4");ra=D.analyzeRelation(poU,po);assert(ra.partialOrder&&ra.total,"total partial order");
eq(D.hasseCover(poU,po).map(x=>x.join(">" )).join(","),"1>2,2>4","Hasse cover");
let tc=D.relationClosure(["a","b","c"],D.parseRelationPairs(["a","b","c"],"a>b,b>c"),"transitive");assert(tc.some(p=>p[0]==="a"&&p[1]==="c"),"transitive closure");

// Finite graph algorithms.
let gi=D.graphInfo(["a","b","c"],"a-b,b-c,c-a",false);assert(gi.connected&&gi.hasCycle&&!gi.bipartite&&!gi.tree,"triangle graph analysis");
let sp=D.shortestPath(["a","b","c","d"],"a-b:1,b-c:2,a-c:5,c-d:1","a","d",false);assert(sp.reachable,"shortest path reachable");eq(sp.distance,4n,"Dijkstra distance");eq(sp.path.join(","),"a,b,c,d","Dijkstra path");
let mst=D.minimumSpanningTree(["a","b","c","d"],"a-b:1,b-c:2,a-c:5,c-d:1");eq(mst.weight,4n,"Kruskal MST weight");eq(mst.edges.length,3,"Kruskal edge count");
eq(D.topologicalSort(["a","b","c","d"],"a>b,a>c,b>d,c>d").join(","),"a,b,c,d","topological sort");
throwsCode(()=>D.topologicalSort(["a","b"],"a>b,b>a"),"GRAPH_CYCLE","topological cycle rejection");
let et=D.eulerTrail(["a","b","c"],"a-b,b-c,c-a",false);eq(et.type,"circuit","Euler circuit");eq(et.path.length,4,"Euler traversal length");
let ch=D.chromaticNumber(["a","b","c"],"a-b,b-c,c-a");eq(ch.chromaticNumber,3,"triangle chromatic number");
let pd=D.pruferDecode([4n,4n,4n]);eq(pd.vertexCount,5,"Pruefer vertex count");eq(pd.edges.length,4,"Pruefer edge count");
throwsCode(()=>D.shortestPath(["a","b"],"a-b:-1","a","b",false),"NEGATIVE_EDGE","Dijkstra negative edge rejection");

// Command surface and exact Rational integration.
let cmd=D.runCommand("choose(52;5)");assert(cmd.display.includes("2598960")&&cmd.value instanceof global.CalcMath.Rational&&cmd.metadata.u7,"choose command contract");
assert(D.runCommand("crt(2,3;3,5;2,7)").display.includes("23"),"CRT command");
assert(D.runCommand("linrec(1,1;0,1;20)").display.includes("6765"),"recurrence command");
assert(D.runCommand("truth(p -> q)").display.includes("3/4"),"truth command");
assert(D.runCommand("relation(a,b; a>a,b>b)").metadata.partialOrder,"relation command");
assert(D.runCommand("shortest(a,b,c,d; a-b:1,b-c:2,a-c:5,c-d:1; a; d)").display.includes("distance = 4"),"shortest command");
assert(D.runCommand("chromatic(a,b,c; a-b,b-c,c-a)").display.includes("χ = 3"),"chromatic command");
assert(D.runCommand("discretehelp()").display.includes("pruferdecode"),"U7 help");
eq(D.runCommand("2+2"),null,"ordinary expression ignored by U7 router");

console.log("Discrete Mathematics & Combinatorics U7 certification tests passed");
