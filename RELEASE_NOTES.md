# Calc v2.0.0

Calc v2.0.0 begins the **University Mathematics Workstation** line with Phase U1: Advanced CAS & Symbolic Mathematics.

## Advanced CAS

- Added a dedicated `CalcCAS` layer without replacing the exact v1 numerical/algebra/calculus kernels.
- Added local assumption contexts with sign-aware simplification, domain pruning, finite-root filtering, and contradiction detection.
- Added conditional solving for parameterized linear and quadratic equations.
- Added exact even-polynomial substitution for certified biquadratic-style equations.
- Added elementary exponential, logarithmic, sine, cosine, and tangent equation families with integer-parameter solutions where applicable.
- Added limited exact nonlinear 2×2 substitution systems.
- Added `psystem(...)` for square parameterized linear systems with symbolic determinant/Cramer solutions and singular-branch analysis.
- Extended inequality solving to certified higher-degree polynomial and rational sign charts.
- Extended symbolic integration to polynomial × exp/sin/cos integration-by-parts families and low-degree rational functions.
- Every new symbolic antiderivative is verified before exposure.

## Integration

- Advanced CAS commands are available in both Calculate and Worksheet Math blocks.
- Added command-palette entries for assumptions, parameter equations, parameterized systems, and advanced symbolic integration.
- Added `cashelp()` as a compact syntax reference.
- Added the CAS runtime to the offline PWA shell.

## Correctness

- Fixed symbolic pretty-printing so denominator products and right-hand subtraction groups retain required parentheses.
- Unsupported symbolic cases remain explicit; U1 does not pretend to be a universal CAS.
- The original algebra and calculus suites remain passing.
- Added a dedicated U1 deterministic CAS certification suite covering assumptions, parameter branches, trig families, nonlinear systems, rational inequalities, advanced integration, and unsupported boundaries.

## Certification

v2.0.0 is gated by the full existing deterministic mathematics/product suite plus the new U1 CAS suite, static release checks, and the cross-browser production soak on Chromium, Firefox, WebKit, and mobile Chromium.

GitHub Pages deploys only the exact certified SHA. The production release workflow verifies the live v2.0.0 metadata before creating the immutable release tag.
