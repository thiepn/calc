# Discrete Mathematics & Combinatorics Semantics — U7

Calc v2.6.0 adds a dedicated exact discrete-mathematics layer through `discrete-mathematics.js`. It is available from **Calculate** and **Worksheet Math** blocks and is intentionally bounded so a finite combinatorics request cannot lock the local-first PWA.

U7 favors exact integer results, deterministic finite structures, explicit witnesses/certificates, and explicit failure over heuristic answers.

## 1. Exactness and result contract

Counting, congruence, recurrence, shortest-path, MST, and chromatic-number commands use JavaScript `BigInt` internally whenever the mathematical result is integral. Scalar command results are returned as Calc `Rational(integer, 1)` values, so they remain exact and can participate in the existing calculation/result pipeline.

Every routed U7 result has `metadata.u7 === true`. Commands that return structures keep their usable information in JSON-safe metadata; internal `BigInt` data is converted to strings before crossing that boundary where necessary.

`discretehelp()` lists the complete U7 command surface.

## 2. Counting and combinatorics

| Command | Meaning |
| --- | --- |
| `choose(n; k)` | Binomial coefficient `C(n,k)` |
| `permute(n; k)` | Ordered selections `P(n,k)` |
| `multinomial(n; k1,k2,...)` | Multinomial coefficient, with parts summing to `n` |
| `catalan(n)` | Catalan number `C_n = binom(2n,n)/(n+1)` |
| `stirling1(n; k)` | **Unsigned** Stirling number of the first kind |
| `stirling2(n; k)` | Stirling number of the second kind |
| `bell(n)` | Bell number |
| `derange(n)` | Number of derangements `!n` |
| `partitioncount(n)` | Integer partition number `p(n)` |
| `starsbars(n; k; mode)` | Stars-and-bars count; `mode` is `nonnegative` or `positive` |
| `pigeonhole(items; boxes)` | Guaranteed maximum occupancy lower bound `ceil(items/boxes)` |
| `cayley(n)` | Number of labeled trees on `n` vertices, `n^(n-2)` for `n >= 2` |
| `fib(n)` | Fibonacci number with `F_0=0`, `F_1=1` |

Examples:

```text
choose(52; 5)
multinomial(10; 2,3,5)
catalan(10)
stirling2(8; 3)
partitioncount(100)
starsbars(7; 3; positive)
cayley(8)
fib(1000)
```

Out-of-range `k` in `choose` or `permute` returns zero. A multinomial request whose parts do not sum to `n` is invalid rather than silently adding an omitted category.

## 3. Modular arithmetic and congruences

```text
egcd(240; 46)
modinv(3; 11)
modpow(2; 1000; 1009)
crt(2,3; 3,5; 2,7)
lincong(14; 30; 100)
```

`egcd(a;b)` returns a gcd together with Bézout coefficients `x,y` satisfying `a*x + b*y = gcd(a,b)`.

`modinv(a;m)` requires `m > 0` and `gcd(a,m)=1`.

`crt(...)` implements the **generalized Chinese remainder theorem**. Moduli do not need to be pairwise coprime. Compatible congruences are merged into one canonical residue modulo the least common multiple; incompatible systems fail with `INCONSISTENT_CONGRUENCES`.

`lincong(a;b;m)` solves `a*x ≡ b (mod m)`. The result reports one base residue, the reduced solution modulus, and the number of solution classes modulo the original modulus.

## 4. Finite sets

```text
setunion(a,b,c; b,c,d)
setintersect(a,b,c; b,c,d)
setdiff(a,b,c; b,c,d)
setsymdiff(a,b,c; b,c,d)
cartesian(a,b; 1,2,3)
powerset(a,b,c)
```

Set elements are finite opaque string atoms. Duplicate input elements collapse to one element. Output order is deterministic and follows first appearance rather than applying an implicit numeric or lexical sort.

`cartesian` materializes the ordered-pair set. `powerset` materializes every subset, so both have hard safety caps.

## 5. Constant-coefficient linear recurrences

For coefficient list `c1,...,ck` and initial values `a0,...,a(k-1)`, U7 uses

```text
a_n = c1*a_(n-1) + c2*a_(n-2) + ... + ck*a_(n-k).
```

Commands:

```text
linrec(1,1; 0,1; 20)
recseq(1,1; 0,1; 15)
recgf(1,1; 0,1)
```

`linrec` returns one exact term. `recseq` returns the first requested number of terms. `recgf` constructs the ordinary generating function

```text
A(x) = N(x) / (1 - c1*x - c2*x^2 - ... - ck*x^k)
```

with the numerator derived exactly from the supplied initial values. Indices are zero-based.

U7 does not claim a symbolic closed form for arbitrary recurrences.

## 6. Propositional logic

Supported operators, from strongest to weakest precedence, are:

1. `!` or `~` — NOT
2. `&`, `&&`, or `and` — AND
3. `^` or `xor` — XOR
4. `|`, `||`, or `or` — OR
5. `->` or `=>` — implication (right-associative)
6. `<->` or `<=>` — equivalence

Constants are `T`, `F`, `true`, `false`, `1`, and `0`.

```text
truth((p -> q) & (q -> r))
equiv(!(p & q); !p | !q)
cnf(p -> q)
dnf(p ^ q)
```

