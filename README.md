# Calc

A local-first universal calculator PWA and mathematical workstation.

## Current implementation

Calc currently includes:

- exact arbitrary-size Integer/Rational arithmetic;
- finite Real and exact-capable Complex scalars;
- scientific calculation, variables, user functions and angle modes;
- symbolic simplification, factoring, equation/system/inequality solving;
- symbolic and numerical calculus;
- first-class quantities, exact unit conversion, physical constants and engineering relations;
- canonical Matrix/Vector/Basis/LinearTransformation objects;
- exact subspace workflows and certified numerical decompositions;
- typed Dataset/DataColumn objects with row identity and explicit missingness;
- stable descriptive statistics with R7 quantiles;
- probability objects, distributions, seeded sampling and inference;
- SVD-backed regression;
- canonical Graph V2 plot/session objects with certified analysis;
- explicit, piecewise, parametric, polar, implicit and inequality graphing;
- statistical graph overlays that reuse Phase 6 models;
- persistent local history/worksheets;
- offline/installable PWA support.

Calc deliberately distinguishes exact from approximate, unsupported from impossible, statistical missingness from zero, and rendered geometry from mathematical conclusions.

## Graph V2

The Graph workspace supports ordinary explicit functions:

```text
sin(x)
f(x)=x^2/5
```

parameter sliders:

```text
slider(a;1;-3;3;0.1)
a*x^2
```

piecewise plots:

```text
piecewise(-x;-inf;0;() | x;0;inf;[))
```

parametric plots:

```text
parametric(cos(t);sin(t);t;0;2*pi)
```

polar plots:

```text
polar(1+cos(theta);theta;0;2*pi)
```

implicit curves:

```text
implicit(x^2+y^2-1)
```

and inequalities:

```text
ineq(y<=x^2)
```

Graph analysis includes:

```text
roots
intersections
extrema
tangent lines
definite integrals
```

These values route through the certified calculus/algebra engines. Canvas samples are used only for visualization.

Other Graph features include:

- adaptive function sampling;
- discontinuity splitting;
- removable-hole markers;
- open/closed piecewise endpoints;
- π-aware x-axis ticks;
- drag pan;
- wheel zoom;
- pinch zoom;
- canonical pointer trace;
- series visibility toggles;
- scatter overlays;
- SVD regression overlays;
- histogram overlays;
- box-plot overlays;
- probability-distribution overlays;
- 2D vector arrows;
- PNG export;
- textual accessibility summary.

## Data workspace

Paste CSV, TSV, semicolon CSV or whitespace-separated data.

Data provides:

```text
descriptive summaries
missing counts
R7 quartiles / IQR
Pearson / Spearman
SVD regression
histogram / box plot
mean confidence interval
one-sample t
probability-distribution CDF / SF / quantiles
```

Large summaries/regression can run in the statistics worker.

## Matrix workspace

Supports:

```text
det / trace
RREF
inverse / transpose
rank / nullity
null / column / row spaces

LU
Householder QR
Cholesky
SVD
pseudoinverse

eigenanalysis
diagonalization
characteristic polynomial
minimal polynomial
restricted exact Jordan form
```

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

## Algebra examples

```text
simplify((x^2 - 1)/(x - 1))
expand((x + 1)^3)
collect(x + 2*x^2 + x, x)
factor(x^2 - 5*x + 6)
solve(x^2 - 5*x + 6 = 0, x)
system(x + y = 3; x - y = 1)
inequality(x^2 - 1 <= 0, x)
```

## Calculus examples

```text
diff(x^3 + sin(x), x)
gradient(x^2+y^2, x, y)
jacobian(x^2+y; x*y, x, y)
hessian(x^2+3*x*y+y^2, x, y)

integrate(x^2 + cos(x), x)
integral(x^2, x, 0, 3)
limit(sin(x)/x, x, 0)
taylor(exp(x), x, 0, 5)

nderivative(sin(x), x, 0)
root(cos(x)-x, x, 0, 1)
```

## Architecture

- `math.js` — Phase 1 deterministic scalar/parser kernel.
- `algebra.js` — Phase 2 symbolic expressions and solving.
- `calculus.js` — Phase 3 symbolic calculus and numerical methods.
- `calculus-worker.js` — numerical calculus worker.
- `units.js` — Phase 4 dimensions, quantities, constants and engineering.
- `linear-algebra.js` — Phase 5 Matrix/Vector/subspace/decomposition engine.
- `statistics.js` — Phase 6 Dataset/probability/inference/regression engine.
- `statistics-worker.js` — Phase 6 large-data worker.
- `graph.js` — Phase 7 canonical plot/session/analysis engine.
- `graph-worker.js` — Phase 7 graph geometry/analysis worker.
- `app.js` — application state, persistence, workspaces and UI routing.
- `styles.css` — responsive design system.
- `sw.js` + `manifest.webmanifest` — offline/installable PWA runtime.
- `tests/` — cumulative deterministic certification suites.
- `docs/math/` — normative mathematical/statistical/graph semantics.

No external runtime libraries are required.

## Verification

GitHub Actions checks syntax and cumulative certification for:

- core numeric/parser behavior;
- deterministic expression fuzzing;
- symbolic algebra;
- calculus/numerical methods;
- units/quantities/constants/engineering;
- Linear Algebra V2;
- Probability, Statistics & Data V2;
- Graphing V2.

See:

- `docs/math/CORE_SEMANTICS.md`
- `docs/math/ALGEBRA_SEMANTICS.md`
- `docs/math/CALCULUS_NUMERICAL_SEMANTICS.md`
- `docs/math/UNITS_SEMANTICS.md`
- `docs/math/LINEAR_ALGEBRA_SEMANTICS.md`
- `docs/math/STATISTICS_PROBABILITY_SEMANTICS.md`
- `docs/math/GRAPHING_SEMANTICS.md`

for exact supported semantics and deliberate limitations.
