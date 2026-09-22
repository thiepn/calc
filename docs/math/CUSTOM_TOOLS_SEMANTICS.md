# Custom Formula Builder Semantics

This document defines the certified behavior introduced in Implementation Phase 9.

## Governing rule

Custom tools are declarative data.

They cannot contain or execute:

- JavaScript
- `eval`
- `Function`
- arbitrary callbacks
- network requests
- DOM access
- storage access
- browser APIs

Formula and relation evaluation is routed only through Calc's certified parser/evaluator/algebra/unit layers.

## Architecture

Custom tools live in `custom-tools.js` on top of:

- Phase 1 scalar parser/evaluator
- Phase 2 symbolic algebra/equation solving
- Phase 4 quantity/unit engine
- Phase 8 Tool Registry / ToolDefinition / FormulaRelation contracts

Primary concepts:

- Custom Tool manifest
- staged validation report
- compiled ToolDefinition
- CustomToolLibrary
- Draft / Active / Archived lifecycle
- strict `.calctool.json` import/export

## Schema

Current schema identifier:

```text
calc.custom-tool/v1
```

A manifest contains bounded fields including:

- stable custom-tool ID
- name
- description
- aliases
- mode
- status
- variables
- formula/relation/proxy metadata
- output declaration
- tests
- revision number
- timestamps
- bounded local revision history

Unknown schema versions are rejected.

## Modes

Certified modes:

### Formula

A declarative expression evaluated through Calc's expression engine.

Example conceptual tool:

```text
variables:
  distance: quantity km
  time: quantity hr

formula:
  distance / time

output:
  quantity km/hr
```

### Relation

A scalar equation with exactly one blank variable at execution time.

Example:

```text
d = v * t
```

Known variables are substituted into the certified Phase 2 equation solver.

Relation mode is scalar-only in Custom Tools v1.

Quantity-bearing relation solving is deliberately unsupported until Calc has a full unit-aware symbolic equation layer.

### Built-in proxy

A safe customization wrapper around a compatible Phase 8 built-in tool.

The runtime itself is not copied.

A proxy stores editable metadata/defaults and delegates calculation to the certified built-in ToolDefinition.

Built-ins with schemas that Custom Tools v1 cannot represent safely are not eligible for duplication.

Specialized unit/engineering tools are not proxy-duplicable in v1.

## Variable types

Custom formula variables currently support:

- number
- integer
- percent
- quantity

Quantity variables require a declared input unit.

Percent values entered as human percentages are converted to fractional values before formula evaluation.

## Exact scalar inputs

Finite custom formula scalar inputs are converted into exact decimal Rational values before Phase 1 evaluation.

Therefore a custom formula such as:

```text
x / 3
```

with x = 1 can remain exactly:

```text
1/3
```

rather than being forced through binary floating point.

## Quantity formulas

Quantity variables are converted to canonical Phase 4 Quantity objects before expression evaluation.

If output is declared `quantity`, the formula must actually produce a Quantity compatible with the declared output unit.

Output conversion uses the Phase 4 dimensional conversion engine.

Dimension mismatch blocks semantic validation.

## Scalar output

A formula declared as scalar must not produce a Quantity.

This mismatch is rejected rather than silently discarding units.

## Structured constraints

Variables may declare bounded structured assumptions:

- required
- default
- minimum
- maximum
- positive
- nonzero
- integer through variable type

Absent min/max constraints are omitted from compiled Phase 8 input schemas rather than represented as null-valued constraints.

## AST allowlist

Formula/relation AST validation allows only Calc expression nodes:

- literal
- identifier
- unary
- postfix
- binary
- call

Identifiers must resolve to one of:

- declared custom variables
- certified Calc constants
- certified unit symbols

Function calls must resolve through Calc's built-in Function Registry.

Unknown function names are rejected.

Prototype-sensitive names such as:

- `constructor`
- `prototype`
- `__proto__`

are explicitly forbidden.

## Staged validation

Activation uses three stages:

1. schema
2. semantic/dimensional
3. test cases

A tool cannot become Active unless every stage succeeds.

The builder can run schema + semantic validation live without executing the full activation test set.

## Formula semantic validation

Formula validation includes:

- parse success
- AST allowlist validation
- identifier/function validation
- sample execution
- variable constraints
- quantity dimensional compatibility
- declared output type/unit compatibility

## Relation semantic validation

Relation validation includes:

