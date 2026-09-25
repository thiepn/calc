# Calc

A local-first universal calculator PWA and mathematical workstation.

**Current stable release: v2.5.0** · IndexedDB schema v5 · production channel.

v2.5.0 adds Phase U6: numerical mathematics on top of the U1–U5 university-mathematics foundation.

## Current implementation

Calc currently includes:

- exact arbitrary-size Integer/Rational arithmetic;
- finite Real and exact-capable Complex scalars;
- symbolic algebra, advanced CAS/parameter solving, single- and multivariable calculus, vector analysis, differential equations, dynamical systems, optimization, mathematical programming, and a dedicated numerical-analysis layer;
- first-class physical quantities, units, constants and engineering relations;
- canonical Matrix/Vector/subspace objects, certified numerical decompositions, advanced canonical forms, spectral calculus, inner-product workflows, and conditioning diagnostics;
- typed Dataset/probability/inference/regression systems;
- Graph V2 with explicit, piecewise, parametric, polar, implicit and inequality plots;
- a registry-driven specialized calculator system with finance, geometry, date, programmer and number-theory tools;\n- a safe declarative Custom Formula Builder with Draft/Active/Archived lifecycle, tests, quantities, relations, revision history, and strict `.calctool.json` import/export;\n- typed Worksheets & Notebooks V2 with Math/Text/Tool/Matrix/Data/Graph blocks, dependencies, stale tracking, version restore, import/export, and recovery mode;\n- a versioned persistence/backup layer with chunked large-notebook storage, streamed plaintext backups, encrypted backups, selective atomic restore, recoverable Trash, optimistic multi-tab writes, storage diagnostics, controlled PWA updates, and provider-neutral sync architecture;
- a Phase 13 release-candidate gate with large-fixture soak, v4→v5 migration certification, corruption/interruption tests, offline PWA checks, and Chromium/Firefox/WebKit/mobile browser coverage;
- persistent history/worksheets;
- offline/installable PWA support.

Calc deliberately distinguishes exact from approximate, unsupported from impossible, physical dimension from semantic quantity kind, statistical missingness from zero, and rendering from mathematical conclusions.

## Advanced CAS — v2.0 / U1

The Calculate input and Worksheet Math blocks share the same U1 CAS router.

Examples:

```text
assume(x>0; simplify(sqrt(x^2)))
solve(a*x+b=0, x)
solve(sin(2*x)=0, x)
system(x+y=3; x*y=2)
psystem(x,y; a*x+y=1; x+a*y=2)
inequality((x+1)/(x-2)>=0, x)
integrate(x*exp(x), x)
integrate(1/(x^2+1), x)
cashelp()
```

U1 is intentionally certified rather than universal: unsupported symbolic forms return explicit errors instead of guessed algebra. Exact assumptions, solver families, integration rules, and limitations are documented in `docs/math/ADVANCED_CAS_SEMANTICS.md`.

## Multivariable Calculus & Vector Analysis — v2.1 / U2

U2 adds a separate certified multivariable/vector engine shared by Calculate and Worksheet Math blocks.

Examples:

```text
gradat(x^2+y^2; x,y; 1,2)
directional(x^2+y^2; x,y; 1,2; 3,4)
implicitdiff(x^2+y^2-1; y; x)
tangentplane(x^2+y^2; x,y; 1,2)
mlimit(x*y/(x^2+y^2); x,y; 0,0)
critical(x^2+2*y^2-4*x+8*y; x,y)
lagrange(x^2+y^2; x+y; 1; x,y)
curl(-y,x,0; x,y,z)
lineint(-y,x; x,y; cos(t),sin(t); t; 0,2*pi)
surfacearea(u,v,0; u,v; 0,1; 0,1)
green(-y,x; x,y; 0,1; 0,1)
stokes(-y,x,0; x,y,z; 0,1; 0,1; 0)
gauss(x,y,z; x,y,z; 0,1; 0,1; 0,1)
mvhelp()
```

The theorem tools intentionally certify rectangular/planar/box domains rather than pretending to solve arbitrary geometry. Full syntax, numerical semantics, supported domains, and explicit boundaries are documented in `docs/math/MULTIVARIABLE_VECTOR_SEMANTICS.md`.

## Differential Equations & Dynamical Systems — v2.2 / U3

U3 adds a separate certified ODE/dynamics engine shared by Calculate and Worksheet Math blocks.

Examples:

