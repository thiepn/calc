# Advanced CAS Semantics — Calc v2.0 / Phase U1

Phase U1 adds a dedicated advanced computer-algebra layer on top of Calc's existing exact kernel, symbolic algebra, and calculus engines.

The design rule is conservative:

> Return an exact symbolic result only when Calc has a certified transformation or solver path. Otherwise return an explicit unsupported error instead of guessing.

The U1 runtime lives in `cas.js` and is available from both **Calculate** and **Worksheet** Math blocks. Existing algebra/calculus syntax remains valid.

## Evaluation order

Math input is routed in this order:

1. `CalcCAS.runCommand`
2. `CalcCalculus.runCommand`
3. `CalcAlgebra.runCommand`
4. quantity/unit evaluation
5. core scalar evaluation

The CAS router is additive. For ordinary supported v1 expressions it delegates to the existing certified algebra/calculus implementation and returns the same result.

## Assumption contexts

Syntax:

```text
assume(x>0; simplify(sqrt(x^2)))
assume(x<0; simplify(abs(x)))
assume(x>0; solve(x^2=4, x))
```

`assuming(...)` is accepted as an alias.

Supported relations:

```text
<  <=  >  >=  =  !=
```

U1 uses assumptions for:

- sign-aware `abs` simplification;
- `sqrt(u^2)` sign reduction;
- `ln(exp(u))` and positive `exp(ln(u))` composition;
- pruning domain restrictions that are already proven by the assumption context;
- filtering finite real solution sets;
- contradiction detection for constant interval assumptions.

Examples:

```text
assume(x>0; simplify(sqrt(x^2)))
→ x

assume(x<0; simplify(abs(x)))
→ -x

assume(x>0; solve(x^2=4, x))
→ x = 2
```

Contradictory contexts such as `assume(x>0; x<0; simplify(x))` fail with `CONTRADICTORY_ASSUMPTIONS`.

Assumptions are local to the command. U1 does not create persistent global assumptions.

## Parameterized equations

The ordinary `solve` command now falls through to U1 when the base algebra solver correctly reports an unsupported symbolic-parameter case.

Certified parameterized polynomial degree:

```text
0, 1, 2
```

Example:

```text
solve(a*x+b=0, x)
```

returns conditional branches for:

- `a != 0`: the unique root;
- `a = 0, b = 0`: all real `x`;
- `a = 0, b != 0`: no solution.

Parameterized quadratics preserve the leading-coefficient and discriminant branches instead of silently dividing by a possibly zero parameter.

## Additional exact equation families

U1 adds certified handling for selected equation families that were outside the v1 algebra solver:

### Even-polynomial substitution

Even polynomials reducible through `u=x^2` are supported through degree 8 when the reduced polynomial is exactly solvable by the certified algebra engine.

```text
solve(x^4-2=0, x)
→ x ∈ {sqrt(sqrt(2)), -sqrt(sqrt(2))}
```

### Elementary transcendental equations

Certified linear-inner patterns include:

```text
exp(a*x+b) = c
ln(a*x+b) = c
sin(a*x+b) = c
cos(a*x+b) = c
tan(a*x+b) = c
```

Real sine/cosine targets outside `[-1,1]` return the empty set. Trigonometric solutions are represented as integer families with `k ∈ ℤ`.

Examples:

```text
solve(sin(2*x)=0, x)
solve(sin(x)=1/2, x)
solve(tan(3*x+1)=2, x)
```

U1 does not claim a general transcendental root solver. Equations such as `sin(x)+x=0` remain explicitly unsupported symbolically; Calc's numerical root tools remain available when a bracket or starting interval is appropriate.

## Advanced systems

### Nonlinear two-variable systems

`system(...)` keeps the existing exact linear-system path first. U1 adds a certified substitution fallback for two equations in two variables when one equation is linear in one unknown with a nonzero constant coefficient and substitution reduces the second equation to a certified univariate solve.

Example:

```text
system(x+y=3; x*y=2)
→ {x = 2, y = 1} or {x = 1, y = 2}
```

This is deliberately not a general Gröbner-basis solver.

