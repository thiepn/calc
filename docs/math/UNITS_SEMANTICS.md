# Units, Quantities, Constants & Engineering Semantics

This document defines the certified quantity/unit behavior introduced in Implementation Phase 4.

## Architecture

Quantity support lives in `units.js` and consumes the Phase 1 scalar/parser kernel.

The quantity layer introduces:

- `DimensionVector`
- `UnitDefinition`
- `UnitRegistry`
- `Quantity`
- SI and IEC prefix engines
- physical-constant registry
- engineering-relation registry
- quantity-aware AST evaluation

The main evaluation path is now:

```text
Calculus commands
→ Algebra commands
→ Quantity / unit evaluation
→ Core numeric evaluation
```

The quantity layer reuses the canonical Phase 1 AST parser rather than defining a separate expression grammar.

## SI dimensions

`DimensionVector` tracks the seven SI base dimensions:

- length
- mass
- time
- electric current
- thermodynamic temperature
- amount of substance
- luminous intensity

Derived dimensions are constructed through vector addition/subtraction/scaling.

Examples:

- speed = L T^-1
- acceleration = L T^-2
- force = M L T^-2
- pressure = M L^-1 T^-2
- energy = M L^2 T^-2
- power = M L^2 T^-3
- voltage = M L^2 T^-3 I^-1
- resistance = M L^2 T^-3 I^-2

Dimension equality and semantic quantity kind are separate concepts.

## Semantic quantity kinds

A Quantity may carry a semantic kind in addition to its physical dimension.

Examples:

- length
- mass
- speed
- acceleration
- force
- pressure
- energy
- power
- voltage
- resistance
- charge
- frequency
- information
- angle
- absolute-temperature
- temperature-difference

The engine deliberately avoids aggressive relabeling when one dimension has multiple common meanings.

For example:

```text
1 J
```

is explicitly an energy quantity.

But:

```text
1 N * 1 m
```

is not automatically rewritten as joules, because the same dimensions can also represent torque.

## Quantity representation

A Quantity stores:

- base-SI magnitude
- DimensionVector
- semantic kind
- preferred display unit or compound display expression
- exactness
- optional composite display scale

Arithmetic operates on the base magnitude and dimensions.

Display conversion is derived from the canonical quantity.

## Exact conversion factors

Where a unit relationship is definitionally exact, scale factors use Phase 1 Rational values.

Examples include:

- centimetre
- kilometre
- inch
- foot
- mile
- gram / kilogram
- pound
- second / minute / hour
- litre
- byte / bit
- calorie
- watt-hour

Therefore finite exact conversions can remain exact.

Example:

```text
1 mi to km
→ exact 1.609344 km
```

Internally this remains a Rational conversion rather than passing through binary floating point.

Units whose scale necessarily involves an irrational value, such as degrees to radians, are explicitly approximate.

Measured physical constants can also be marked approximate even when represented by a decimal input.

## Prefix engine

SI prefixes are resolved dynamically for prefixable units.

Examples:

- mm
- cm
- km
- ms
- MHz
- kPa
- mA

The gram is registered as the prefixable mass unit, so:

```text
kg
```

resolves naturally as kilo-gram while the base SI mass magnitude remains kilograms.

IEC information prefixes are distinct:

- KiB
- MiB
- GiB
- TiB

SI and IEC meanings are not conflated:

```text
1 kB = 1000 B
1 KiB = 1024 B
```

## Squared and cubed prefixes

Prefix scaling occurs before exponentiation.

Therefore:

```text
1 cm^2 = 1/10000 m^2
1 cm^3 = 1/1000000 m^3
```

This is a permanent certification case.

## Direct quantity expressions

Calculate and Worksheet math blocks accept quantity arithmetic directly.

Examples:

```text
5 km + 300 m
→ 5.3 km

80 km / 1.25 hr to km/hr
→ 64 km/hr

5 kg * 9.81 m/s^2
→ 49.05 N
```

The quantity layer includes a quantity-specific normalization for the common calculator form:

