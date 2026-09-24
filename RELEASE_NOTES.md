# Calc v2.3.0

Calc v2.3.0 adds **Phase U4 — Optimization & Mathematical Programming** to the University Mathematics Workstation.

## Convexity & curvature

- Added constant-Hessian global convexity/concavity certification for quadratic and affine objectives.
- Added pointwise Hessian-curvature analysis without overstating pointwise semidefiniteness as a convexity proof.
- Added explicit affine/zero-Hessian classification.

## Nonlinear optimization

- Added BFGS with Armijo backtracking and inverse-Hessian reset safeguards.
- Added Newton optimization with exact symbolic Hessians and descent fallback.
- Added gradient descent with Armijo backtracking.
- Added minimization and maximization workflows.
- Added second-order verification after first-order convergence so saddles are not mislabeled as extrema.
- Added global quadratic optimum labeling when a constant positive-definite/semidefinite Hessian provides the certificate.

## Bound constraints & KKT

- Added projected-gradient box minimization/maximization.
- Added projected-gradient first-order convergence checks.
- Added a general KKT checker for equality and `h(x)<=0` inequality constraints:
  stationarity, primal feasibility, dual feasibility, and complementary slackness.

## Linear programming

- Added exact Rational primal simplex for `Ax<=b, x>=0` with nonnegative RHS.
- Added Bland-style pivot selection/tie breaking.
- Added exact unboundedness detection.
- Added primal feasibility, reduced-cost, dual feasibility, and strong-duality certificate checks before results are exposed.
- Added both `lpmax(...)` and transformed `lpmin(...)`.

## Convex quadratic programming

- Added exact active-set enumeration for convex quadratic objectives with affine equality/inequality constraints.
- Added exact KKT linear-system solving.
- Added active multiplier sign checks and full KKT re-verification.
- Added strict-convexity/uniqueness metadata.
- Nonconvex QPs are rejected explicitly.

## Integration

- U4 commands are available in Calculate and Worksheet Math blocks.
- Added command-palette entries for convexity, local optimization, box constraints, KKT checks, LPs, and QPs.
- Added `opthelp()`.
- Added the U4 runtime to the offline PWA shell.

## Certification

v2.3.0 adds a dedicated U4 deterministic suite, Worksheet regression coverage, browser-level Calculate coverage, primary-CI enforcement, release-gate assertions, and the full Chromium / Firefox / WebKit / mobile Chromium production soak.

U4 intentionally does not implement mixed-integer programming, a full Phase-I simplex, general nonlinear constrained optimization, interior-point methods, semidefinite programming, or universal global nonlinear optimization.
