# Implementation Phase 4 — Units, Quantities, Constants & Engineering

Status: **implemented**

## Delivered

### Typed physical model

Added `units.js` with:

- DimensionVector
- UnitDefinition / UnitRegistry
- Quantity
- semantic quantity kinds
- exact conversion factors
- SI and IEC prefix engines
- affine temperatures
- temperature differences
- angles
- information quantities
- Quantity serialization

### Quantity expressions

Calculate and Worksheet blocks now support native quantity arithmetic and conversion.

Examples:

```text
5 km + 300 m
80 km / 1.25 hr to km/hr
5 kg * 9.81 m/s^2
1 cm^2 to m^2
1 KiB to B
sin(90 deg)
```

Quantity assignments participate in the normal variable environment.

### Dimension safety

Added dimensional checks for:

- addition/subtraction
- multiplication/division
- integer powers
- square roots
- logarithmic/exponential functions
- explicit angle trig

User variables take precedence over colliding unit symbols.

### Temperature architecture

Implemented separate absolute-temperature and temperature-difference semantics.

Certified:

- Celsius/Fahrenheit affine conversion
- Kelvin multiplicative use
- absolute minus absolute → temperature difference
- absolute + difference
- invalid absolute + absolute rejection
- affine-product rejection
- absolute-zero enforcement

### Prefixes

Added dynamic SI prefixes plus IEC information prefixes.

Squared/cubed unit expressions naturally apply prefix scale before exponentiation.

### Constants

Added a typed physical constant registry with exactness/provenance metadata.

Constants preserve declared composite units.

### Engineering

Added declarative dimension-validated relations for:

- Ohm's law
- electrical power
- Newton's second law
- kinetic energy
- wave relation
- density

Added `eng(...)` command solving and consistency checking.

Added a Tools-workspace Engineering relations UI backed by the same registry.

### Converter migration

The production Unit converter now reads the Phase 4 UnitRegistry/ConverterCategories.

Legacy `math.js` unit tables remain temporarily only for backward compatibility and are not the UI source of truth.

### Application integration

Evaluation order is now:

```text
Calculus
→ Algebra
→ Units / Quantity
→ Core numeric
```

Added Command Palette entries for:

- quantity conversion
- physical constants
- Ohm's law
- Newton's second law
- wave relation

Quantity results may be saved as `ans`.

Graph routing is disabled until the Graph workspace becomes quantity-aware.

### PWA integration

`units.js` is loaded before `app.js` and included in the offline shell.

## Certification

CI runs cumulative Phase 1–4 verification.

The Phase 4 suite covers:

- DimensionVector algebra
- exact prefix factors
- direct quantity arithmetic
- composite unit conversion
- square/cube prefixes
- dimension mismatch failures
- dimensionless function enforcement
- explicit angle independence
- Celsius/Fahrenheit/Kelvin semantics
- temperature differences
- affine arithmetic restrictions
- absolute-zero domain
- SI vs IEC information units
- semantic-kind conservatism
- physical constant exactness/provenance
- user-variable/unit-name collisions
- function/unit-name collisions
- quantity serialization
- exact converter round trips
- engineering solves
- engineering consistency checks
- underdetermined relation errors
- registry validation

## Phase boundary

Implementation Phase 5 should build the full Matrix/Vector/linear-algebra object system on top of the certified Phase 1 scalar kernel.

Do not expand the Phase 4 engineering catalog opportunistically during Phase 5; specialized catalog breadth belongs later.
