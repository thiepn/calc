# Calc v2.6.0

Calc v2.6.0 adds **Phase U7 — Discrete Mathematics & Combinatorics** to the University Mathematics Workstation.

## Exact combinatorics

- Added exact binomial, permutation, and multinomial counts.
- Added Catalan, Stirling first/second kind, Bell, derangement, integer-partition, and Fibonacci sequences.
- Added stars-and-bars, pigeonhole lower bounds, and Cayley labeled-tree counts.

## Modular arithmetic & recurrences

- Added extended Euclid with Bézout certificates.
- Added exact modular inverses, modular exponentiation, generalized CRT, and linear congruence solving.
- Added constant-coefficient linear recurrence terms, bounded sequences, and ordinary generating functions.

## Finite sets, logic & relations

- Added deterministic finite-set union/intersection/difference/symmetric difference, Cartesian products, and powersets.
- Added propositional parsing, truth tables, tautology/contradiction/contingency classification, equivalence witnesses, and canonical CNF/DNF.
- Added finite relation property analysis, closures, equivalence classes, partial-order checks, and Hasse covers.

## Finite graph algorithms

- Added connectedness/component, cycle, degree, bipartite, tree/forest, SCC, and DAG diagnostics.
- Added Dijkstra shortest paths for nonnegative exact integer weights.
- Added Kruskal minimum spanning trees.
- Added topological sorting, Euler trail/circuit construction, exact bounded chromatic number, and Prüfer decoding.

## Safety & semantics

- U7 uses exact integer arithmetic wherever the mathematical result is integral.
- Truth tables are capped at 8 variables, powersets at 12 elements, and exact chromatic number at 12 vertices.
- Large/materializing requests fail with explicit complexity errors instead of freezing the local-first PWA.
- U7 does not consume ordinary arithmetic expressions, preserving the existing U1–U6 routing surface.

## Certification

v2.6.0 adds a dedicated deterministic U7 suite, Worksheet routing coverage, browser-level Calculate coverage, command-palette integration, offline asset caching, primary-CI enforcement, and release-soak enforcement.

Full semantics and deliberate boundaries are documented in `docs/math/DISCRETE_MATHEMATICS_SEMANTICS.md`.
