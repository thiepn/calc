# Calc v2.7.0

Calc v2.7.0 completes **Phase U8 — Final University-Workload Audit & Certification**.

## What U8 changes

U8 is a consolidation release. It does not add another mathematics engine or alter the established U1–U7 command contracts.

It adds:

- a deterministic cross-module university certification suite;
- a browser-level U1–U7 workload suite;
- exact/symbolic/approximate semantics checks;
- router-collision and command-ownership checks;
- independent-engine agreement checks;
- mixed Worksheet serialization/reference/cache certification;
- preservation of numerical provenance across Worksheet references, preventing approximate results from being mislabeled as exact Rationals;
- unsupported-case and complexity-bound checks;
- final compatibility checks for statistics, units, graphing, linear algebra and specialized tools;
- accessibility/mobile/PWA presentation-contract checks;
- explicit final university-workload documentation;
- CI, release-soak and release-gate enforcement.

## Certified university stack

- U1 — Advanced CAS & Symbolic Mathematics
- U2 — Multivariable Calculus & Vector Analysis
- U3 — Differential Equations & Dynamical Systems
- U4 — Optimization & Mathematical Programming
- U5 — Advanced Linear Algebra
- U6 — Numerical Mathematics
- U7 — Discrete Mathematics & Combinatorics

These are certified together with Calc's foundational exact arithmetic, Linear Algebra V2, probability/statistics, units, graphing, tools, Worksheets, persistence and PWA shell.

## Release boundary

The target is a coherent, bounded computational workstation for undergraduate Wirtschaftsmathematik / applied-mathematics workloads. Calc still does not claim universal theorem proving, unrestricted symbolic integration, PDE/DAE platforms, industrial sparse solvers, mixed-integer global optimization, unrestricted SAT/SMT, or unbounded exponential graph/combinatorial algorithms.

The full certification contract is documented in `docs/release/UNIVERSITY_WORKLOAD_CERTIFICATION.md`.

## Data compatibility

- IndexedDB remains schema v5.
- Existing notebooks, history, custom tools, backups and sync metadata require no migration.
- The service-worker cache advances to `calc-shell-v2.7.0`.
