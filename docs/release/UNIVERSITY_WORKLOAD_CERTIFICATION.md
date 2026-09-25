# U8 — Final University-Workload Audit & Certification

Calc v2.7.0 is the final consolidation phase of the University Mathematics Workstation roadmap.

U8 does not introduce another mathematical engine. It certifies that the existing system behaves coherently as one local-first undergraduate mathematics workstation across the U1–U7 layers and the foundational matrix/statistics/units/graph/worksheet systems.

## Certification target

The target is computational work typical of an undergraduate **Wirtschaftsmathematik / applied mathematics** program:

- symbolic algebra and calculus;
- multivariable and vector calculus;
- ordinary differential equations and dynamical systems;
- constrained and unconstrained optimization;
- linear and advanced linear algebra;
- numerical analysis;
- discrete mathematics and combinatorics;
- probability, statistics and regression;
- quantities, engineering relations and unit conversion;
- 2D mathematical graphing;
- multi-step Worksheet workflows.

This is a computational workstation certification, not a claim that Calc is a universal theorem prover or a replacement for specialist PDE, stochastic-process, integer-programming, or industrial sparse-linear-algebra software.

## U1–U7 certified composition

| Phase | Layer | U8 composition checks |
| --- | --- | --- |
| U1 | Advanced CAS | assumption-aware symbolic routing, unsupported-case honesty, symbolic result state |
| U2 | Multivariable & Vector Calculus | gradient/vector command routing and Worksheet interoperability |
| U3 | ODEs & Dynamical Systems | ownership of `stability(...)`, dynamical classifications, router collision protection |
| U4 | Optimization | exact LP execution and integration with shared expression/matrix kernels |
| U5 | Advanced Linear Algebra | spectral matrix-function execution and Matrix kernel compatibility |
| U6 | Numerical Mathematics | approximate-result semantics, quadrature agreement, numerical method preconditions |
| U7 | Discrete Mathematics & Combinatorics | exact integer semantics, recurrence parity, graph algorithms, bounded exhaustive methods |

## Exact vs approximate semantics

U8 explicitly verifies the distinction that Calc uses throughout the product:

- finite decimal arithmetic such as `0.1 + 0.2` remains exact Rational arithmetic;
- U7 integral counting/congruence results remain exact;
- exact matrix operations preserve exact scalar values when supported;
- U6 numerical methods are marked approximate even when a displayed decimal happens to be simple;
- symbolic U1 output remains symbolically typed instead of being mislabeled exact numeric output;
- Worksheet references preserve exact Rational values and safely canonicalize finite numerical results.

The certification suite checks these state flags as well as displayed answers.

## Cross-module consistency checks

U8 adds direct cross-checks rather than only repeating individual module tests:

- core `ncr(10,3)` agrees with U7 `choose(10;3)`;
- U7 `fib(20)` agrees with the U7 generic linear-recurrence engine;
- numerical Simpson quadrature for a polynomial agrees with its analytic value within the certified tolerance;
- U5 spectral square-root output is checked against a matrix with an obvious exact square root;
- core Linear Algebra determinant behavior remains exact;
- unit conversion remains exact where the registry defines exact conversion factors;
- the probability/statistics runtime and graph parser remain load-compatible with the university stack.

## Router ownership and command collisions

Calculate and Worksheet Math use the same ordered university routing surface.

U8 verifies that:

- ordinary arithmetic still reaches the core evaluator;
- U1–U7 routers return `null` for ordinary arithmetic they do not own;
- U3 retains `stability(...)` for dynamical-system equilibrium analysis;
- U6 retains `absstability(...)` for one-step numerical ODE stability;
- U7 remains additive and does not consume unrelated expressions.

This prevents later modules from silently changing the meaning of established commands.

## Worksheet interoperability

The final deterministic and browser certification suites build mixed university notebooks containing U1/U2/U4/U6/U7 work.

Certified behaviors include:

- dependency discovery;
- exact block references;
- numerical block references;
- serialized result reuse;
- JSON-safe stored notebook payloads;
- normalization after a persistence round trip;
- cached re-evaluation without recomputing clean blocks;
- no false dependencies from university command names.

A representative certified chain is:

```text
choose(10; 3)
→ {{block:...}} / 10
→ exact 12

interp(0,1,2; 0,1,4; 1.5)
→ {{block:...}} + 1/4
→ canonical 5/2
```

## Malformed and unsupported input honesty

U8 preserves Calc's established rule: unsupported is not silently converted into a guessed answer.

The final gate exercises examples including:

- non-elementary symbolic integration outside the certified U1 rules;
- U6 conjugate gradient on a non-SPD matrix;
- U7 truth tables beyond the exhaustive variable budget;
- Dijkstra requests with negative edge weights.

Each must fail with a typed, intentional error.

## Performance and bounded execution

The university workstation remains local-first and browser-resident. Exact or exhaustive systems therefore expose explicit complexity limits rather than attempting unbounded work.

U8 verifies that the documented safety mechanisms remain in place, including limits around:

- symbolic expression/evaluation complexity;
- numerical iteration budgets;
- matrix decomposition iteration bounds;
- U7 powersets, truth tables, relation universes, graph sizes and exact coloring;
- Notebook block/import limits;
- Graph sampling/contour budgets;
- production bundle-size budgets.

## Browser, mobile, PWA and accessibility certification

The release soak continues across:

- Chromium;
- Firefox;
- WebKit;
- mobile Chromium.

U8 adds a browser-level university workload that executes U1 through U7 sequentially in one session and verifies:

- no runtime page errors;
- exact/symbolic/approximate status presentation;
- command-palette university discoverability;
- mixed Worksheet serialization and caching;
- mobile horizontal-layout containment;
- service-worker inclusion of the U7 runtime;
- release/app version parity.

The final browser contract also checks that existing accessibility/resilience provisions remain present:

- visible `:focus-visible` treatment;
- `prefers-reduced-motion` handling;
- expression and graph accessible labels;
- polite live-result announcements;
- the installed-PWA zoom policy already adopted by Calc.

## Release gate

v2.7.0 is accepted only when all of the following pass:

1. every existing deterministic subsystem suite;
2. U1–U7 dedicated certification suites;
3. `tests/university-workload.js`;
4. the static release-candidate gate;
5. the production release gate;
6. the full Playwright browser matrix;
7. `tests/university-workload.spec.js` in the browser soak.

GitHub Pages remains gated behind a successful **Calc Release Soak** workflow.

## Deliberate boundaries

Even after U8, Calc does **not** claim universal support for:

- arbitrary theorem proving;
- unrestricted symbolic integration or equation solving;
- PDEs, DAEs, general BVP solvers, finite-element or finite-volume systems;
- industrial-scale sparse/Krylov/preconditioned numerical linear algebra;
- mixed-integer/nonlinear global optimization;
- unrestricted SAT/SMT solving;
- unrestricted graph isomorphism, planarity, matching, flow, or huge exact coloring;
- arbitrary-precision floating-point or interval arithmetic;
- formal proof certificates for every numerical conclusion.

Those are separate specialist systems. The final certification instead guarantees a coherent, bounded, explicit undergraduate computational mathematics workstation with well-defined failure boundaries.
