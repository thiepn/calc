# Changelog

All notable production changes to Calc are recorded here.

## [2.7.0] — 2026-09-25

### University Mathematics Workstation — Phase U8

- Added final cross-module university-workload certification across U1–U7.
- Added deterministic checks for router ownership, exact/symbolic/approximate semantics, overlapping-engine agreement, malformed/unsupported-case honesty, and university command boundaries.
- Added mixed Worksheet certification covering U1/U2/U4/U6/U7 execution, exact and numerical block references, JSON persistence safety, normalization, and cached re-evaluation.
- Added final compatibility checks for probability/statistics, units, graph parsing, the specialized Tool Registry, and the foundational exact Linear Algebra kernel.
- Added `tests/university-workload.spec.js` to execute U1–U7 sequentially in each release-soak browser and verify command discovery, Worksheet composition, mobile containment, accessibility contracts, and PWA/version integrity.
- Added `docs/release/UNIVERSITY_WORKLOAD_CERTIFICATION.md` with the certified undergraduate workload, exactness contract, safety limits, browser matrix, and deliberate unsupported boundaries.
- Added U8 to primary CI, deterministic release-soak gates, static release certification, and the Playwright browser matrix.
- Bumped the production release/cache version to v2.7.0 without changing IndexedDB schema v5.

### Compatibility

- U1–U7 mathematics engines retain their existing public command contracts and version identifiers.
- No new mathematical router is inserted in U8; the phase is certification and consolidation only.
- Existing local data, backup, sync, PWA, graph, statistics, tools, and notebook schemas remain unchanged.

## [2.6.0] — 2026-09-25

### University Mathematics Workstation — Phase U7

- Added the standalone `discrete-mathematics.js` runtime and routed it through Calculate and Worksheet Math evaluation.
- Added exact binomial/permutation/multinomial counts, Catalan numbers, Stirling numbers, Bell numbers, derangements, integer partitions, stars-and-bars, pigeonhole bounds, Cayley tree counts, and fast-doubling Fibonacci.
- Added extended Euclid, modular inverses/powers, generalized Chinese remainder theorem, and linear congruence solving.
- Added bounded finite-set algebra, Cartesian products, and powersets.
- Added exact constant-coefficient linear recurrence terms/sequences and ordinary generating functions.
- Added propositional parsing, truth-table classification, equivalence counterexamples, and canonical CNF/DNF generation.
- Added finite relation analysis, closures, equivalence classes, partial-order certification, and Hasse cover extraction.
- Added finite graph analysis, Dijkstra shortest paths, Kruskal minimum spanning trees, topological sorting, Euler trails/circuits, exact bounded chromatic number, and Prüfer decoding.
- Added explicit complexity limits for exponential/materializing operations so the local-first PWA remains responsive.
- Added `discretehelp()`, U7 command-palette templates, offline caching, Worksheet integration, deterministic certification, browser regression coverage, and `docs/math/DISCRETE_MATHEMATICS_SEMANTICS.md`.

### Compatibility

- U1–U6 and all existing calculator subsystems remain intact.
- U7 is additive and does not consume ordinary arithmetic expressions.
- Unsupported large/exponential discrete problems fail explicitly rather than returning heuristic results.

## [2.5.0] — 2026-09-25

### University Mathematics Workstation — Phase U6

- Added the standalone `numerical-mathematics.js` runtime and routed it through Calculate and Worksheet Math evaluation.
- Added IEEE-754 ULP/neighbor inspection, numerical error metrics, cancellation diagnostics, and scalar conditioning.
- Added Richardson extrapolation and observed-order estimation.
- Added fixed-point iteration and four-way root-method comparison.
- Added barycentric Lagrange, Newton divided-difference, Hermite, and natural cubic-spline interpolation.
- Added first/second finite differences with Richardson diagnostics.
- Added composite midpoint/trapezoid/Simpson and 2–5 point Gauss–Legendre quadrature.
- Added Jacobi, Gauss–Seidel, and conjugate-gradient linear solves.
- Added residual/backward-error/condition diagnostics with consistent 2-norm semantics.
- Added power, shifted inverse, and Rayleigh quotient eigenvalue iteration.
- Added U4 optimization-method comparison.
- Added Euler/Heun/midpoint/RK4 fixed-step ODEs with observed-order diagnostics.
- Added one-step absolute-stability functions and negative-real stability intervals.
- Preserved the existing U3 `stability(...)` command by naming the U6 command `absstability(...)`.
- Added `numhelp()`, command-palette templates, offline caching, Worksheet/browser coverage, CI/release-soak enforcement, and `docs/math/NUMERICAL_MATHEMATICS_SEMANTICS.md`.

