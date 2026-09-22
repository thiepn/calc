# Algebra & Symbolic Mathematics Semantics

This document defines the certified symbolic behavior introduced in Implementation Phase 2.

## Architecture

Symbolic mathematics lives in `algebra.js` and consumes the Phase 1 `CalcMath` parser, AST, exact Rational/Complex values, errors and matrix routines.

The numeric kernel remains independent of symbolic algebra.

Primary symbolic objects:

- `SymbolicExpression`
- `Restriction`
- `Polynomial`
- `RationalFunction`
- `Equation`
- `SolutionValue`
- `SolutionSet`
- `LinearSystemSolution`
- `IntervalUnion`

## Calculate command surface

The Calculate and Worksheet evaluators recognize the following symbolic commands before falling back to ordinary numeric evaluation:

```text
simplify(expression [, variable])
expand(expression [, variable])
collect(expression [, variable])
factor(expression [, variable])
solve(equation [, variable [, domain]])
system(equation; equation; ...)
inequality(inequality [, variable])
substitute(expression, variable, replacement)
```

Examples:

```text
simplify((x^2 - 1)/(x - 1))
→ x + 1   where x - 1 ≠ 0

expand((x + 1)^3)
→ x^3 + 3*x^2 + 3*x + 1

factor(x^2 - 5*x + 6)
→ (x - 2)*(x - 3)

solve(x^2 - 5*x + 6 = 0, x)
→ x ∈ {3, 2}

system(x + y = 3; x - y = 1)
→ x = 2, y = 1

inequality(x^2 - 1 <= 0, x)
→ x ∈ [-1, 1]

substitute(x^2 + 1, x, 3)
→ 10
```

## Simplification

The simplifier performs conservative identity and exact-constant rewrites.

Examples include:

- `x + 0 → x`
- `x - x → 0`
- `x*x → x^2`
- exact Rational constant folding
- double-negation removal
- sign normalization such as `x - (-1) → x + 1`
- deterministic ordering of commutative generic terms
- coefficient reduction around symbolic factors

The simplifier deliberately avoids transformations whose domain consequences are not tracked.

## Domain restrictions

Restrictions are first-class metadata.

The symbolic engine collects real-domain restrictions such as:

- denominator `d(x) != 0`
- `sqrt(g(x))` requires `g(x) >= 0`
- `ln(g(x))` requires `g(x) > 0`

If simplification cancels a factor, the original exclusion remains attached.

Example:

```text
(x^2 - 1)/(x - 1)
→ x + 1
restriction: x - 1 ≠ 0
```

Calculate surfaces those restrictions in the displayed symbolic result rather than storing them only invisibly.

## Exact radicals

Rational radicals extract exact square factors when the integer factorization stays within the Phase 2 safety range.

Examples:

- `sqrt(8) → 2*sqrt(2)`
- `sqrt(1/8) → (1/4)*sqrt(2)`

Perfect Rational squares continue to collapse to exact Rational values through the Phase 1 kernel.

General algebraic-number canonicalization is not claimed.

## Polynomials

`Polynomial` uses one named variable and exact Rational coefficients.

Implemented operations:

- canonical coefficient storage
- addition/subtraction
- multiplication
- non-negative integer powers
- derivative
- exact evaluation
- exact long division
- monic normalization
- gcd
- AST reconstruction

Polynomial AST output is ordered by descending degree.

The current certified exponent limit for polynomial construction is 32.

## Expansion and collection

For single-variable exact Rational polynomials, `expand` and `collect` use the canonical Polynomial representation.

Generic multivariable expressions can still receive safe structural expansion/simplification, but are not falsely represented as univariate polynomials.

## Factoring

Certified factoring includes:

- exact Rational linear factors
- quadratic factors with Rational roots
- repeated Rational-root extraction for manageable higher-degree polynomials

If a polynomial cannot be factored further over the supported Rational factor engine, the remaining polynomial is kept rather than being declared mathematically irreducible in every possible field.

## Equations

Equations preserve the original left/right symbolic expressions and their restrictions.

Default solving domain is the real numbers.

Certified solving includes:

- exact linear equations
- exact/irrational quadratic equations
- complex quadratic roots when `domain = complex`
- higher-degree polynomials reducible by exact Rational roots to certified linear/quadratic factors
- rational equations
- selected absolute-value equations
- selected square-root equations

Unsupported equation classes return `UNSUPPORTED_SYMBOLIC`; they are not reported as having no solution.

## Candidate verification

Solver candidates are checked against the original equation.

This is especially important for:

- rational equations with excluded denominator zeros
- equations transformed by squaring
- absolute-value branches

A generated candidate that fails the original equation is removed.

## Rational expressions

`RationalFunction` stores exact Polynomial numerator/denominator pairs.

Supported operations include:

- addition
- subtraction
- multiplication
- division
- integer powers
- polynomial-gcd cancellation

Cancellation does not delete restrictions inherited from the source expression.

## Linear systems

`solveLinearSystem` uses exact Rational coefficient extraction and the shared Matrix RREF engine.

Systems are classified as:

- unique
- parametric / underdetermined
- inconsistent

For parametric systems, free variables remain explicit and pivot variables are returned as symbolic expressions in those free variables.

The Calculate `system(...)` command separates equations with semicolons.

## Inequalities

Certified inequality solving currently covers one-variable linear and quadratic polynomial inequalities over the reals.

Results use `IntervalUnion` with explicit open/closed endpoints.

Examples:

- `2*x - 4 >= 0 → [2, ∞)`
- `x^2 - 1 <= 0 → [-1, 1]`

Higher-degree and rational inequalities currently return `UNSUPPORTED_SYMBOLIC` rather than guessing from samples.

## Substitution

Substitution is simultaneous.

For a mapping such as:

```text
x -> y
y -> x
```

the replacements do not cascade through one another.

The resulting expression is then safely simplified.

## Canonical ordering

Two ordering policies coexist deliberately:

- generic commutative expressions receive deterministic ordering;
- Polynomial output retains descending-degree ordering.

This prevents generic sorting from corrupting the stronger polynomial canonical representation.

## Serialization

`SymbolicExpression.toJSON()` stores:

- tagged AST
- domain restrictions
- exact Rational values through the Phase 1 serializer

`SymbolicExpression.fromJSON()` restores the same symbolic expression and restrictions without flattening exact values to decimal strings.

## Error semantics

Symbolic-specific stable error codes include:

- `UNSUPPORTED_SYMBOLIC`
- `EQUATION_ERROR`
- `INCONSISTENT_SYSTEM`

They extend the Phase 1 typed error model.

An unsupported operation is distinct from:

- no solution
- infinitely many solutions
- invalid input

## Deliberate limitations

Phase 2 does not claim a complete computer-algebra system.

Not yet certified:

- general transcendental equation solving
- arbitrary multivariate polynomial Gröbner-basis methods
- general radical equation isolation
- arbitrary absolute-value nesting
- higher-degree general closed-form solving
- rational inequality sign charts
- partial-fraction decomposition
- general algebraic-number normalization
- symbolic assumptions beyond the current restriction model

These limitations are explicit so later phases can extend the algebra engine without pretending current unsupported cases are mathematical impossibilities.
