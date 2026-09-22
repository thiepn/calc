# Implementation Phase 2 — Algebra & Symbolic Mathematics

Status: **implemented**

## Delivered

### Symbolic object model

Added `algebra.js` with:

- SymbolicExpression
- Restriction
- Polynomial
- RationalFunction
- Equation
- SolutionValue / SolutionSet
- LinearSystemSolution
- IntervalUnion

### Symbolic transformation

Implemented:

- conservative canonical simplification
- exact constant folding
- deterministic commutative ordering
- polynomial descending-degree canonicalization
- expand
- collect
- factor
- simultaneous substitution
- exact square-factor extraction for manageable Rational radicals

### Polynomial engine

Implemented exact Rational polynomial:

- construction from Phase 1 AST
- add/subtract/multiply
- bounded powers
- derivative
- evaluation
- long division
- gcd
- monic normalization
- Rational-root extraction
- reconstruction to symbolic AST

### Rational expressions and domains

Implemented RationalFunction reduction using polynomial gcd.

Source-domain restrictions survive simplification/cancellation and are surfaced in Calculate output.

### Solvers

Implemented certified:

- linear equations
- quadratic equations
- real/complex quadratic domain selection
- factorable higher-degree polynomials that reduce through Rational roots
- rational equations
- selected abs equations
- selected sqrt equations
- exact linear systems via the shared Matrix RREF engine
- linear/quadratic real inequalities

Every supported equation candidate is verified in the original equation.

Unsupported solver classes return `UNSUPPORTED_SYMBOLIC` rather than `no solution`.

### Application integration

Calculate and Worksheet math blocks now recognize:

- simplify(...)
- expand(...)
- collect(...)
- factor(...)
- solve(...)
- system(...)
- inequality(...)
- substitute(...)

Added Command Palette entries for common algebra workflows.

Symbolic outputs do not overwrite numeric `ans`, and numeric-only Graph/Save-as-ans result actions are disabled for symbolic result objects.

### PWA integration

`algebra.js` is loaded between `math.js` and `app.js` and included in the offline shell.

### Regression discovered/fixed during integration

Fixed a pre-existing workspace navigation bug where `querySelector(...).forEach` was used instead of the multi-element query helper.

## Verification

CI now runs:

1. syntax checks
2. existing app/core smoke suite
3. hardened core-kernel certification
4. deterministic core expression fuzzing
5. symbolic algebra certification

The algebra suite covers:

- cancellation restrictions
- expansion/collection
- factoring
- substitution
- linear/quadratic/rational/radical/absolute equations
- real/complex domains
- factorable higher polynomials
- exact systems
- inequalities
- symbolic serialization
- Calculate command routing
- unsupported-vs-no-solution behavior
- randomized polynomial reconstruction

## Phase boundary

The next phase should consume these symbolic objects for derivatives, integrals, limits and numerical methods.

Do not implement calculus by bypassing `CalcAlgebra` with separate expression logic.