```text
separable(x; y; x; y)
exactode(2*x*y; x^2+2*y; x; y)
linearode(1; 1; x; y)
bernoulli(1; 1; 2; x; y)
ode2hom(1; 0; 4; x; y)
seriesivp(x+y; x; y; 0,1; 5)

ivp(y; x; y; 0,1; 1)
ivp2(sin(x)-y; x; y; v; 0,0,0; pi)
ivpsystem(y,-x; t; x,y; 0; 1,0; pi/2)
rk4(y; x; y; 0; 1; 1; 100)

equilibria(x-y,x+y; x,y)
linearize(y,-x; x,y; 0,0)
stability(-x-y,x-y; x,y; 0,0)
directionfield(y-x; x,y; -2,2; -2,2; 9,9)
phase2(y,-x; x,y; -2,2; -2,2; 9,9; 1,0; 0,2*pi; 41)

matrixexp2(0,-1,1,0; t)
linearflow2(0,-1,1,0; 1,0; t)

laplace(t^2+3*sin(2*t); t; s)
invlaplace(s/(s^2+4); s; t)
convolution(1; t; t; 2)
odehelp()
```

Adaptive IVPs use Dormand–Prince RK45 with explicit convergence and singularity semantics. Hyperbolic planar equilibria receive local stability classifications, while non-hyperbolic cases remain explicitly inconclusive. Full syntax and certification boundaries are documented in `docs/math/ODE_DYNAMICAL_SYSTEMS_SEMANTICS.md`.

## Optimization & Mathematical Programming — v2.3 / U4

U4 adds a certified optimization layer shared by Calculate and Worksheet Math blocks.

Examples:

```text
convexity(x^2+2*y^2; x,y)
convexity(x^4+y^2; x,y; 0,0)

goldenmin((x-2)^2+1; x; -5,5)
optmin((1-x)^2+100*(y-x^2)^2; x,y; -1.2,1; bfgs)
optmax(-(x-1)^2-(y-2)^2+5; x,y; 0,0; bfgs)
boxmin((x-3)^2+(y+1)^2; x,y; 0,-2; 2,2; 1,0)

kktcheck(x^2+y^2; x,y; x+y-1; -x,-y; 0.5,0.5; -1; 0,0)

lpmax(3,2; 1,1|1,0|0,1; 4,2,3)
lpmin(-1,-2; 1,0|0,1; 3,4)

quadprog(x^2+y^2; x,y; x+y-1; -x,-y)
opthelp()
```

Numerical stationary points are checked against second-order curvature before Calc labels them as extrema. Standard-form LPs use exact Rational simplex arithmetic plus primal–dual certificate verification. Convex QPs use exact active-set KKT systems and re-check every candidate.

Full syntax, guarantees, and explicit unsupported boundaries are documented in `docs/math/OPTIMIZATION_SEMANTICS.md`.

## Advanced Linear Algebra — v2.4 / U5

U5 adds a separate advanced linear-algebra layer on top of the existing Matrix/Vector kernel.

Examples:

```text
jordanv2(2,1,0|0,2,1|0,0,2)
jordanchains(2,1,0|0,2,1|0,0,2)

schur(1,4,2|3,2,5|0,1,3)
spectral(2,1|1,2)

matrixfunc(4,0|0,9; sqrt)
matrixfunc(2,1|1,2; exp)

gram(1,i|i,1)
orthonormalize(1,i|i,1)
projector(1,0|1,0|0,1)

bilinear(2,1|1,3; 1,2; 3,4)
sesquilinear(1,i|-i,2; 1,i; 2,-i)
quadratic(2,1|1,3; 1,2)

inertia(2,0|0,-3)
congruence(2,0|0,-3)

lowrank(3,0|0,2|0,0; 1)
pinvdiag(1,0|0,0)
lstsqv2(1,0|0,1|1,1; 1,2,3)
condreport(1,0|0,0.001)

similarity(2,1|0,3; 1,1|0,1)
basischange(1,0|0,1; 1,1|0,1)
u5help()
```

Jordan V2 is exact and chain-based when the exact eigenvalue solver certifies the complete spectrum. Schur, spectral functions, SVD applications, and conditioning workflows are numerical but expose reconstruction and orthogonality diagnostics before results are accepted.

The Matrix workspace also gains first-class **Jordan V2, Schur, Spectral, Inertia, Projector, and Condition** operations. Full syntax and certification boundaries are documented in `docs/math/ADVANCED_LINEAR_ALGEBRA_SEMANTICS.md`.

## Numerical Mathematics — v2.5 / U6

U6 adds a dedicated numerical-analysis layer shared by Calculate and Worksheet Math blocks.