- exactly one top-level equals sign
- valid left and right expressions
- AST allowlist validation
- declared scalar variables only

Runtime relation execution additionally requires exactly one blank variable.

Zero, multiple, or unsupported solution sets produce an explicit validation error rather than selecting an arbitrary root.

## Test cases

Active custom tools require at least one passing deterministic test.

Each test specifies:

- name
- input object
- expected numeric value or expected display
- optional numeric tolerance

Numeric comparisons use relative-scaled tolerance.

Display comparisons are exact strings.

A failing or missing test prevents activation.

## Lifecycle

Custom tools have three states:

- Draft
- Active
- Archived

### Draft

Editable and visible in Custom Builder.

Not registered as an executable normal Tool.

### Active

Validation/tests have passed.

Compiled into a normal Phase 8 `ToolDefinition` with ID:

```text
custom.<stable-id>
```

Active tools appear in:

- Tools list
- Custom category
- Tool search
- command palette
- normal history execution path

### Archived

Retained in the builder library but not registered for normal execution.

## Editing Active tools

Editing/saving an Active manifest creates a new revision and returns it to Draft.

The previously installed Active ToolDefinition is removed.

The edited tool must pass activation again before returning to the normal Tools registry.

## Revisions

Each save/activation/archive operation increments the revision and stores a bounded snapshot history.

The current maximum retained local revision snapshots is 25.

The builder exposes version history.

Restoring an earlier snapshot:

- keeps the stable tool ID
- creates a new revision
- returns the tool to Draft
- never rewinds the revision counter
- requires activation/testing again

## Persistence

Calc's IndexedDB schema is upgraded to version 2 with a:

```text
customTools
```

object store keyed by stable custom-tool ID.

On app startup:

1. manifests are loaded
2. Active manifests are recompiled
3. valid Active tools are injected into Tool Registry
4. Draft/Archived tools remain builder-only

An invalid/corrupted/obsolete Active manifest cannot prevent Calc from starting.

Startup installation failures are isolated and reported.

## Dynamic Tool Registry integration

Phase 8 ToolRegistry now supports controlled:

- custom-tool replacement
- custom-tool unregister

Only IDs prefixed:

```text
custom.
```

may be removed dynamically through the default API.

Built-in tools remain protected.

## Built-in duplication

Compatible built-ins can be duplicated into a Draft proxy.

The duplicate does not contain copied JavaScript.

It delegates to the original built-in runtime.

Only built-ins whose input schema maps safely to Custom Tools v1 are eligible.

## Import/export

Export filename convention:

```text
*.calctool.json
```

Export documents contain:

- schema
- export timestamp
- current tool manifest

Local revision history is not exported.

Exported status is forced to Draft.

## Import safety

Imports have a byte-size limit.

The importer strictly validates:

- root fields
- tool fields
- variable fields
- test fields
- expected-result fields
- output fields

Unknown nested fields are rejected.

Imports never preserve:

- original stable ID
- Active status
- revision history

Imported tools receive:

- new local ID
- Draft status
- revision 1
- new timestamps
- empty history

Semantic validation is required before the import is accepted.

Activation tests must still pass later before execution is enabled.

## Startup isolation

CustomToolLibrary installation returns:

- installed IDs
- failed tool diagnostics

One invalid Active custom tool therefore does not prevent other tools or Calc itself from loading.

## Structured history

Once Active, custom tools use the normal Phase 8 tool-history path.

History includes:

- custom Tool ID
- custom revision/version
- display result
- structured ToolResult serialization

## Builder UI

The production Tools workspace exposes Custom Builder.

The editor includes:

- persistent library
- New
- duplicate compatible built-in
- import
- name/description
- Formula / Relation / Proxy mode
- output declaration
- typed variable rows
- structured variable constraints
- test rows
- live staged validation
- Save Draft
- Activate
- Archive
- Export
- Delete
- revision-history restore

## Deliberate Phase 9 limitations

Not certified in Custom Tools v1:

- arbitrary JavaScript
- user-provided network calls
- arbitrary code plugins
- unit-aware symbolic relation solving
- custom functions calling other custom tools
- loops / branching / scripting
- user-defined recursive functions
- date/Money/BitInteger formula variables
- select/text variables in formula mode
- multi-output formulas
- custom Graph renderers
- remote sharing/sync
- cryptographic package signing
- automatic trust of imported Active status

These remain explicit boundaries rather than hidden execution paths.
