# Implementation Phase 9 — Custom Formula Builder

Status: **implemented**

## Delivered

### Safe declarative engine

Added `custom-tools.js` with:

- schema normalization
- formula compiler
- scalar relation compiler
- quantity formula support
- structured constraints
- AST/function allowlists
- staged validation
- deterministic tests
- ToolDefinition compilation
- Draft / Active / Archived lifecycle
- revision history
- restore-as-new-revision
- built-in proxy duplication
- strict import/export
- startup isolation
- in-memory CustomToolLibrary

No arbitrary JavaScript/eval/network execution is supported.

### Tool Registry support

Extended Phase 8 ToolRegistry with controlled dynamic operations for `custom.*` IDs:

- replace custom ToolDefinition
- unregister custom ToolDefinition

Built-ins remain protected.

Added the Custom tool category.

### Persistence

Upgraded IndexedDB from schema 1 to schema 2.

Added:

```text
customTools
```

store.

Active custom tools recompile/install on startup.

Invalid Active manifests are isolated rather than breaking app initialization.

### Builder UI

Added Custom Builder dialog with:

- saved custom-tool library
- new formula draft
- built-in duplication
- import
- formula/relation/proxy editor
- scalar/quantity output declaration
- typed variables
- min/max/positive/nonzero constraints
- deterministic tests
- live semantic validation
- activation gate
- archive
- delete
- export
- revision history restore

### Formula mode

Supports exact scalar formulas and Phase 4 quantity formulas.

Scalar numeric inputs are re-exactified to Phase 1 decimal Rationals before evaluation.

Quantity output must dimensionally match its declared output unit.

### Relation mode

Uses Phase 2 solveEquation after substituting known scalar inputs.

Requires exactly one blank variable at runtime.

Quantity relations are explicitly unsupported in v1.

### Built-in duplication

Compatible Phase 8 built-ins can be duplicated safely as proxy manifests.

The runtime delegates to the certified built-in ToolDefinition; JavaScript is not copied into the manifest.

Unsupported built-in input schemas are rejected.

### Tests / activation

Activation requires:

- valid schema
- valid AST/identifiers/functions
- successful semantic/dimensional sample execution
- at least one passing deterministic test
- all declared tests passing

### Import/export

Implemented strict `.calctool.json` files.

Import:

- enforces schema
- rejects unknown nested fields
- limits size
- performs semantic validation
- assigns new ID
- forces Draft
- resets revision/history

Export:

- omits local history
- forces Draft status

### Certification

Phase 9 certification covers:

- formula draft validation
- exact Rational formula inputs
- structured constraints
- quantity formulas
- dimensional mismatch rejection
- scalar relation solve
- one-missing-variable relation rule
- quantity-relation rejection
- unknown-function rejection
- forbidden identifier rejection
- mandatory activation tests
- failing-test activation block
- Active registry install/execution/uninstall
- Draft-on-edit lifecycle
- archive lifecycle
- revision restore
- built-in proxy parity
- unsafe proxy rejection
- strict root/nested import fields
- schema rejection
- malformed JSON
- semantic-invalid import
- forced Draft imports/new IDs
- library filtering/install
- startup isolation for invalid Active tools

## Phase boundary

Implementation Phase 10 should build persistent Worksheets/Notebooks V2 on the typed object and custom-tool infrastructure.

Custom formulas should be consumable there through stable tool IDs, but Worksheet execution must not embed or execute arbitrary custom code.