Examples:

```text
floatinfo(1)
numerror(1; 0.999)
cancellation(1.000000000001; 1)
scalarcond(exp(x); x; 1)

richardson(1.04; 1.01; 2)
convorder(1.1; 1.025; 1.00625)

fixedpoint(cos(x); x; 0.5)
rootcompare(cos(x)-x; x; 0,1; 0.5,1)

interp(0,1,2; 0,1,4; 1.5)
newtoninterp(0,1,2; 0,1,4; 1.5)
hermite(0,1; 0,1; 0,2; 0.5)
spline(0,1,2; 0,1,0; 0.5)

fdiff(sin(x); x; 0; 0.1; fivepoint; 1)
quad(exp(x); x; 0; 1; 4; gauss5)

jacobi(4,1|2,3; 1,2; 0,0; 200)
gaussseidel(4,1|2,3; 1,2; 0,0; 200)
cg(4,1|1,3; 1,2; 0,0; 20)
linsysdiag(4,1|1,3; 1,2; 0.0909090909,0.6363636364)

poweriter(2,1|1,2; 1,0; 100)
inverseiter(2,0|0,5; 1,1; 2.1; 100)
rayleighiter(2,1|1,2; 1,0.2; 50)

optcompare((x-1)^2+(y+2)^2; x,y; 3,3)

odefixed(y; x; y; 0; 1; 1; 100; rk4)
odeorder(y; x; y; 0; 1; 1; 10; rk4)
absstability(rk4; -2; 0)
stabinterval(rk4)

numhelp()
```

U6 emphasizes numerical evidence: residuals, error estimates, observed convergence order, backward error, condition numbers, and absolute-stability diagnostics are carried with the result whenever applicable.

The existing U3 `stability(...)` command remains unchanged; U6 uses `absstability(...)` to avoid command ambiguity. Full numerical semantics, assumptions, and unsupported boundaries are documented in `docs/math/NUMERICAL_MATHEMATICS_SEMANTICS.md`.

## Tools V2

The Tools workspace is generated from a canonical Tool Registry rather than a UI switch statement.

It currently registers **37 enabled tools** across:

```text
Everyday
Finance
Geometry
Dates & Time
Programmer
Number Theory
Units & Measurement
Engineering
```

The registry provides:

- stable tool IDs/versions;
- typed input schemas;
- search;
- command-palette discovery;
- deep links such as `#tools/loan`;
- normalized result envelopes;
- structured tool-history payloads.

### Everyday

```text
Percentage of value
Percentage change
Reverse percentage
Ratio & proportion
Fraction / decimal / percent
Split bill & tip
```

### Finance

```text
Compound interest
Present value
Annuity payment
Loan & amortization
NPV
IRR
CAGR
ROI
Margin & markup
Break-even
```

Money uses currency minor units and blocks implicit cross-currency arithmetic.

### Geometry

```text
Triangle solver — SSS / SAS / ASA / AAS / SSA
Circle solver
Rectangle
Regular polygon
Distance & midpoint
Line intersection
```

The triangle solver retains both valid SSA branches when the ambiguous case has two solutions.

### Dates & Time

```text
Date difference
Add calendar period
Age
Weekday & ISO week
Business days
```

Calendar arithmetic distinguishes elapsed duration from years/months/days and clamps invalid month-end targets explicitly.

### Programmer

```text
Bit integer inspector
Bit operations
```

Features include 8/16/32/64-bit values, two's complement, explicit signedness, strict/wrap input handling, shifts and rotations.

### Number theory

```text
GCD / LCM / Bézout
Modular inverse
Chinese remainder theorem
Primality
Prime factorization
Divisors
```

## Custom Formula Builder

Custom Builder lives inside the Tools workspace.

It supports three safe modes:

```text
Formula
Relation
Built-in proxy
```

Formula example:

```text
variables:
  distance · quantity · km
  time     · quantity · hr

expression:
  distance / time

output:
  km/hr
```

Activation requires:

```text
schema validation
→ AST / identifier validation
→ semantic / dimensional validation
→ deterministic tests
→ Active
```

Custom tools cannot execute JavaScript, `eval`, network requests, DOM code, or browser APIs.

Lifecycle:

```text
Draft
Active
Archived
```

Active custom tools compile into ordinary `ToolDefinition` objects under stable IDs such as:

```text
custom.<id>
```

and then participate in the normal Tools list, search, command palette, and history.

Other builder features include:

- exact Rational scalar inputs where possible;
- quantity variables and dimensional output validation;
- scalar relation solving through the certified algebra engine;
- structured min/max/positive/nonzero constraints;
- required passing tests before activation;
- revision history and restore-as-new-Draft;
- safe duplication of compatible built-in tools;
- IndexedDB persistence;
- strict `.calctool.json` import/export;
- forced-Draft imports with new local IDs;
- startup isolation for invalid old/corrupt Active manifests.

## Worksheets & Notebooks V2

The former Math/Text worksheet prototype has been replaced by a typed notebook engine.

Block types:

```text
Math
Text
Tool
Matrix
Data
Graph
```

Top-down symbols remain supported:

```text
Block A
a = 5

Block B
a * 2
→ 10
```

Stable typed block references use:

```text
{{block:<block-id>}}
```

A referenced Rational, real scalar, or Quantity is passed as a typed value rather than reconstructed from display text.

Notebook execution tracks:

```text
dirty
stale
clean
error
blocked
```

If an upstream block fails, dependent blocks become blocked while independent later branches continue to run.

Other notebook capabilities include:

- automatic migration of older worksheets;
- Active custom-tool blocks through stable Tool Registry IDs;
- Matrix operations through Phase 5;
- Data summaries/correlation/regression through Phase 6;
- Graph V2 source blocks;
- exact typed result serialization;
- clean-block result reuse;
- stale propagation across old and new dependency edges;
- manual or debounced Auto run;
- block duplicate/reorder/delete;
- up to 30 local revision snapshots;
- restore-as-new-revision;
- `.calcnb.json` import/export;
- Markdown export;
- recovery mode for malformed legacy records;
- 500-block notebook complexity budget.

## Persistence, Backup & PWA

Calc now uses a dedicated versioned persistence layer instead of owning IndexedDB schema logic inside the UI.

Current database schema:

```text
calc-db · version 5

history
worksheets
settings
customTools
meta
journal
tombstones
chunks
```

Data & Backup supports:

- full `.calcbackup.json` backups;
- optional password-encrypted `.calcbackup.enc.json` backups;
- PBKDF2-SHA-256 + AES-GCM encryption through Web Crypto;
- Web Share file transfer where supported;
- merge or replace restore;
- selective History / Notebooks / Settings / Custom Tools / deletion-metadata restore;
- newer / incoming / conflict-copy merge policies;
- hash/integrity verification before restore;
- stale-plan protection if another tab changes selected data after preview;
- atomic restore with recovery journal;
- database integrity reports;
- storage/quota reporting;
- persistent-storage requests.

Notebook and custom-tool writes use optimistic revisions. A stale tab cannot silently overwrite a newer saved revision; local edits are preserved as conflict copies.

DB v4 introduced tombstones for explicit deletion history. DB v5 adds the internal `chunks` store used to externalize large notebook sources, serialized results, and revision snapshots. Unchanged chunks are reused rather than rewritten, and recoverable Trash can retain chunk-backed notebook payloads without copying them into one large record.

### PWA updates

New service workers now install and wait instead of replacing an active editing session.

```text
update downloaded
→ Update ready
→ Restart & update
→ flush pending data
→ persistence integrity/update preflight
→ SKIP_WAITING
→ activate
→ reload
```

`persistence.js` is part of the offline application shell.

### Cross-device architecture

Calc remains local-first. Remote sync is disabled by default.

Phase 11 provides:

```text
calc.sync/v1
SyncAdapter
DisabledSyncAdapter
SyncManager
stable device ID
tombstones
backup-compatible transfer boundary
```

Today, the supported cross-device workflow is encrypted/plain backup transfer and restore; no Calc account or Calc cloud server is required.

## Release-candidate certification

Phase 13 adds a separate `Calc Release Soak` workflow. It reruns the cumulative deterministic suites, enforces static release budgets, then runs production-like browser tests on Chromium, Firefox, WebKit, and a Pixel 7 Chromium profile.

The browser soak covers:

- realistic IndexedDB v4 → v5 migration;
- multi-megabyte notebook chunk persistence and unchanged-chunk reuse;
- streamed backup verification and selective restore;
- Trash isolation during notebook-only restore;
- explicitly aborted writes and deliberately corrupted chunk recovery;
- offline service-worker reload on install-oriented Chromium targets;
- broad persistence performance and heap-growth ceilings.

GitHub Pages is triggered only after that workflow succeeds and checks out the exact certified commit SHA. A normal push can no longer deploy directly around the RC gate.

## Production release

