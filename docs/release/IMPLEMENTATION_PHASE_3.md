# Implementation Phase 3 — Calculus & Numerical Methods

Status: **implemented**

## Delivered

### Symbolic differentiation

Added derivative rules for arithmetic compositions, powers, exponentials, logarithms, trigonometric/inverse-trigonometric/hyperbolic functions, square roots and absolute value.

Implemented:

- first derivatives;
- higher derivatives;
- partial derivatives;
- gradients;
- Jacobians;
- Hessians;
- derivative-domain restrictions.

### Controlled symbolic integration

Implemented certified antiderivative rules for:

- exact Rational polynomials;
- linearity;
- constant multiples;
- reciprocal variable / reciprocal linear forms;
- powers of linear forms;
- sin/cos/exp of linear forms;
- ln(x).

Every returned antiderivative is differentiated back and verified.

Unsupported symbolic integrals raise `UNSUPPORTED_INTEGRAL`.

### Definite integration

Implemented:

- exact FTC evaluation when a certified antiderivative exists;
- adaptive Simpson fallback for finite bounds;
- reversed-bound semantics;
- singularity detection;
- convergence/error metadata.

Improper integrals remain explicitly unsupported rather than silently approximated.

### Limits

Implemented:

- direct substitution;
- exact RationalFunction limits;
- polynomial repeated-derivative resolution of 0/0 rational forms;
- rational-function limits at infinity;
- pole multiplicity / one-sided classification;
- selected standard limits;
- stabilized numerical fallback;
- DNE vs unsupported distinction.

### Taylor

Implemented derivative-based Taylor polynomials through configured bounded order, retaining coefficient metadata and avoiding fabricated remainder guarantees.

### Numerical analysis

Added:

- compiled AST numeric function;
- Richardson-improved central numerical differentiation;
- adaptive Simpson integration;
- bisection;
- Newton;
- secant;
- safeguarded hybrid Newton/bisection;
- residual checks;
- central tolerances;
- evaluation limits;
- convergence failures;
- cooperative cancellation.

### Worker architecture

Added:

- `calculus-worker.js`;
- `NumericalWorkerClient`;
- worker task protocol for expensive numerical methods.

The worker reuses the canonical engines through `importScripts`; it does not duplicate algorithms.

### Application integration

Calculate and Worksheet math blocks now recognize:

- diff(...)
- partial(...)
- gradient(...)
- jacobian(...)
- hessian(...)
- integrate(...)
- integral(...)
- nintegral(...)
- limit(...)
- taylor(...)
- nderivative(...)
- root(...)

Added command-palette entries for the primary calculus workflows.

Numerical calculus results can become `ans`; symbolic calculus objects do not overwrite numeric `ans`.

Graph result routing is disabled for command results that are numeric summaries rather than graphable source functions.

### Offline/PWA integration

Added `calculus.js` and `calculus-worker.js` to the application shell and offline cache.

The service-worker cache generation for Phase 3 is `calc-shell-v4`.

## Certification

CI runs the complete cumulative suite:

1. syntax checks;
2. original application/core smoke tests;
3. Phase 1 core-kernel certification;
4. deterministic expression fuzzing;
5. Phase 2 symbolic-algebra certification;
6. Phase 3 calculus/numerical certification.

Phase 3 tests cover:

- power/product/quotient/chain derivatives;
- higher/partial derivatives;
- gradient/Jacobian/Hessian;
- differentiability restrictions;
- antiderivative verification;
- exact and numerical definite integrals;
- singular ordinary integrals;
- integration convergence exhaustion;
- compiled evaluator parity;
- numerical derivatives;
- removable limits;
- standard limits;
- infinity limits;
- one-/two-sided rational poles;
- unstable limit sampling;
- Taylor coefficients;
- all four root solvers;
- invalid brackets;
- residuals;
- cancellation;
- public command routing.

## Phase boundary

Phase 4 should now build typed Quantity/Dimension/Unit/Constant/Engineering systems on the shared numeric and symbolic foundations.

Do not place unit-conversion factors or engineering formulas inside calculus or UI components.
