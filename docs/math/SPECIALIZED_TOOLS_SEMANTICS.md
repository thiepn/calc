# Specialized Calculators V2 Semantics

This document defines the certified specialized-tool behavior introduced in Implementation Phase 8.

## Architecture

Specialized calculators live in `tools.js`.

The production Tools workspace consumes one canonical `ToolRegistry`. Generic calculators are declarative `ToolDefinition` objects; unit conversion and engineering relations are registered as specialized tools backed by the already-certified Phase 4 runtimes.

Primary objects include:

- `ToolRegistry`
- `ToolDefinition`
- `FormulaRelation`
- `Money`
- `DateValue`
- `CalendarPeriod`
- `Duration`
- `BitInteger`
- `Line2D`

The UI does not own finance, geometry, date, programmer, or number-theory formulas.

## Tool Registry

Every enabled tool has:

- stable ID;
- name;
- category;
- description;
- aliases;
- typed input schema;
- deterministic runtime;
- tool version;
- optional examples;
- specialized/generic classification.

Registry validation runs at module initialization.

Duplicate IDs, duplicate input IDs, unknown categories, and missing runtimes are rejected.

## Enabled v1 tool catalog

Phase 8 registers 37 enabled tools across:

- Everyday
- Finance
- Geometry
- Dates & Time
- Programmer
- Number Theory
- Units & Measurement
- Engineering

The catalog intentionally groups related calculations into meaningful tools rather than creating hundreds of tiny pages.

## Generic runtime

Generic tools use one execution pipeline:

```text
ToolDefinition
→ typed input parsing
→ validation
→ tool runtime
→ normalized ToolResult
→ UI/history
```

Supported input schema types include:

- number
- integer
- percentage
- bigint
- date
- cash-flow list
- boolean
- select
- text

Missing required inputs produce `TOOL_INPUT_ERROR`.

## FormulaRelation

`FormulaRelation` represents a relationship with named variables and certified inverse solvers.

It solves one supported unknown when the remaining inputs are sufficient.

Underdetermined or unsupported-target cases return `TOOL_DOMAIN_ERROR`.

This provides the reusable relation architecture for future formula-tool expansion rather than hard-coding inverse formulas in UI components.

## Tool search and deep links

The Tool Registry provides ranked text search over:

- name
- ID
- aliases
- description

Tools are also injected into the global command palette.

Production deep links use:

```text
#tools/<stable-tool-id>
```

so a tool can be navigated directly without relying on list position.

## Structured tool history

Tool history records:

- tool ID
- tool version
- result display
- structured serialized ToolResult payload

Structured serialization preserves non-JSON-native values such as:

- BigInt
- Money
- DateValue
- CalendarPeriod
- Duration
- BitInteger
- exact Rational / Complex scalar values

History therefore does not rely solely on flattened display text.

## Money

`Money` stores:

- currency code
- currency-specific decimal digits
- integer minor-unit amount

Built-in currency digit rules currently cover common currencies including EUR, USD, GBP, CHF, JPY, KRW, CNY, CAD, AUD and KWD.

Money arithmetic requires identical currencies.

No implicit FX conversion exists.

Practical Money construction rounds to the currency's minor unit.

## Percentage semantics

The specialized percentage tools distinguish:

- percentage of a value
- percentage change
- reverse percentage

Percentage change:

```text
(new - old) / old
```

is undefined for old = 0 and returns an explicit domain error.

Reverse percentage does not reuse contextual `+%` calculator semantics from the expression engine.

## Ratio / fraction / splitting

Certified everyday tools include:

- proportion solving
- exact fraction → decimal → percentage
- bill + tip + person split

Fraction conversion uses exact Phase 1 Rational arithmetic.

Bill splitting uses practical currency rounding through Money.

## Compound interest

Future value supports:

- periodic compounding
- continuous compounding

Periodic formula:

```text
FV = P (1 + r/m)^(m t)
```

Continuous formula:

```text
FV = P exp(r t)
```

Rates are entered by the tool UI in percent and converted explicitly.

## Present value

Present value is the inverse periodic-compounding calculation:

```text
PV = FV / (1 + r/m)^(m t)
```

