# Calc

A local-first universal calculator PWA and mathematical workstation.

## Current implementation

Calc currently includes:

- exact arbitrary-size integer and Rational arithmetic;
- finite Real and exact-capable Complex scalars;
- scientific calculation, variables, multi-argument user functions and angle modes;
- symbolic simplification, expansion, collection, factoring and substitution;
- linear/quadratic/rational/radical/absolute equation solving for the certified subsets;
- factorable higher polynomial solving;
- exact linear systems and linear/quadratic inequalities;
- unit conversion;
- exact Matrix determinant/RREF/inverse/transpose/rank;
- descriptive statistics and linear regression;
- interactive 2D graphing;
- specialized percentage, loan, geometry, date, programmer and number-theory tools;
- persistent worksheets and local history;
- offline/installable PWA support.

The project intentionally distinguishes **unsupported mathematics** from **no solution**. It does not claim to be a complete CAS.

## Algebra commands

The Calculate and Worksheet surfaces support commands such as:

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

## Run

Open `index.html` through a static HTTP server, or use the GitHub Pages deployment workflow.

## Architecture

- `math.js` — Phase 1 deterministic numeric/parser kernel.
- `algebra.js` — Phase 2 symbolic expressions, polynomials, equations and solving.
- `app.js` — application state, IndexedDB persistence, workspaces, command palette and Graph interaction.
- `styles.css` — responsive app UI and Light/Graphite/OLED themes.
- `sw.js` + `manifest.webmanifest` — offline/installable PWA runtime.
- `tests/` — deterministic core, fuzz and symbolic certification suites.
- `docs/math/` — normative mathematical semantics.

No external runtime libraries are required.

## Verification

GitHub Actions checks JavaScript syntax and runs:

- application/core smoke tests;
- hardened core-kernel certification;
- deterministic core fuzzing;
- symbolic algebra certification.

See `docs/math/CORE_SEMANTICS.md` and `docs/math/ALGEBRA_SEMANTICS.md` for the exact supported semantics.