```text
distance / number unit
```

so `80 km / 1.25 hr` is interpreted as division by the complete quantity `1.25 hr` without changing the Phase 1 algebra parser's precedence rules.

## Conversion syntax

Direct conversion uses:

```text
quantity to target-unit
```

or:

```text
convert(quantity, target-unit)
```

Targets may be simple or compound unit expressions.

Examples:

```text
1 mi to km
1 cm^2 to m^2
80 km/hr to m/s
1 KiB to B
```

## User-variable precedence

User variables take precedence over unit symbols.

If the environment contains:

```text
m = 5
```

then:

```text
2m
```

means the user variable, not 2 metres.

This prevents worksheet variables from being silently reinterpreted when their names match unit symbols.

Built-in function calls also take precedence over same-spelled unit aliases where applicable.

For example:

```text
min(1, 2)
```

remains the mathematical `min` function rather than the minute unit.

## Quantity assignments

The application evaluation layer supports quantity assignments such as:

```text
d = 5 km
t = 30 s
```

They participate in the same Calculate/Worksheet environment as ordinary scalar assignments.

A saved Quantity can subsequently be reused, converted, or used in further dimensionally valid arithmetic.

## Addition and subtraction

Addition/subtraction require compatible dimensions.

Examples:

```text
5 km + 300 m
```

is valid.

```text
1 m + 1 s
```

returns `DIMENSION_MISMATCH`.

For ordinary compatible quantities the left-hand display unit is preserved where practical.

## Multiplication and division

Dimensions add/subtract normally.

Selected unambiguous semantic kinds propagate.

Examples:

- mass × acceleration → force
- voltage × current → power
- frequency × wavelength → speed
- mass / volume → density
- voltage / current → resistance

Derived dimensions that are semantically ambiguous are not automatically relabeled.

## Powers and square roots

A dimensionful quantity currently requires an integer exponent.

Dimension exponents scale by that integer.

Square-rooting a Quantity is certified only when every physical dimension exponent is even.

For example:

```text
sqrt(9 m^2)
```

is dimensionally valid.

```text
sqrt(2 m)
```

returns `DIMENSION_MISMATCH`.

General fractional dimension exponents are not currently represented.

## Dimensionless functions

Logarithmic/exponential functions require dimensionless scalar inputs.

For example:

```text
ln(2 m)
```

is rejected.

Ratios of equal-dimensional physical quantities collapse to a dimensionless scalar.

## Angles

Angles are semantically distinct quantities despite being dimensionless in SI.

Supported explicit angle units include:

- rad
- degree
- gradian

Explicit angle quantities ignore the global calculator angle mode.

Thus:

```text
sin(90 deg)
```

evaluates as 1 whether the global calculator mode is RAD or DEG.

Bare scalar trig inputs continue to respect the global angle mode through the core calculator.

## Absolute temperature vs temperature difference

Phase 4 separates:

- absolute temperature
- temperature difference

Absolute-temperature units:

- K
- °C
- °F

Temperature-difference units:

- ΔK
- Δ°C
- Δ°F

### Affine conversion

Celsius and Fahrenheit use affine conversion to the Kelvin base value.

Definitions are stored using exact Rational scale/offset values.

### Arithmetic

Valid:

```text
30 °C - 20 °C
→ 10 Δ°C

20 °C + 10 Δ°C
→ 30 °C
```

Invalid:

```text
20 °C + 10 °C
```

Multiplication/division/exponentiation of affine Celsius/Fahrenheit absolute temperatures is rejected.

Kelvin is special: because it has zero offset, it may be used multiplicatively in physical unit expressions such as:

```text
J/K
```

and in Kelvin-based physical equations.

### Absolute zero

Any absolute-temperature Quantity must satisfy:

```text
T >= 0 K
```

This invariant is enforced in the Quantity constructor, so it applies to direct input and arithmetic.

Examples:

```text
-273.15 °C → 0 K
-274 °C    → PHYSICAL_DOMAIN_ERROR
```

Temperature differences may still be negative.