## Annuities

The annuity-payment tool distinguishes:

- ordinary annuity: payments at period end
- annuity due: payments at period beginning

The zero-rate case is handled directly rather than dividing by zero.

## Loans / amortization

The loan tool uses:

- principal
- nominal annual rate
- payment frequency
- years
- currency

Periodic payment is calculated from the periodic rate.

The generated amortization schedule tracks:

- payment
- principal
- interest
- remaining balance

The final payment is reconciled so the remaining balance is zero rather than leaving floating residue.

Displayed payment/interest/total values use Money rounding.

## NPV

NPV timing is explicit:

```text
cashFlows[0] occurs at t = 0
```

Formula:

```text
NPV(r) = Σ CF_t / (1+r)^t
```

At r = 0, NPV equals the arithmetic sum of cash flows.

Rates <= -100% are invalid.

## IRR

IRR solves:

```text
NPV(r) = 0
```

within the certified finite search range from approximately -99.9% through +1000%.

The implementation detects sign-changing roots over a transformed search grid and refines them by bisection.

Results may contain:

- zero IRRs
- one IRR
- multiple IRRs

Multiple roots are explicitly warned; the tool never pretends IRR is unique when it is not.

IRR outside the certified search range is not claimed.

## CAGR / ROI

CAGR:

```text
(end/start)^(1/years) - 1
```

requires positive start and non-negative end values.

ROI:

```text
(gain - cost) / cost
```

requires nonzero cost.

## Margin vs markup

These concepts remain distinct:

```text
markup = (price - cost) / cost
margin = (price - cost) / price
```

Certified reference:

```text
cost = 80
price = 100

markup = 25%
margin = 20%
```

## Break-even

Unit break-even calculation uses contribution margin:

```text
contribution = price - variable cost
breakEvenUnits = fixed cost / contribution
```

Contribution must be positive.

The tool reports both exact fractional units and the required whole-unit ceiling.

## DateValue

`DateValue` is a timezone-independent calendar date represented as:

- year
- month
- day

Parsing uses YYYY-MM-DD.

Calendar dates are validated explicitly.

Date-only calculations use UTC internally only as an epoch-day transport mechanism, avoiding local-DST shifts.

## Leap years

Gregorian leap-year rules are explicit.

Permanent reference cases:

- 2000 is a leap year
- 1900 is not a leap year

## CalendarPeriod vs Duration

`CalendarPeriod` represents:

- years
- months
- days

`Duration` represents elapsed day quantity.

These are distinct types.

Adding months/years uses calendar semantics rather than fixed day counts.

## End-of-month clamping

Calendar month/year addition clamps invalid target days.

Example:

```text
2024-02-29 + 1 year
→ 2025-02-28
```

Example:

```text
2025-01-31 + 1 month
→ 2025-02-28
```

Addition is sequentially meaningful:

```text
Jan 31 + 1 month + 1 month → Mar 28
Jan 31 + 2 months          → Mar 31
```

This behavior is documented rather than silently normalized.

## Calendar difference

Calendar difference reports signed:

- years
- months
- days

and separately supports exact elapsed-day difference.

## Weekday / ISO week

Certified date helpers include:

- Gregorian weekday
- ISO week-year/week number

ISO week-year is kept separate from calendar year.

## Business days

Business-day counting currently uses:

- Monday–Friday work week
- start date inclusive
- end date exclusive
- optional explicitly supplied holiday dates

No country holiday calendar is silently assumed.

## Triangle solver

The triangle tool supports certified:

- SSS
- SAS
- ASA
- AAS
- SSA

All completed triangles report:

- a, b, c
- A, B, C
- perimeter
- area
- inradius
- circumradius
- solved-case classification

Degenerate triangles are rejected.

## SSA ambiguity

SSA returns the actual number of valid solutions:

- 0
- 1
- 2

The supplementary-angle branch is retained when it forms a valid triangle.

The tool does not collapse the ambiguous case to one arbitrary solution.

## Circle solver

The circle solver accepts exactly one known measure:

- radius
- diameter
- circumference
- area

It derives the remaining measures from that value.

Supplying zero or multiple known measures is an explicit geometry error.