### Compatibility

- U1–U5 and all existing calculator subsystems remain intact.
- U6 is an additive numerical-analysis layer over the existing calculus, ODE, linear-algebra, and optimization kernels.

## [2.4.0] — 2026-09-25

### University Mathematics Workstation — Phase U5

- Added the standalone `advanced-linear-algebra.js` runtime and routed it through Calculate, Worksheet Math, Worksheet Matrix blocks, and the Matrix workspace.
- Added exact generalized-eigenvector Jordan chains and Jordan V2 beyond the previous non-diagonal 2×2 limit.
- Added real Schur decomposition with Hessenberg reduction, shifted QR iteration, and residual/orthogonality certification.
- Added real-symmetric spectral-theorem workflows and spectral projectors.
- Added certified spectral matrix functions including square root, logarithm, inverse square root, exponential, trigonometric functions, sign/absolute value, and real powers.
- Added complex Gram matrices and complex modified Gram–Schmidt.
- Added certified orthogonal/Hermitian projectors.
- Added bilinear, sesquilinear, and quadratic-form evaluation.
- Added inertia, signature, definiteness, and Sylvester congruence canonical form.
- Added truncated-SVD low-rank approximations with Eckart–Young error diagnostics.
- Added all-four-Penrose pseudoinverse diagnostics and minimum-norm least-squares V2.
- Added singular-value conditioning reports.
- Added verified similarity transforms and basis-transition workflows.
- Added `u5help()`, U5 command-palette templates, advanced Matrix buttons, offline caching, Worksheet coverage, browser regression tests, and release-gate enforcement.
- Added `tests/advanced-linear-algebra.js` and `docs/math/ADVANCED_LINEAR_ALGEBRA_SEMANTICS.md`.

### Compatibility

- Existing Linear Algebra V2 remains the underlying stable Matrix/Vector kernel.
- U1–U4 and all prior calculator subsystems remain intact.
- Unsupported complex/general symbolic canonical-form and matrix-function problems fail explicitly rather than being represented as certified solutions.

## [2.3.0] — 2026-09-25

### University Mathematics Workstation — Phase U4

- Added the standalone `optimization.js` runtime and routed it through Calculate and Worksheet Math evaluation.
- Added global constant-Hessian convexity/concavity certification and pointwise Hessian-curvature analysis.
- Added BFGS, Newton, and gradient-descent local optimization with Armijo line search.
- Added second-order verification so gradient convergence at a saddle is rejected instead of labeled a minimum/maximum.
- Added projected-gradient box-constrained minimization/maximization.
- Added KKT verification for equality and `h(x)<=0` inequality constraints.
- Added exact Rational primal simplex for certified standard-form LPs with Bland-style pivoting.
- Added primal–dual LP certificate verification and exact unboundedness detection.
- Added active-set convex quadratic programming with exact KKT systems, multiplier checks, and KKT re-verification.
- Added `goldenmin(...)` / `goldenmax(...)` bounded 1D search.
- Added `opthelp()`, U4 command-palette templates, offline caching, Worksheet coverage, browser regression tests, and release-gate enforcement.
- Added `tests/optimization.js` and `docs/math/OPTIMIZATION_SEMANTICS.md`.

### Compatibility

- U1 CAS, U2 multivariable/vector calculus, U3 differential equations/dynamics, and all earlier calculator subsystems remain intact.
- Unsupported global/nonlinear/mixed-integer/phase-I/interior-point formulations fail explicitly rather than being presented as certified solutions.

## [2.2.0] — 2026-09-25

### University Mathematics Workstation — Phase U3

- Added the standalone `ode.js` differential-equations/dynamical-systems runtime and routed it through Calculate and Worksheet Math evaluation.
- Added separable, exact, first-order linear, Bernoulli, and homogeneous second-order constant-coefficient symbolic ODE families.
- Added local ODE Taylor-series IVP construction through repeated total differentiation.
- Added adaptive Dormand–Prince RK45 scalar/system IVPs plus deterministic fixed-step RK4.
- Added second-order state-reduction IVPs for damped/forced oscillator problems.
- Added sampled trajectories, direction fields, 2D phase-portrait data, equilibrium solving, Jacobian linearization, and planar stability classification.
- Added exact verified 2×2 matrix exponentials and linear flows.
- Added forward Laplace tables, inverse rational transforms, and causal convolution evaluation.
- Added explicit `ODE_CONVERGENCE` and `ODE_SINGULARITY` semantics.
- Normalized evaluator domain failures inside U3 numerical workflows and prevented structured non-scalar U3 results from replacing scalar `ans`.
- Added `odehelp()` and U3 command-palette templates.
- Added `tests/ode.js`, Worksheet/browser regression coverage, primary-CI/release-soak enforcement, and `docs/math/ODE_DYNAMICAL_SYSTEMS_SEMANTICS.md`.

