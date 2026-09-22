# Calculus & Numerical Methods Semantics

This document defines the certified calculus and numerical behavior introduced in Implementation Phase 3.

## Architecture

Calculus lives in `calculus.js` and consumes:

1. `math.js` — parser, exact scalars, evaluator and typed core errors.
2. `algebra.js` — symbolic expressions, simplification, polynomials, restrictions and equations.
3. `calculus.js` — derivatives, controlled antiderivatives, limits, Taylor series and numerical methods.

The calculus layer does not introduce a second parser or evaluator.

A separate `calculus-worker.js` can execute supported heavy numerical methods off the main thread.

## Calculate / Worksheet command surface

The combined evaluator recognizes:

```text
diff(expression, variable [, order])
partial(expression, variable [, order])

gradient(expression, variable, ...)
jacobian(expr1; expr2; ..., variable, ...)
hessian(expression, variable, ...)

integrate(expression [, variable])
integral(expression, variable, lower, upper)
nintegral(expression, variable, lower, upper)

limit(expression, variable, target [, direction])
taylor(expression, variable, center, order)

nderivative(expression, variable, point)
root(expression, variable, lower, upper)
```

Examples:

```text
diff(x^3 + sin(x), x)

gradient(x^2+y^2, x, y)

jacobian(x^2+y; x*y, x, y)

hessian(x^2+3*x*y+y^2, x, y)

integrate(x^2 + cos(x), x)

integral(x^2, x, 0, 3)

limit(sin(x)/x, x, 0)

taylor(exp(x), x, 0, 5)

root(cos(x)-x, x, 0, 1)
```

## Symbolic derivatives

Certified derivative rules include:

- constants and variables;
- sums and differences;
- product rule;
- quotient rule;
- constant powers;
- general powers;
- exponentials;
- logarithms with constant bases;
- square roots;
- trigonometric functions;
- inverse trig functions;
- hyperbolic functions;
- absolute value with an explicit nondifferentiability restriction.

Higher derivatives are produced by repeated application of the same derivative engine.

The current certified maximum derivative order through the public helper is 20.

## Derivative domain restrictions

Derivative results preserve original expression restrictions and add stricter differentiability restrictions where needed.

Examples:

- `d/dx abs(x)` carries `x != 0`.
- `d/dx sqrt(x)` carries `x > 0`.
- `d/dx tan(x)` carries `cos(x) != 0`.
- `asin` / `acos` derivatives exclude the endpoints where their derivative denominator vanishes.

These restrictions are structured `Restriction` objects inherited from the algebra layer.

## Multivariable calculus

The public API supports:

- partial derivatives;
- gradient vectors;
- Jacobian matrices;
- Hessian matrices.

Variables are explicit for Calculate commands. Programmatic calls can derive sorted variable lists from the expression when appropriate.

Each component is a normal `SymbolicExpression`, so later Matrix and Worksheet integrations can consume it without string re-parsing.

## Controlled symbolic integration

Calc does **not** claim general symbolic integration.

The certified antiderivative engine currently includes:

- exact Rational polynomials;
- term-by-term sums/differences;
- constant multiples;
- `1/x`;
- powers of linear expressions;
- reciprocal linear expressions;
- `sin(ax+b)`;
- `cos(ax+b)`;
- `exp(ax+b)`;
- `ln(x)`.

Unsupported expressions return `UNSUPPORTED_INTEGRAL`.

For example:

```text
integrate(exp(-x^2), x)
→ UNSUPPORTED_INTEGRAL
```

It is not reported as “no antiderivative exists.”

## Antiderivative verification

Every antiderivative returned by the certified symbolic integrator is verified before release to the caller.

Verification order:

1. Differentiate the proposed antiderivative with the same symbolic derivative engine.
2. Compare simplified symbolic forms when possible.
3. If the forms are structurally different but potentially equivalent, test deterministic finite domain samples.
4. Reject the candidate as unsupported if verification cannot establish equivalence.

Returned `AntiderivativeResult` metadata records whether verification succeeded and which verification path was used.

## Integration constant

Indefinite integration displays an explicit:

```text
+ C
```

The integration constant is presentation/result semantics, not a mutable calculator variable.

## Definite integration

`integral(...)` first tries a certified symbolic antiderivative.

If successful:

```text
F(b) - F(a)
```

is computed through the shared evaluator.

Exact Rational results remain exact.

Example:

```text
integral(x^2, x, 0, 3)
→ 9
```

If no certified symbolic antiderivative is available, finite bounds fall back to adaptive numerical integration.

## Numerical integration

The production numerical integrator is adaptive Simpson integration with:

- absolute tolerance;
- relative tolerance;
- maximum recursion depth;
- maximum evaluation count;
- cancellation checks;
- error estimate accumulation.

Numerical results are explicitly approximate.

If the recursion limit is reached before the requested tolerance is achieved, Calc returns:

`CONVERGENCE_FAILURE`

rather than silently accepting the low-confidence estimate.

## Singular integrals

A non-finite integrand encountered during ordinary numerical integration returns:

`SINGULARITY_DETECTED`

Example:

```text
nintegral(1/x, x, -1, 1)
```

does **not** return zero by symmetric cancellation.

Cauchy principal value is not implicitly substituted for the ordinary integral.

## Improper integrals

Infinite-bound definite integration is intentionally not certified yet.

Inputs using `inf`, `-inf`, or equivalent infinite bounds return `UNSUPPORTED_INTEGRAL`.