Calc v1.0.0 remains the original production baseline; v1.0.1 is the current bug-fix release. Release metadata is centralized in `VERSION` and `release.json`, and runtime/backup/PWA version sources are certification-locked to the current release version.

After the release soak passes, GitHub Pages deploys the exact certified SHA. A separate production-release workflow then verifies the live Pages metadata, generates SHA-256 checksums for the shipped runtime files, and creates or verifies the release tag declared in `release.json` against that exact deployed SHA.

The final release gate also certifies:

- clean-device startup and schema initialization;
- healthy persistence/update preflight;
- restoration of a valid pre-upgrade DB-v4 backup into DB v5;
- valid current-version backup generation after upgrade/restore;
- production service-worker version handshake and offline reload.

## Graph V2

Graph supports:

```text
sin(x)
f(x)=x^2/5

slider(a;1;-3;3;0.1)
a*x^2

piecewise(-x;-inf;0;() | x;0;inf;[))
parametric(cos(t);sin(t);t;0;2*pi)
polar(1+cos(theta);theta;0;2*pi)
implicit(x^2+y^2-1)
ineq(y<=x^2)
```

Certified graph analysis routes through the algebra/calculus engines for roots, intersections, extrema, tangents and definite integrals.

## Data workspace

Provides typed dataset import, descriptive statistics, Pearson/Spearman, SVD regression, histogram/box plots, confidence intervals, t-tests and probability distributions.

## Matrix workspace

Provides exact structural linear algebra plus LU, Householder QR, Cholesky, SVD, pseudoinverse, eigenanalysis, diagonalization, characteristic/minimal polynomials and the restricted exact Jordan subset.

## Quantity examples

```text
5 km + 300 m
80 km / 1.25 hr to km/hr
5 kg * 9.81 m/s^2
20 degC to degF
sin(90 deg)
constant(g0)
eng(ohm, V=12 V, R=6 ohm)
```

## Architecture

- `math.js` — Phase 1 deterministic scalar/parser kernel.
- `algebra.js` — Phase 2 symbolic algebra.
- `calculus.js` / `calculus-worker.js` — Phase 3 calculus/numerical methods.
- `units.js` — Phase 4 quantities/constants/engineering.
- `linear-algebra.js` — Phase 5 linear algebra.
- `statistics.js` / `statistics-worker.js` — Phase 6 probability/statistics/data.
- `graph.js` / `graph-worker.js` — Phase 7 graph models, geometry and analysis.
- `tools.js` — Phase 8 Tool Registry, finance, dates, geometry, programmer and number theory.\n- `custom-tools.js` — Phase 9 safe custom formulas, relations, validation, lifecycle and import/export.\n- `notebook.js` — Phase 10 typed notebook blocks, dependencies, versioning, execution, import/export and recovery.\n- `persistence.js` — Phase 11–14 DB migrations, chunked notebook persistence, backup/restore, encryption, Trash/tombstones, multi-tab coordination, resilience diagnostics and stable production metadata.
- `app.js` — application state, persistence, workspaces and UI routing.
- `styles.css` — responsive design system.
- `sw.js` + `manifest.webmanifest` — offline/installable PWA runtime.
- `tests/` — cumulative deterministic certification suites.
- `docs/math/` — normative mathematical/product semantics.

No external runtime libraries are required.

## Verification

GitHub Actions runs cumulative certification for:

- core numeric/parser behavior;
- deterministic expression fuzzing;
- symbolic algebra;
- calculus/numerical methods;
- quantities/constants/engineering;
- Linear Algebra V2;
- Probability/Statistics/Data V2;
- Graphing V2;
- Specialized Calculators V2;\n- Custom Formula Builder;\n- Worksheets & Notebooks V2;\n- Persistence / Backup / PWA architecture;
- Phase 13 static RC certification;
- Phase 14 production version/release gate;
- clean-device and pre-upgrade backup compatibility certification;
- cross-browser production soak before Pages deployment;
- live deployment verification before the GitHub release is created.

The Phase 8 registry-wide test executes every enabled generic tool with its declared defaults in addition to deterministic boundary/reference cases.

See the files under `docs/math/` and `docs/release/` for the exact supported semantics, verification scope and deliberate limitations. Custom Tools are specified in `docs/math/CUSTOM_TOOLS_SEMANTICS.md`; notebook semantics are specified in `docs/math/NOTEBOOK_SEMANTICS.md`; persistence/PWA semantics are specified in `docs/math/PERSISTENCE_PWA_SEMANTICS.md`.
