# Implementation Phase 1 — Core Math Kernel Hardening

Status: **implemented**

## Completed

- Replaced loose generic errors in the evaluator with typed core error classes and stable error codes.
- Hardened decimal/scientific literal parsing so finite decimal input stays exact Rational.
- Preserved arbitrary-size integer and Rational arithmetic.
- Upgraded Complex values so rational real/imaginary components can remain exact.
- Added explicit scalar kind/exactness metadata to evaluation results.
- Added exact common-degree trigonometric cases where the current non-symbolic numeric tower can represent the result exactly.
- Added multi-argument user-defined functions and nested user-function calls.
- Fixed environment inheritance so preview evaluation and nested functions can see prior definitions without mutating them.
- Reserved constants, built-ins, `ans`, and prototype-pollution-sensitive identifiers.
- Added source spans to parser AST nodes and parse errors.
- Rejected malformed adjacent numeric literals instead of interpreting them as implicit multiplication.
- Added bounded expression/token/AST/evaluation/factorial/exponent limits.
- Added explicit policies for `0^0`, division by zero, real-only negative roots/powers, and non-finite outputs.
- Added tagged lossless serialization/deserialization for scalar values, functions and ASTs.
- Kept the existing Matrix/Data/Graph/UI-facing kernel API backward-compatible.
- Added deterministic randomized Rational property tests and Matrix exactness integration checks.

## Automated verification

CI runs:

- JavaScript syntax checks
- existing application smoke tests
- `tests/core-kernel.js` certification suite

## Phase boundary

This phase hardens evaluation infrastructure only. Algebraic expression objects, simplification, factoring, equations, inequalities and symbolic solving remain deliberately scoped to Implementation Phase 2.
