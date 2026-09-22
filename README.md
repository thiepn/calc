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
- first-class physical quantities with SI dimensions;
- exact unit conversion factors where definitions are exact;
- SI and IEC prefix engines;
- affine absolute-temperature and temperature-difference semantics;
- explicit angle quantities;
- typed physical constants with provenance;
- dimension-checked engineering relations;
- exact Matrix determinant/RREF/inverse/transpose/rank;
- descriptive statistics and linear regression;
- interactive 2D graphing;
- specialized everyday/finance/geometry/date/programmer/number-theory tools;
- persistent worksheets and local history;
- offline/installable PWA support.

Calc deliberately distinguishes:

- exact from approximate;
- unsupported mathematics from no solution;
- numerical non-convergence from a mathematical result;
- physical dimension from semantic quantity kind.

It does not claim to be a complete CAS.

## Quantity examples

```text
5 km + 300 m

80 km / 1.25 hr to km/hr

5 kg * 9.81 m/s^2

1 cm^2 to m^2

20 degC to degF

30 degC - 20 degC

sin(90 deg)

1 KiB to B

constant(g0)

eng(ohm, V=12 V, R=6 ohm)
```

Quantity variables can also be assigned:

```text
d = 5 km
t = 20 min
d / t to km/hr
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

## Engineering commands

```text
eng(ohm, V=12 V, R=6 ohm)

eng(power, V=12 V, I=2 A)

eng(force, F=10 N, m=2 kg)

eng(wave, f=2 Hz, lambda=3 m)
```

The Tools workspace also exposes these relations through a normal form UI. Leave one variable blank to solve it, or fill every variable to verify consistency.

## Run

Open `index.html` through a static HTTP server, or use the GitHub Pages deployment.

## Architecture

- `math.js` — Phase 1 deterministic numeric/parser kernel.
- `algebra.js` — Phase 2 symbolic expressions, polynomials, equations and solving.
- `calculus.js` — Phase 3 symbolic calculus and numerical methods.
- `calculus-worker.js` — Phase 3 numerical worker backend.
- `units.js` — Phase 4 dimensions, quantities, units, constants and engineering.
- `app.js` — application state, persistence, workspaces, command palette and UI routing.
- `styles.css` — responsive application design system.
- `sw.js` + `manifest.webmanifest` — offline/installable PWA runtime.
- `tests/` — cumulative deterministic certification suites.
- `docs/math/` — normative mathematical semantics.

No external runtime libraries are required.

## Verification

GitHub Actions checks JavaScript syntax and runs:

- application/core smoke tests;
- hardened core-kernel certification;
- deterministic expression fuzzing;
- symbolic algebra certification;
- calculus and numerical-method certification;
- units/quantities/constants/engineering certification.

See:

- `docs/math/CORE_SEMANTICS.md`
- `docs/math/ALGEBRA_SEMANTICS.md`
- `docs/math/CALCULUS_NUMERICAL_SEMANTICS.md`
- `docs/math/UNITS_SEMANTICS.md`

for the exact supported semantics and deliberate limitations.