### Compatibility

- U1 CAS, U2 multivariable/vector calculus, ordinary calculus/algebra, units, linear algebra, statistics, graphing, tools, notebooks, persistence, backups, and PWA update semantics are retained.
- U3 remains intentionally bounded: unsupported symbolic ODE families, stiff solvers, BVP/DAE/PDE systems, and non-hyperbolic nonlinear stability proofs fail explicitly instead of being guessed.

## [2.1.0] — 2026-09-24

### University Mathematics Workstation — Phase U2

- Added the standalone `multivariable.js` runtime and routed it through Calculate and Worksheet Math evaluation ahead of U1 CAS.
- Added point-evaluated gradients, Jacobians, and Hessians.
- Added total differentials, normalized directional derivatives, implicit differentiation, and tangent-plane construction.
- Added multivariable Taylor expansion for 1–3 variables through total order 3.
- Added continuity-certified multivariable limits and explicit path-based nonexistence witnesses.
- Added exact critical-point solving for certified two-variable systems, Hessian classification, and linearized Lagrange systems.
- Added 2D/3D divergence, curl, conservative-field checks, and verified polynomial scalar-potential reconstruction.
- Added parameterized curve calculus: vector/scalar line integrals and arc length.
- Added adaptive rectangular double/triple integration with explicit non-convergence errors.
- Added parameterized surface area and oriented flux.
- Added Green, Stokes, and divergence/Gauss theorem verification on certified rectangular/box domains.
- Added `mvhelp()`, U2 command-palette templates, Worksheet coverage, browser-level U2 regression tests, and offline PWA caching.
- Added `tests/multivariable.js` and `docs/math/MULTIVARIABLE_VECTOR_SEMANTICS.md`.
- Extended primary CI and release-soak gating so U2 cannot be dropped silently.

### Compatibility

- U1 CAS, ordinary calculus/algebra, units, linear algebra, statistics, graphing, tools, notebooks, persistence, backups, and PWA update semantics are retained.
- U2 remains intentionally bounded: arbitrary theorem domains, nonlinear constrained systems, general multivariable limit proofs, and general surface integration are reported as unsupported rather than approximated deceptively.

## [2.0.0] — 2026-09-23

### University Mathematics Workstation — Phase U1

- Added the standalone `cas.js` advanced symbolic layer and routed it through both Calculate and Worksheet Math evaluation.
- Added assumption-aware simplification with sign reasoning, proven-domain restriction removal, contradiction detection, and assumption-based finite-root filtering.
- Added conditional parameterized linear/quadratic equation solving.
- Added exact even-polynomial substitution and elementary exponential/logarithmic/trigonometric solution families.
- Added limited nonlinear 2×2 substitution systems and explicit-unknown `psystem(...)` parameterized linear systems with symbolic determinant/Cramer branches.
- Added certified higher-degree polynomial and rational inequality sign charts.
- Added verified integration-by-parts families for polynomial × exp/sin/cos and low-degree rational integration.
- Added `cashelp()` and CAS-focused command-palette templates.
- Fixed symbolic printer precedence for denominator products and grouped subtraction.
- Added `tests/cas.js`, CAS release-gate assertions, and CAS coverage in the deterministic release workflow.
- Added `docs/math/ADVANCED_CAS_SEMANTICS.md` documenting syntax, guarantees, and explicit unsupported boundaries.

### Compatibility

- Existing core arithmetic, symbolic algebra, calculus, units, linear algebra, statistics, graphing, tools, notebooks, persistence, and backup semantics are retained.
- Unsupported symbolic forms still fail explicitly instead of being misreported as impossible problems.

## [1.0.1] — 2026-09-23

### Bug fixes and hardening