Because π is irrational, decimal circle measures are approximate.

## Other geometry tools

Certified geometry tools include:

- rectangle area/perimeter/diagonal
- regular polygon area/perimeter
- coordinate distance/midpoint
- robust line intersection

`Line2D` uses implicit coefficients:

```text
a x + b y + c = 0
```

so vertical lines do not require fake infinite slopes.

A vertical line's slope is explicitly undefined.

## BitInteger

`BitInteger` stores:

- raw unsigned bits
- bit width
- signed interpretation

Production UI offers:

- 8-bit
- 16-bit
- 32-bit
- 64-bit

The object supports wider internal widths up to the certified bounded maximum.

Signed interpretation uses two's complement.

## Programmer overflow policy

Input construction supports:

- `wrap`
- `strict`

Wrap mode reduces modulo 2^width.

Strict mode rejects values outside the selected signed/unsigned range.

Programmer arithmetic operations themselves are fixed-width and wrap through the raw-bit representation.

## Bit operations

Certified operations include:

- AND
- OR
- XOR
- masked NOT
- left shift
- logical right shift
- arithmetic right shift
- rotate left
- rotate right
- fixed-width addition/subtraction/multiplication

Shift/rotate count semantics are explicit.

The implementation does not rely on JavaScript's implicit 32-bit bitwise operators for 64-bit values.

## Programmer display

The inspector synchronizes:

- hexadecimal
- decimal unsigned
- decimal signed/interpreted
- octal
- binary

Hexadecimal output follows Calc's uppercase formatter convention.

## Number theory

Certified tools/helpers include:

- GCD
- LCM
- extended Euclidean algorithm
- Bézout coefficients
- canonical modulus
- modular inverse
- Chinese remainder theorem
- primality
- prime factorization
- positive divisors

## Modular inverse

A modular inverse exists only when:

```text
gcd(a,m) = 1
```

Failure is explicit.

## Chinese remainder theorem

CRT supports compatible non-coprime moduli.

Inconsistent systems return an error instead of producing a residue.

The resulting modulus is the combined least-common compatible modulus.

## Primality

Primality uses deterministic Miller–Rabin bases for the certified 64-bit integer range.

This is a deterministic result within that range, not a probabilistic label.

## Factorization

Prime factorization uses bounded exact trial division for moderate integers.

A complexity budget stops unreasonably expensive inputs.

It is not advertised as a large-integer factorization engine.

## Units and engineering

The Unit converter and Engineering relations appear in the same Tool Registry.

Their calculation runtimes remain the already-certified Phase 4 engines:

- `CalcUnits.UNIT_REGISTRY`
- `CalcUnits.ENGINEERING_RELATIONS`

No unit or engineering formulas are duplicated in `tools.js`.

## Tool UI

The Tools workspace is now generated from Tool Registry definitions.

Generic forms are derived from typed input schemas.

The list supports:

- categories
- search
- active selection
- command-palette discovery
- deep links

Only the Unit and Engineering specialized forms use custom form renderers.

## Registry-wide certification

The Phase 8 test runner executes every enabled generic registered tool with its declared defaults.

A tool that cannot execute its own default schema fails CI.

Additional deterministic reference vectors cover key boundary/identity cases.

## Typed errors

Phase 8 adds stable categories including:

- `TOOL_ERROR`
- `TOOL_INPUT_ERROR`
- `TOOL_DOMAIN_ERROR`
- `FINANCE_ERROR`
- `DATE_TOOL_ERROR`
- `PROGRAMMER_ERROR`
- `GEOMETRY_ERROR`

Phase 4 Unit/Engineering errors remain unchanged for specialized tools.

## Deliberate Phase 8 limitations

Not certified in this phase:

- live FX / currency conversion
- tax-jurisdiction rules
- country-specific automatic holiday calendars
- irregular loan day-count conventions
- bond pricing/yield conventions
- options pricing
- arbitrary cash-flow dates / XIRR
- geodesic/spherical geometry catalog
- arbitrary-precision prime factorization
- cryptographic-strength primality/factorization workflows
- large formula marketplace
- scripts/macros inside Tool Registry

These are explicit boundaries rather than hidden assumptions.