## Information units

Information quantities support byte and bit units with both SI and IEC prefixes.

The engine keeps information as a semantic kind even though its SI DimensionVector is dimensionless.

Ratios of like information quantities still collapse to an ordinary scalar.

## Unit registry

All v1 Phase 4 units are defined in one `UnitRegistry`.

The legacy simple converter tables in `math.js` remain temporarily for backward compatibility but are no longer the application source of truth.

The production converter UI now reads from:

```text
CalcUnits.CONVERTER_CATEGORIES
CalcUnits.UNIT_REGISTRY
```

## Physical constants

`CONSTANT_REGISTRY` provides typed Quantity values plus provenance metadata.

Current constants include:

- `c0` — speed of light in vacuum
- `g0` — standard gravity
- `h_planck` — Planck constant
- `e_charge` — elementary charge
- `kB_const` — Boltzmann constant
- `NA` — Avogadro constant
- `G_const` — Newtonian gravitational constant

Defining SI constants are marked exact.

Measured constants such as `G_const` are marked approximate.

Declared composite display units are retained, e.g. Planck's constant remains displayable as `J*s` rather than being flattened to base dimensions.

## Constant syntax

Constants can be used directly:

```text
g0
c0
h_planck
```

or inspected through:

```text
constant(g0)
```

The command result records source/provenance metadata.

## Engineering relations

Engineering calculations are declarative `EngineeringRelation` objects.

Each relation specifies:

- variable definitions
- physical dimensions
- semantic quantity kinds
- canonical formula
- solve functions for supported unknowns

Every relation formula is dimension-checked when the registry initializes.

A dimensionally invalid built-in engineering relation prevents registry validation from succeeding.

## Certified engineering relations

The current Phase 4 registry includes:

- Ohm's law
- electrical power
- Newton's second law
- kinetic energy
- wave relation
- density

Examples:

```text
eng(ohm, V=12 V, R=6 ohm)
→ I = 2 A

eng(power, V=12 V, I=2 A)
→ P = 24 W

eng(force, F=10 N, m=2 kg)
→ a = 5 m/s^2

eng(wave, f=2 Hz, lambda=3 m)
→ v = 6 m/s
```

## Engineering consistency checks

If all variables are supplied, Calc checks the relation rather than silently overwriting one input.

Example:

```text
eng(ohm, V=12 V, I=2 A, R=6 ohm)
→ Inputs are consistent
```

An inconsistent complete set returns an explicit inconsistency.

If more than one variable is missing, the relation returns `ENGINEERING_RELATION_ERROR` instead of inventing defaults.

## Engineering UI

The Tools workspace includes a dedicated Engineering relations tool.

It reads the same relation registry used by `eng(...)`.

Users can:

- select a relation
- fill known quantities with units
- leave one variable blank to solve
- fill all variables to verify consistency

No engineering formula is duplicated inside the UI.

## Quantity serialization

Quantities serialize:

- exact base magnitude
- DimensionVector
- semantic kind
- preferred unit id
- compound display expression
- compound display scale
- exactness

Round-tripping does not flatten exact Rational magnitudes into binary floating point.

## Typed unit errors

Phase 4 adds stable error categories including:

- `UNIT_ERROR`
- `UNKNOWN_UNIT`
- `DIMENSION_MISMATCH`
- `AFFINE_UNIT_ERROR`
- `PHYSICAL_DOMAIN_ERROR`
- `ENGINEERING_RELATION_ERROR`

These are distinct from parser, algebra, calculus, and numerical errors.

## Deliberate Phase 4 limitations

Not yet certified:

- currency / FX as physical units
- arbitrary user-defined units
- fractional physical dimension exponents
- automatic unit-aware symbolic algebra
- automatic unit-aware calculus differentiation/integration
- quantity-aware Graph axes
- exhaustive engineering formula catalog
- uncertainty propagation
- significant-figure arithmetic
- dimensional-analysis proof steps for arbitrary user formulas

These are explicit boundaries rather than silent fallbacks.
