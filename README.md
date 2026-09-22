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
- probability objects, distributions and seeded sampling;
- confidence intervals and hypothesis tests;
- SVD-backed multiple/polynomial regression;
- histogram, boxplot, scatter and distribution visualization models;
- interactive Data, Matrix, Graph, Tools and Worksheet workspaces;
- persistent local history/worksheets;
- offline/installable PWA support.

Calc deliberately distinguishes:

- exact from approximate;
- unsupported from impossible;
- missing data from zero;
- pairwise from complete-case operations;
- numerical failure from a statistical conclusion;
- physical dimensions from semantic quantity kinds.

It does not claim to be a complete CAS or general statistical package.

## Data workspace

Paste CSV, TSV, semicolon CSV or whitespace-separated data.

The Data workspace currently provides:

```text
descriptive summaries
missing counts
R7 quartiles / IQR
Pearson correlation
Spearman correlation

SVD linear regression
rank / condition diagnostics
coefficient inference

histogram
box plot

mean confidence interval
one-sample t test

Normal
Binomial
Poisson
Student t
Chi-square
Gamma
Beta
CDF / SF / quantiles
```

Large summaries and regression can run through the statistics worker.

## Probability & statistics engine

Typed statistical objects include:

```text
Dataset
DataColumn
Probability
Event
FrequencyTable
RandomVariable
Distribution
ConfidenceInterval
HypothesisTest
RegressionModel
```

Certified distribution families:

```text
Bernoulli
Binomial
Geometric
Negative Binomial
Hypergeometric
Poisson

Uniform
Normal
Exponential
Gamma
Beta
Chi-square
Student t
F
```

Tail-sensitive distributions use direct survival-function paths where appropriate instead of always computing `1 - CDF`.

## Regression

Regression routes through the Phase 5 linear-algebra backend:

```text
Dataset
↓
complete-case design matrix
↓
SVD pseudoinverse
↓
RegressionModel
```

The primary solver does not use the normal-equation inverse.

Rank-deficient models remain solvable through the pseudoinverse and emit an explicit warning.

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
- `app.js` — application state, persistence, workspaces and UI routing.
- `styles.css` — responsive design system.
- `sw.js` + `manifest.webmanifest` — offline/installable PWA runtime.
- `tests/` — cumulative deterministic certification suites.
- `docs/math/` — normative mathematical/statistical semantics.

No external runtime libraries are required.

## Verification

GitHub Actions checks syntax and runs cumulative certification for:

- core numeric/parser behavior;
- deterministic expression fuzzing;
- symbolic algebra;
- calculus/numerical methods;
- units/quantities/constants/engineering;
- Linear Algebra V2;
- Probability, Statistics & Data V2.

See:

- `docs/math/CORE_SEMANTICS.md`
- `docs/math/ALGEBRA_SEMANTICS.md`
- `docs/math/CALCULUS_NUMERICAL_SEMANTICS.md`
- `docs/math/UNITS_SEMANTICS.md`
- `docs/math/LINEAR_ALGEBRA_SEMANTICS.md`
- `docs/math/STATISTICS_PROBABILITY_SEMANTICS.md`

for the exact supported semantics and deliberate limitations.
