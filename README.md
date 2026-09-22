# Calc

A local-first universal calculator PWA and mathematical workstation.

## Current implementation

Calc currently includes:

- exact arbitrary-size integer and Rational arithmetic;
- finite Real and exact-capable Complex scalars;
- scientific calculation, variables, multi-argument user functions and angle modes;
- symbolic simplification, expansion, collection, factoring and substitution;
- linear/quadratic/rational/radical/absolute equation solving for certified subsets;
- factorable higher polynomial solving;
- exact linear systems and linear/quadratic inequalities;
- symbolic derivatives, higher/partial derivatives, gradients, Jacobians and Hessians;
- controlled verified antiderivatives;
- exact and adaptive numerical definite integration;
- exact/controlled limits and Taylor polynomials;
- numerical derivatives and bisection/Newton/secant/hybrid root solving;
- cancellable numerical worker architecture;
- unit conversion;
- exact Matrix determinant/RREF/inverse/transpose/rank;
- descriptive statistics and linear regression;
- interactive 2D graphing;
- specialized percentage, loan, geometry, date, programmer and number-theory tools;
- persistent worksheets and local history;
- offline/installable PWA support.

The project intentionally distinguishes **unsupported mathematics** from **no solution** and **numerical non-convergence**. It does not claim to be a complete CAS.

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

## Run

Open `index.html` through a static HTTP server, or use the GitHub Pages deployment workflow.

## Architecture

- `math.js` — Phase 1 deterministic numeric/parser kernel.
- `algebra.js` — Phase 2 symbolic expressions, polynomials, equations and solving.
- `calculus.js` — Phase 3 symbolic calculus and numerical methods.
- `calculus-worker.js` — Phase 3 numerical worker task backend.
- `app.js` — application state, IndexedDB persistence, workspaces, command palette and Graph interaction.
- `styles.css` — responsive app UI and Light/Graphite/OLED themes.
- `sw.js` + `manifest.webmanifest` — offline/installable PWA runtime.
- `tests/` — deterministic core, fuzz, algebra and calculus certification suites.
- `docs/math/` — normative mathematical semantics.

No external runtime libraries are required.

## Verification

GitHub Actions checks JavaScript syntax and runs:

- application/core smoke tests;
- hardened core-kernel certification;
- deterministic core fuzzing;
- symbolic algebra certification;
- calculus and numerical-method certification.

See:

- `docs/math/CORE_SEMANTICS.md`
- `docs/math/ALGEBRA_SEMANTICS.md`
- `docs/math/CALCULUS_NUMERICAL_SEMANTICS.md`

for the exact supported semantics and deliberate limitations.
