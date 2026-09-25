# Calc v2.5.0

Calc v2.5.0 adds **Phase U6 — Numerical Mathematics** to the University Mathematics Workstation.

## Floating-point & error analysis

- Added IEEE-754 neighbor/ULP diagnostics.
- Added absolute/relative/percentage error metrics and cancellation diagnostics.
- Added scalar absolute/relative conditioning estimates.
- Added Richardson extrapolation and observed convergence-order estimation.

## Root finding & interpolation

- Added fixed-point iteration with local contraction diagnostics.
- Added four-way root-method comparison across bisection, Newton, secant, and hybrid Newton/bisection.
- Added barycentric Lagrange interpolation.
- Added Newton divided differences.
- Added first-derivative Hermite interpolation.
- Added natural cubic splines.

## Differentiation & quadrature

- Added forward/backward/central/five-point finite differences with Richardson error estimates.
- Added first- and second-derivative numerical diagnostics.
- Added composite midpoint, trapezoid, and Simpson quadrature.
- Added composite 2–5 point Gauss–Legendre quadrature.
- Added adaptive-Simpson bridge and panel-refinement error diagnostics.

## Numerical linear algebra

- Added Jacobi and Gauss–Seidel iterative linear solves.
- Added conjugate gradient with symmetric-positive-definite certification.
- Added residual, relative-residual, normwise backward-error, conditioning, and forward-error-bound diagnostics.
- Added power iteration, shifted inverse iteration, and Rayleigh quotient iteration.

## Optimization & ODE analysis

- Added U4 optimizer comparison across BFGS, Newton, and gradient descent.
- Added fixed-step Euler, Heun, explicit midpoint, and RK4 scalar IVPs.
- Added observed ODE convergence-order diagnostics using N/2N/4N grids.
- Added absolute-stability functions and negative-real stability intervals for explicit and implicit one-step methods.

## Compatibility & semantics

- U3 retains ownership of `stability(...)` for dynamical systems.
- U6 uses the collision-free command `absstability(...)` for numerical ODE stability.
- Unsupported or non-convergent numerical methods fail explicitly rather than returning a guessed result.

## Certification

v2.5.0 adds a dedicated U6 deterministic suite, Worksheet coverage, browser-level Calculate coverage, primary-CI enforcement, static release-gate assertions, and the Chromium / Firefox / WebKit / mobile Chromium production soak.

U6 intentionally does not implement arbitrary-precision floating point, interval arithmetic, sparse Krylov methods, preconditioners, stiff BDF/Radau solvers, PDE discretization, or universal convergence proofs.