- Prevented stored HTML/script injection through custom-tool metadata, tool result titles, and CSV histogram column names.
- Malformed encoded Tool deep links no longer crash Calc during startup or hash navigation.
- Tool search keeps focus while typing and retains the intended grid layout.
- Notebook title edits are recovery-safe before blur; reference copying handles unavailable/denied clipboard APIs without throwing.
- Unsafe imported notebook block IDs are rejected before DOM selector paths, and notebook import size is bounded.
- Rapid notebook edits always advance optimistic persistence revisions.
- Notebook-store read failures no longer create replacement notebooks or consume session recovery as if persisted notebooks had vanished.
- Remote notebook updates preserve local dirty edits as a separately persisted, visible conflict copy without corrupting the in-memory notebook list.
- Backups and controlled PWA updates abort if the active notebook or settings cannot be flushed safely.
- localStorage denial is non-fatal.
- Persisted Settings read failures leave unknown records untouched; device-ID write failure degrades safely and fallback angle/theme changes do not overwrite unknown persisted values.
- Malformed persisted Custom Tools are quarantined instead of aborting startup.
- Dynamic custom-tool aliases no longer hijack or erase existing alias mappings.
- Custom-tool save, archive, restore, and delete operations are persistence-first, so failed writes leave working runtime tools intact.
- Custom-tool revision conflicts install the newer persisted original and preserve local edits as a Draft conflict copy without masking the warning.
- Cross-tab Custom Tool refresh rebuilds runtime state from persisted truth, removes stale Active definitions after archive, defers safely while the builder is open, refreshes the editor after close, and preserves last-known-good state if the read fails.
- History write failures are reported, and failed Clear History operations no longer make persisted entries appear deleted.
- Mobile Worksheet layout no longer hides notebook switching, import/export, delete, and version controls.
- Removed literal escaped-newline corruption from the responsive stylesheet, restoring mobile graph/tools/data/worksheet rules.

### Verification

- Added a browser bug-sweep suite covering workspace navigation, malformed deep links, dynamic-rendering safety, continuous tool search, blocked Web Storage, notebook import/recovery/persistence/conflicts, Custom Tool lifecycle/conflicts/cross-tab refresh, History failure handling, every registered tool UI, and core Data interactions.
- Failed notebook imports roll back their in-memory insertion and never report success for unsaved data.
- Failed notebook version restores roll back the visible document instead of presenting an unsaved restored version.
- Deleting the last notebook reports if its replacement blank notebook cannot be persisted.
- Notebook deletion flushes the current edits before creating the Trash payload and cancels if that safety save fails.
- Notebook and Custom Tool import size limits are enforced before file contents are read into memory.
- Duplicate dataset headers are deterministically disambiguated and ambiguous Dataset objects are rejected.
- Archive and Export in Custom Tools use the current visible editor state instead of silently dropping unsaved fields.
- Notebook autosave timers are isolated per notebook, auto-run is target-aware, and rapid edits across notebook switches no longer cancel or save the wrong document.
- Session recovery now retains multiple unsaved notebooks with backward compatibility for the old single-snapshot format.
- Recovered notebook copies register their persisted revision immediately so later edits remain protected by optimistic concurrency.
- Backup/update flush retries failed non-active notebook recovery entries so unsaved data from another notebook cannot be omitted.
- Per-notebook writes are serialized, so overlapping slow saves cannot manufacture false conflicts or let an older save clear a newer recovery snapshot.

- The bug sweep runs alongside the existing migration, backup/restore, large-persistence, corruption, performance, and offline PWA soak on Chromium, Firefox, WebKit, and mobile Chromium.

## [1.0.0] — 2026-09-23

### Calculator platform

- Exact and approximate scalar mathematics with complex-number support.
- Symbolic algebra, equation solving, calculus, numerical methods, quantities, units, constants, and engineering relations.
- Linear algebra, probability, statistics, datasets, regression, and Graph V2.
- Registry-driven everyday, finance, geometry, date/time, programmer, number-theory, unit, and engineering calculators.
- Safe Custom Formula Builder with validation, tests, lifecycle, import/export, and revision history.
- Typed Worksheets & Notebooks V2 with six block types, dependencies, version history, import/export, and recovery mode.

### Local-first data and resilience

- IndexedDB schema v5 with chunked large-notebook payload storage.
- Incremental notebook persistence that avoids rewriting unchanged chunks.
- Plain and password-encrypted backups with integrity hashes and selective atomic restore.
- Recoverable Trash with 30-day retention.
- Multi-tab optimistic revision handling and conflict copies.
- Storage diagnostics, quota checks, migration soak tests, corruption detection, and read-only recovery for damaged notebook payloads.
- Controlled service-worker updates with persistence preflight.

### Release hardening

- Real v4 → v5 database migration certification.
- Multi-megabyte notebook, backup, restore, corruption, interruption, and performance soak.
- Chromium, Firefox, WebKit, and mobile Chromium release matrix.
- Offline PWA reload certification on install-oriented Chromium targets.
- GitHub Pages deployment gated behind successful release certification of the exact commit SHA.
- Production release creation gated behind successful Pages deployment.

### Release-blocking defects fixed

- Selective notebook restore no longer destroys chunk-backed Trash payloads.
- Multi-element UI selectors consistently use the collection selector, preventing startup crashes.
- Service-worker offline certification uses navigation-safe browser orchestration.
