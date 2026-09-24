# Calc v2.1.0

Calc v2.1.0 adds **Phase U2 — Multivariable Calculus & Vector Analysis** to the University Mathematics Workstation.

## Multivariable calculus

- Added evaluated gradients, Jacobians, and Hessians.
- Added total differentials, normalized directional derivatives, implicit differentiation, and tangent planes.
- Added multivariable Taylor expansions for 1–3 variables through total order 3.
- Added multivariable limit handling with continuity certification and explicit path-disagreement witnesses.
- Added critical-point solving, two-variable Hessian classification, and certified Lagrange systems.

## Vector analysis

- Added 2D/3D divergence and curl.
- Added conservative-field testing and verified polynomial scalar-potential reconstruction.
- Added vector line integrals, scalar line integrals, and arc length over parameterized curves.
- Added adaptive rectangular double/triple integration.
- Added parameterized surface area and oriented flux.

## Integral theorems

U2 adds independent numerical verification tools for:

- Green's theorem on positively oriented rectangles;
- Stokes' theorem on planar rectangles;
- the divergence/Gauss theorem on axis-aligned rectangular boxes.

Each theorem tool computes both sides independently and reports the residual.

## Safety and correctness

- Numerical integration now fails explicitly with `INTEGRATION_CONVERGENCE` if the adaptive recursion budget is exhausted.
- Path sampling can prove that a multivariable limit does not exist, but finite path agreement is never treated as a proof of existence.
- Degenerate Hessian tests return `inconclusive`.
- Unsupported nonlinear constraints, arbitrary theorem domains, and general multivariable symbolic limits remain explicit unsupported cases.
- U2 is available in both Calculate and Worksheet Math blocks and is included in the offline PWA shell.

## Certification

v2.1.0 adds a dedicated deterministic U2 suite, Worksheet regression coverage, browser-level Calculate coverage, primary-CI enforcement, release-gate assertions, and the existing Chromium / Firefox / WebKit / mobile Chromium production soak.

GitHub Pages deploys only the exact certified SHA, followed by live-site verification and a version-pinned GitHub release.