`truth` exhaustively enumerates assignments and classifies the proposition as a **tautology**, **contradiction**, or **contingency**. `equiv` returns a concrete counterexample assignment when the propositions differ.

`cnf` and `dnf` return **canonical** conjunctive/disjunctive normal forms derived from the truth table. They are not Boolean-minimized forms.

Truth-table based operations are limited to 8 distinct proposition variables (at most 256 rows).

## 7. Relations, equivalence relations, and posets

Relations are given over an explicit finite universe. A pair `a>b` means `(a,b)` belongs to the relation; it is not a numeric comparison.

```text
relation(1,2,4; 1>1,2>2,4>4,1>2,1>4,2>4)
relclosure(transitive; a,b,c; a>b,b>c)
equivclasses(a,b,c; a>a,b>b,c>c,a>b,b>a)
hasse(1,2,4; 1>1,2>2,4>4,1>2,1>4,2>4)
```

`relation` certifies reflexive, irreflexive, symmetric, antisymmetric, asymmetric, transitive, total, equivalence-relation, partial-order, and strict-partial-order properties.

`relclosure(type;...)` supports `reflexive`, `symmetric`, `transitive`, and `equivalence` closures.

`equivclasses` only accepts a certified equivalence relation. `hasse` only accepts a certified partial order and removes reflexive and transitively implied edges to return the cover relation.

## 8. Finite graph algorithms

Vertices are explicit string atoms. U7 graph algorithms use simple graphs: duplicate edges are rejected. Undirected edges use `u-v`; directed edges use `u>v`. An optional exact integer weight is appended with `:w`.

```text
graphinfo(a,b,c; a-b,b-c,c-a)
graphinfo(a,b,c; a>b,b>c; directed)
shortest(a,b,c,d; a-b:1,b-c:2,a-c:5,c-d:1; a; d)
mst(a,b,c,d; a-b:1,b-c:2,a-c:5,c-d:1)
toposort(a,b,c,d; a>b,a>c,b>d,c>d)
eulertrail(a,b,c; a-b,b-c,c-a)
chromatic(a,b,c; a-b,b-c,c-a)
pruferdecode(4,4,4)
```

### Graph analysis

For undirected graphs `graphinfo` reports components, degrees, connectedness, cycle status, bipartiteness, forest status, and tree status. For directed graphs it reports weak components, strongly connected components, directed-cycle status, strong connectedness, and DAG status.

### Shortest paths

`shortest` uses Dijkstra's algorithm and therefore requires **nonnegative integer edge weights**. Negative edges fail with `NEGATIVE_EDGE`; U7 does not silently substitute another algorithm.

### Minimum spanning trees

`mst` uses Kruskal's algorithm and requires a connected undirected graph. It returns the exact total integer weight and selected edges.

### Topological order

`toposort` is defined only for directed acyclic graphs. A cycle fails with `GRAPH_CYCLE`.

### Euler trails

`eulertrail` verifies the relevant degree conditions and connectedness of the non-isolated part before applying Hierholzer's traversal. The result is labeled `trail` or `circuit`.

### Exact chromatic number

`chromatic` uses exact backtracking rather than a greedy approximation. Because exact coloring is exponential in the worst case, it is limited to 12 vertices. Graphs with loops have no proper vertex coloring and are rejected.

### Prüfer codes

`pruferdecode` decodes a labeled-tree Prüfer sequence using labels `1..n`, where `n = code length + 2`.

## 9. Safety limits

U7 intentionally rejects inputs that could make a browser tab unresponsive. Current public limits are exposed as `CalcDiscrete.LIMITS`:

- combinatorial `n`: 10,000;
- Stirling table `n`: 300;
- Bell number `n`: 200;
- partition count `n`: 10,000;
- recurrence order: 64;
- recurrence index: 10,000;
- materialized recurrence sequence: 2,000 terms;
- truth-table variables: 8;
- explicit powerset: 12 elements;
- Cartesian product: 10,000 pairs;
- relation universe: 250 elements;
- graph: 2,000 vertices / 20,000 edges;
- exact chromatic number: 12 vertices.

Exceeding a U7 safety bound fails with `DISCRETE_COMPLEXITY_LIMIT`.

## 10. Deliberate boundaries

U7 does **not** implement unrestricted SAT/SMT solving, Boolean minimization, symbolic graph enumeration, multigraph edge multiplicity, negative-weight shortest paths/Bellman–Ford, network flow, matching, planarity certification, graph isomorphism, arbitrary recurrence closed forms, integer programming, or asymptotic-complexity proof automation.

Those are distinct systems with their own correctness and performance requirements. U7 keeps Calc's discrete layer focused on exact undergraduate-level discrete mathematics and finite combinatorics with predictable local execution.

## 11. Integration contract

- Runtime global: `window.CalcDiscrete`.
- Runtime version: `2.6.0-u7`.
- Calculate and Worksheet Math route U7 commands before the ordinary expression evaluator.
- U7 does not consume ordinary arithmetic expressions: `runCommand("2+2")` returns `null`.
- The service worker caches `discrete-mathematics.js` for offline use.
- CI and the release-soak gate syntax-check and execute `tests/discrete-mathematics.js`.
