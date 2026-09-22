# Calc

A local-first universal calculator PWA and mathematical workstation.

## Current implementation

Calc currently includes:

- exact arbitrary-size Integer/Rational arithmetic;
- finite Real and exact-capable Complex scalars;
- scientific calculation, variables, user functions and angle modes;
- symbolic simplification, expansion, collection, factoring and substitution;
- equation, system and inequality solving for certified algebraic subsets;
- symbolic derivatives, multivariable calculus, verified antiderivatives, limits and Taylor polynomials;
- numerical differentiation, adaptive integration and safeguarded root solving;
- first-class physical quantities, exact unit conversions, physical constants and engineering relations;
- canonical Matrix/Vector/Basis/LinearTransformation objects;
- exact determinant/inverse/RREF/rank/nullity/subspace workflows;
- basis coordinates, change of basis, projections and linear-system classification;
- LU, Householder QR, Cholesky, symmetric eigendecomposition, SVD and pseudoinverse;
- characteristic/minimal polynomials, eigenspaces, multiplicities, diagonalization and restricted exact Jordan form;
- SVD least squares and condition diagnostics;
- descriptive statistics and linear regression;
- interactive 2D graphing;
- specialized everyday/finance/geometry/date/programmer/number-theory tools;
- persistent worksheets and local history;
- offline/installable PWA support.

Calc deliberately distinguishes exact from approximate, unsupported from impossible, and structural algebra from numerical decompositions.

## Matrix workspace

The Matrix workspace now supports:

```text
det(A)
tr(A)
RREF
A^-1
A^T
rank / nullity

Null(A)
Col(A)
Row(A)

LU
QR
Cholesky
SVD
A+

eigenanalysis
diagonalization
characteristic polynomial
minimal polynomial
Jordan form
```

Matrix input supports exact fractions and multi-cell TSV/CSV paste.

Numerical decompositions report residual diagnostics instead of returning matrices without verification.

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

## Algebra commands

```text
simplify((x^2 - 1)/(x - 1))
expand((x + 1)^3)
collect(x + 2*x^2 + x, x)
factor(x^2 - 5*x + 6)
solve(x^2 - 5*x + 6 = 0, x)
system(x + y = 3; x - y = 1)
inequality(x^2 - 1 <= 0, x)
substitute(x^2 + 1, x, 3)
```

## Calculus commands

```text
diff(x^3 + sin(x), x)
partial(x^2*y + y^3, x)

gradient(x^2+y^2, x, y)
jacobian(x^2+y; x*y, x, y)
hessian(x^2+3*x*y+y^2, x, y)

integrate(x^2 + cos(x), x)
integral(x^2, x, 0, 3)
nintegral(exp(-x^2), x, 0, 1)

limit(sin(x)/x, x, 0)
taylor(exp(x), x, 0, 5)

nderivative(sin(x), x, 0)
root(cos(x)-x, x, 0, 1)
```

## Architecture

- `math.js` — Phase 1 deterministic scalar/parser kernel.
- `algebra.js` — Phase 2 symbolic expressions, polynomials, equations and solving.
- `calculus.js` — Phase 3 symbolic calculus and numerical methods.
- `calculus-worker.js` — Phase 3 numerical worker backend.
- `units.js` — Phase 4 dimensions, quantities, constants and engineering.
- `linear-algebra.js` — Phase 5 Matrix/Vector/subspace/decomposition engine.
- `app.js` — application state, persistence, workspaces, command palette and UI routing.
- `styles.css` — responsive application design system.
- `sw.js` + `manifest.webmanifest` — offline/installable PWA runtime.
- `tests/` — cumulative deterministic certification suites.
- `docs/math/` — normative mathematical semantics.

No external runtime libraries are required.

## Verification

GitHub Actions checks syntax and runs cumulative certification for:

- core numeric/parser behavior;
- deterministic expression fuzzing;
- symbolic algebra;
- calculus/numerical methods;
- units/quantities/constants/engineering;
- Linear Algebra V2.

See:

- `docs/math/CORE_SEMANTICS.md`
- `docs/math/ALGEBRA_SEMANTICS.md`
- `docs/math/CALCULUS_NUMERICAL_SEMANTICS.md`
- `docs/math/UNITS_SEMANTICS.md`
- `docs/math/LINEAR_ALGEBRA_SEMANTICS.md`

for the exact supported semantics and deliberate limitations.