### Parameterized linear systems

New syntax:

```text
psystem(x,y; a*x+y=1; x+a*y=2)
```

The first segment explicitly names the unknowns. Remaining symbols are treated as parameters.

U1 supports square parameterized systems with 1–3 unknowns. The generic branch is computed symbolically with determinant/Cramer semantics. For a single parameter, exact rational determinant zeros are analyzed as singular branches using the existing exact linear-system solver.

The output distinguishes:

- generic unique solutions when the determinant is nonzero;
- inconsistent singular cases;
- singular families with free variables when detected.

## Polynomial and rational inequalities

The existing exact linear/quadratic inequality solver remains first choice.

U1 adds a sign-chart fallback for univariate rational functions whose critical numerator/denominator roots are exactly obtainable through Calc's certified solvers.

Examples:

```text
inequality(x^3-x>0, x)
→ x ∈ (-1, 0) ∪ (1, ∞)

inequality(x^4-1<=0, x)
→ x ∈ [-1, 1]

inequality((x+1)/(x-2)>=0, x)
→ x ∈ (−∞, -1] ∪ (2, ∞)
```

Poles and removable-domain holes remain excluded even when algebraic cancellation would otherwise hide them.

## Advanced symbolic integration

The original calculus engine still handles its existing certified rules first.

U1 adds two verified families:

### Integration by parts for polynomial × elementary function

Supported forms:

```text
P(x) * exp(a*x+b)
P(x) * sin(a*x+b)
P(x) * cos(a*x+b)
```

with polynomial `P` up to the U1 complexity limit.

Examples:

```text
integrate(x*exp(x), x)
integrate(x^2*cos(2*x), x)
```

### Low-degree rational integration

After polynomial division, U1 supports rational functions with denominator degree at most 2, including logarithmic and arctangent forms.

Examples:

```text
integrate(1/(x^2+1), x)
integrate((2*x+3)/(x^2+x+1), x)
```

Every U1 antiderivative is **verified before exposure** through `CalcCalculus.verifyAntiderivative`. A candidate that cannot be symbolically or numerically certified is rejected.

Non-elementary integrals such as

```text
integrate(exp(-x^2), x)
```

remain explicit unsupported cases rather than receiving a fabricated elementary antiderivative.

## Printer correctness

U1 also fixes a pre-existing symbolic printer precedence defect.

The printer now preserves AST meaning for cases such as:

```text
x/(a*b)  → x / (a * b)
x-(a+b)  → x - (a + b)
```

This matters for parameterized formulas because a missing denominator parenthesis can change the mathematical meaning of a correct internal expression.

## Discoverability

The command palette includes U1 entries for:

- assumption-aware simplification;
- parameterized equations;
- parameterized linear systems;
- advanced symbolic integration.

`cashelp()` returns a compact syntax reminder.

## Error semantics

Important U1 error codes include:

```text
UNSUPPORTED_CAS
INVALID_ASSUMPTION
CONTRADICTORY_ASSUMPTIONS
VARIABLE_REQUIRED
SYSTEM_SHAPE
```

An unsupported result means only that the current certified symbolic implementation does not cover that form. It does not mean the mathematical problem has no solution.

## Certification boundary

U1 is covered by `tests/cas.js` plus the existing algebra and calculus suites. Certification covers:

- assumption simplification and contradictions;
- finite-root filtering under assumptions;
- parameterized linear/quadratic equations;
- even-polynomial substitution;
- trigonometric integer families;
- limited nonlinear systems;
- parameterized linear-system generic and singular branches;
- cubic/quartic/rational inequalities;
- verified integration-by-parts and rational antiderivatives;
- explicit unsupported boundaries;
- symbolic printer precedence.

U1 does **not** implement:

- general Gröbner bases;
- general symbolic nonlinear-system elimination;
- arbitrary transcendental equation solving;
- arbitrary symbolic inequality quantifier elimination;
- special-function antiderivatives for non-elementary integrals;
- theorem proving;
- global persistent assumptions;
- the broader multivariable-calculus expansion planned for Phase U2.