This is a deliberate Phase 3 boundary.

## Compiled numeric functions

`CompiledNumericFunction` stores a parsed AST once and repeatedly evaluates it with changing values of one variable.

This avoids reparsing during:

- numerical differentiation;
- integration;
- root solving;
- numerical limit estimation.

The compiled evaluator uses the same Phase 1 AST evaluator as Calculate.

Non-real or non-finite evaluations return typed numerical errors rather than raw `NaN` / `Infinity`.

## Numerical differentiation

`numericalDerivative` uses a centered finite difference with Richardson improvement.

The result records:

- value;
- error estimate;
- effective step;
- evaluation count;
- method = `central-richardson`.

This is an approximation and is never presented as symbolic equality.

## Limits

Limit evaluation proceeds conservatively:

1. direct substitution when valid;
2. exact RationalFunction / Polynomial analysis;
3. repeated polynomial differentiation for rational `0/0` forms;
4. exact rational-function behavior at infinity;
5. analytic pole-order classification;
6. a small certified set of standard limits;
7. stabilized numerical sampling as a fallback.

### Rational removable singularities

Example:

```text
limit((x^2-1)/(x-1), x, 1)
→ 2
```

is resolved exactly.

### Rational poles

Pole multiplicity is used to classify one-/two-sided behavior.

Example:

```text
limit(1/x, x, 0)
→ LIMIT_DOES_NOT_EXIST
```

while:

```text
limit(1/x, x, 0, left)  → -infinity
limit(1/x, x, 0, right) → +infinity
```

### Numerical fallback

Numerical sampling is explicitly approximate and must stabilize.

If nearby samples continue oscillating or spreading materially, Calc returns `UNSUPPORTED_LIMIT` rather than pretending the samples prove a limit.

Numerical sampling is evidence for an approximation, not a general mathematical proof system.

## Standard limits

The current explicit standard-limit set includes common forms such as:

- `sin(x)/x` at zero;
- `(1-cos(x))/x^2` at zero;
- `(exp(x)-1)/x` at zero;
- `ln(1+x)/x` at zero.

Additional forms should be added only with deterministic tests.

## Taylor polynomials

`taylor(expression, variable, center, order)` repeatedly differentiates the expression and evaluates the derivatives at the center.

Coefficient:

```text
f^(k)(a) / k!
```

The current certified public order limit is 12.

The returned object preserves:

- symbolic polynomial expression;
- center;
- variable;
- order;
- coefficient/derivative metadata.

A remainder bound is **not** invented when none has been proven.

## Numerical root solving

Four numerical methods are implemented:

- bisection;
- Newton;
- secant;
- hybrid safeguarded Newton/bisection.

### Bisection

Requires a valid sign-changing finite bracket.

Invalid brackets return:

`INVALID_BRACKET`

### Newton

Uses the symbolic derivative where supported.

If symbolic differentiation is unavailable, it falls back to the numerical derivative engine.

Zero/unusable derivative, non-finite steps or iteration exhaustion return `CONVERGENCE_FAILURE`.

### Secant

Detects zero/near-zero secant denominators and iteration exhaustion.

### Hybrid

Requires a valid bracket and uses a Newton step only when that step remains inside the bracket and is numerically usable.

Otherwise it falls back to bisection.

This is the default implementation behind the public `root(...)` command.

## Root result metadata

Successful numerical roots record:

- approximate root;
- residual;
- iteration count;
- evaluation count;
- method;
- final bracket where applicable.

A returned root must pass the configured residual criterion.

## Central numerical policy

Default numerical controls are defined once in `DEFAULT_NUMERICAL`:

- absolute tolerance;
- relative tolerance;
- max iterations;
- max recursion depth;
- max evaluations.

Individual methods consume the same policy object rather than scattering unrelated magic tolerances through the UI.

## Cancellation

`CancellationToken` can interrupt supported synchronous numerical loops cooperatively.

A cancelled calculation raises:

`CANCELLED`

rather than returning a partial result.

## Web Worker architecture

`calculus-worker.js` loads the shared math/algebra/calculus engines and exposes worker tasks for:

- numerical derivative;
- adaptive integration;
- bisection;
- Newton;
- secant;
- hybrid root solving.

`NumericalWorkerClient` provides a browser-side request/cancellation boundary.

The worker does not contain duplicate mathematical algorithms.

## Typed calculus errors

Phase 3 adds stable error codes including:

- `UNSUPPORTED_DERIVATIVE`
- `UNSUPPORTED_INTEGRAL`
- `UNSUPPORTED_LIMIT`
- `LIMIT_DOES_NOT_EXIST`
- `CONVERGENCE_FAILURE`
- `INVALID_BRACKET`
- `NON_FINITE_EVALUATION`
- `SINGULARITY_DETECTED`
- `CANCELLED`

These remain distinct from core parser/domain errors.

## Deliberate Phase 3 limitations

Not yet certified:

- general symbolic integration;
- integration by parts search;
- general substitution search;
- arbitrary partial fractions integration;
- improper integrals;
- contour/complex integration;
- rigorous epsilon-delta proof generation;
- a complete symbolic limit engine;
- general L'Hopital recursion outside the exact polynomial-rational path;
- automatic exhaustive discovery of repeated/even-multiplicity roots;
- symbolic remainder bounds for Taylor series.

Unsupported cases are returned explicitly rather than approximated without disclosure.
