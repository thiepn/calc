# Core Math Semantics

This document defines the v1 core-evaluation semantics implemented by `math.js` after Implementation Phase 1.

## Numeric hierarchy

Calc uses the following scalar hierarchy:

1. **Integer** — represented as a canonical `Rational` with denominator 1.
2. **Rational** — arbitrary-size numerator and denominator using `BigInt`, reduced by gcd with a positive denominator.
3. **Real** — finite IEEE-754 number used only when an operation cannot remain exact in the current kernel.
4. **Complex** — real and imaginary components may themselves remain exact rationals or approximate reals.

Promotion is monotonic:

- Rational + Rational stays exact Rational.
- Any Real operand promotes an ordinary real operation to Real.
- Any Complex operand promotes the operation to Complex.
- Exact Complex arithmetic remains exact while both components remain Rational.

There is no silent conversion of a finite decimal literal through binary floating point.

Examples:

- `0.1` → `1/10`
- `1e-3` → `1/1000`
- `0.1 + 0.2` → `3/10`
- `(1+i)^2` → `2i`

## Parser semantics

Input is normalized before tokenization.

Supported normalization includes:

- Unicode minus → `-`
- multiplication glyphs → `*`
- division glyph → `/`
- `π` → `pi`
- `√` → `sqrt`
- superscript ²/³ → powers
- `**` → `^`

Malformed adjacent numeric literals are rejected rather than interpreted as implicit multiplication.

Precedence:

| Operation | Binding |
| --- | --- |
| Function calls / grouping | highest atomic |
| `!`, `%` | postfix |
| `^` | right associative |
| unary `+`, `-` | below power |
| implicit multiplication, `*`, `/` | multiplicative |
| `+`, `-` | additive |

Therefore:

- `-2^2 = -4`
- `(-2)^2 = 4`
- `2^3^2 = 512`
- `2(3+4) = 14`

Identifiers are case-sensitive.

## Constants

Built-in constants:

- `pi`
- `e`
- `i`

They are reserved and cannot be overwritten by user assignments.

`ans` is reserved for application result state.

## User variables and functions

Variables use:

`a = 5`

Functions support one or more explicit parameters:

`f(x, y) = x^2 + y`

User-defined functions may call previously defined user functions.

Preview evaluation may inherit the current environment but does not commit assignments.

Dangerous or ambiguous identifiers such as `__proto__`, `constructor`, built-in function names, constants, and `ans` cannot be user-defined.

## Percentage semantics

Postfix percent always denotes division by 100.

- `20% = 1/5`
- `100 * 20% = 20`
- `100 + 20% = 100.2`

Calc does **not** give `100 + 20%` the contextual calculator meaning of “increase 100 by 20 percent.” Specialized percentage tools can provide those workflows explicitly.

## Powers

- Integer powers of Rational values stay exact.
- Integer powers of exact Complex values stay exact.
- Negative real bases with non-integer powers promote to Complex when complex mode is enabled.
- In real-only mode, those operations produce a domain error.
- `0^0` is defined by Calc as a domain error.
- zero to a negative power is a division-by-zero error.

## Square roots

Perfect rational squares remain exact.

- `sqrt(81) = 9`
- `sqrt(1/4) = 1/2`

With complex mode enabled:

- `sqrt(-4) = 2i`

With complex mode disabled, a negative square root is a domain error.

General irrational radicals remain approximate until the symbolic engine is implemented in Phase 2.

## Angle modes

Supported modes:

- RAD
- DEG
- GRAD

Several rational-valued common degree cases remain exact:

- `sin(30°) = 1/2`
- `cos(60°) = 1/2`
- `tan(45°) = 1`
- `asin(1/2) = 30°` in DEG mode

Exact symbolic values such as `sqrt(3)/2` are deferred to the symbolic engine.

## Errors

Core errors are typed with stable `code` values.

Current codes include:

- `PARSE_ERROR`
- `DOMAIN_ERROR`
- `DIVISION_BY_ZERO`
- `UNKNOWN_IDENTIFIER`
- `ARITY_ERROR`
- `COMPLEXITY_LIMIT`
- `NON_FINITE_RESULT`
- `SHAPE_ERROR`
- `INVALID_IDENTIFIER`

Parser errors include source ranges when available.

Raw Infinity/NaN is not intentionally returned by ordinary evaluator operations. Overflowing built-ins such as `exp(10000)` produce `NON_FINITE_RESULT`.

## Structured results

`evaluate()` returns a structured result containing:

- `value`
- `display`
- `approx`
- `exact`
- `kind`
- `ast`
- `metadata`

Metadata includes source, normalized source, numeric kind, exactness, angle mode, and display precision.

## Serialization

The kernel provides tagged serialization for:

- Rational
- Real
- Complex
- user-defined functions
- AST nodes

Exact numerators/denominators serialize as decimal strings so they survive JSON without loss.

## Complexity limits

The kernel applies bounded limits to protect the browser from accidental or hostile expressions:

- expression length
- token count
- AST node count
- evaluation recursion depth
- decimal exponent expansion
- factorial size

Exceeding a limit returns `COMPLEXITY_LIMIT`; it is not interpreted as a mathematical result.

## Determinism

The core evaluator contains no random-number primitive and performs no network access.

Given the same:

- expression
- environment
- angle mode
- complex-mode setting
- precision policy

it produces the same mathematical result.

## Deferred to Phase 2+

The following are intentionally not claimed by the Phase 1 kernel:

- symbolic radicals
- equations and inequalities
- symbolic simplification
- expansion/factoring
- symbolic polynomial objects
- symbolic domain constraints
- symbolic solving
- general exact trig values involving radicals or pi expressions

Those belong to the Algebra & Symbolic Mathematics implementation phase.
