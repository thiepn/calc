# Worksheets & Notebooks V2 Semantics

This document defines the certified notebook behavior introduced in Implementation Phase 10.

## Architecture

Notebook execution lives in `notebook.js`.

The production Worksheet workspace is now a client of that engine rather than implementing its own block evaluator.

Primary concepts:

- Notebook document
- typed blocks
- dependency graph
- top-down environment
- explicit typed block references
- dirty/stale/clean/error/blocked state
- serialized typed block results
- notebook revision snapshots
- import/export/recovery

## Schema

Current notebook schema:

```text
calc.notebook/v2
```

A notebook stores:

- stable notebook ID
- title
- timestamps
- monotonically increasing revision
- ordered blocks
- bounded version snapshots
- notebook settings
- optional recovery metadata

Phase-0 worksheets without a schema are migrated automatically.

## Block types

Certified block types:

- Math
- Text
- Tool
- Matrix
- Data
- Graph

The maximum certified notebook size is 500 blocks.

This is a product/complexity budget, not a mathematical restriction.

## Top-to-bottom semantics

Blocks execute in document order.

Earlier assignments/functions establish the environment consumed by later Math/Matrix/Graph blocks.

A later block cannot create a value retroactively visible to an earlier block.

This rule is also applied to explicit block references.

## Math blocks

Math blocks route through the same certified stack as Calculate:

1. calculus commands
2. algebra commands
3. quantities/units
4. Phase 1 numeric evaluator

Assignments mutate only the notebook's top-down evaluation environment.

Example:

```text
Block A: a = 5
Block B: a * 2
```

Block B depends on Block A and evaluates to 10.

Exact Rational/Complex and Quantity results retain their typed representation.

## Symbol dependency inference

For Math blocks, the engine tracks symbols produced by earlier assignment/function-definition blocks.

Later uses of those symbols create dependency edges.

This dependency model is conservative and top-down.

Built-in functions, constants, unit symbols, and command names are excluded from user-symbol dependency inference.

## Explicit block references

Stable block references use:

```text
{{block:<block-id>}}
```

References must point to an earlier block.

Unknown references return `NOTEBOOK_REFERENCE_ERROR` / block-level reference diagnostics.

Forward references are rejected rather than implicitly reordering execution.

## Typed reference preservation

A whole typed block result is serialized independently of its display string.

Math-expression block references support certified scalar-compatible values including:

- Rational
- real Complex values
- finite numeric scalars
- Quantity

The engine injects a generated temporary symbol into the evaluator rather than converting the referenced value into a decimal string.

Therefore exactness/units can survive block-to-block flow.

## Tool block references

Tool-block config values may contain block references.

When a field is exactly:

```text
{{block:<id>}}
```

a scalar result is passed as a scalar value rather than via display text.

Embedded references inside a larger string use the referenced display representation.

Tool blocks execute through the Phase 8 Tool Registry.

This includes Active Phase 9 custom tools through their stable `custom.*` IDs.

If an archived/deleted custom tool is unavailable, that Tool block enters error state.

## Matrix blocks

Matrix blocks store:

- row/cell source strings
- operation

Cells use the shared scalar/symbolic evaluator.

Certified notebook Matrix operations route through the Phase 5 `resultSummary` API, including structural and numerical decompositions exposed by that API.

A scalar Matrix output such as determinant can be referenced by a later Math block without flattening its exact Rational value.

## Data blocks

Data blocks contain delimited source data plus an operation configuration.

Certified notebook Data operations:

- Dataset object
- descriptive summary
- Pearson correlation
- SVD regression

Parsing/statistical semantics come from Phase 6.

The notebook layer does not recalculate statistics independently.

## Graph blocks

Graph blocks contain Graph V2 source plus viewport configuration.

They compile through Phase 7 `parseGraphText`.

A successful block stores a serializable GraphSession definition as its typed result.

The Worksheet UI can send the block source to the full Graph workspace.

The notebook block itself does not invent a second plotting engine.

## Text blocks

Text blocks are non-computational document content.

They do not participate in the symbol environment.

They remain clean unless structurally changed.

## Block status model

Computational blocks use:

- idle
- dirty
- stale
- clean
- error
- blocked

### Dirty

The block itself was edited.

### Stale

An upstream dependency or ordering change may make the cached result outdated.

### Clean

The cached result corresponds to the current source/config/dependency state.

### Error

The block itself failed validation/evaluation.

### Blocked

The block depends on a block currently in error/blocked state.

An error does not stop independent later blocks from evaluating.

## Dependency failure isolation

If block A errors and block B explicitly/symbolically depends on A:

```text
A → error
B → blocked
```

An independent block C later in the notebook can still evaluate successfully.

The entire document is not aborted because one branch fails.

## Stale propagation

Editing a block marks:

- that block dirty
- all direct/transitive dependents stale

Invalidation merges:

- dependency edges stored from the previous successful graph
- edges inferred from the newly edited graph

This is important when an edit removes/renames a produced symbol.

Example:

```text
A: a = 5
B: a + 1
```

If A changes to:

```text
z = 5
```

B is still marked stale even though the *new* dependency graph no longer contains an a-producer.

## Structural invalidation

Changes that can alter top-down symbol meaning invalidate later computation conservatively.

Certified behavior:

- inserting a block invalidates computational blocks after the insertion point
- duplicating a block invalidates following computational blocks
- removing a block invalidates remaining computational blocks
- moving a block marks computational blocks stale

This favors correctness over over-aggressive cache reuse.

## Cached clean-block reuse

A second notebook run may reuse a clean cached computational block rather than recomputing it.

For cached Math assignment blocks, the exact serialized result is replayed into the top-down environment.

Function-definition Math blocks are re-evaluated because a callable function environment cannot be reconstructed safely from the generic serialized result.

Dirty/stale/error/blocked blocks are never treated as valid cache hits.

## Result serialization

Notebook result serialization understands typed values including:

- primitive
- BigInt
- Rational / Complex
- Quantity
- Matrix
- Vector
- Dataset
- SymbolicExpression
- ToolResult
- arrays
- safe JSON objects

The UI-facing display string is stored separately.

References consume the serialized typed value, not the display string.

## Transactions and revisions

Notebook edits are versioned.

The engine provides structural transaction helpers for:

- edit block
- add block
- remove block
- move block
- duplicate block

The production UI batches rapid text edits into revision checkpoints rather than creating one version snapshot per keystroke.

Notebook revision numbers only move forward.

## Version history

The current notebook keeps up to 30 version snapshots.

Snapshots omit cached computational results and reset blocks to dirty for future evaluation.

Restoring a version:

- keeps the notebook ID
- creates a newer revision
- restores block/source/config content
- marks computational blocks dirty
- requires re-evaluation

The revision counter never rewinds.

## Persistence

Notebooks continue using the existing IndexedDB `worksheets` store for compatibility.

Existing legacy worksheet records are normalized into `calc.notebook/v2` when loaded.

The application does not create a parallel incompatible notebook database.

## Auto-run

Notebook setting:

```text
autoRun
```

controls whether edits are automatically recalculated after a debounce.

Manual Run always evaluates the notebook.

Dirty/stale states remain visible while waiting for auto-run.

## Import/export

Structured notebook export:

```text
*.calcnb.json
```

uses schema `calc.notebook/v2`.

Export strips:

- local version history
- cached computational results

Imported notebooks receive:

- new local notebook ID
- revision 1
- imported title marker
- dirty blocks
- empty local version history

Markdown export produces a human-readable document containing:

- notebook title
- Text block content
- block headings
- source
- current displayed results

Markdown is presentation/export content, not a re-importable execution format.

## Recovery mode

`recoveryNormalize` attempts normal notebook validation first.

If the document is malformed:

- valid blocks are preserved where possible
- invalid blocks are quarantined into Text recovery blocks
- recovery issues are recorded
- auto-run defaults off
- UI shows a recovery banner

A malformed single block therefore does not require discarding the entire notebook.

## UI behavior

The production Worksheet/Notebook workspace provides:

- Math block
- Text block
- Tool block
- Matrix block
- Data block
- Graph block
- manual Run
- Auto-run toggle
- stable block-ID display
- Copy reference action
- duplicate
- reorder
- delete
- block status
- dependencies/result kind metadata
- notebook list
- version restore
- JSON import/export
- Markdown export
- recovery-mode banner

## Large-notebook behavior

Phase 10 uses:

- 500-block hard budget
- clean-result reuse
- dirty/stale dependency invalidation
- debounced auto-run
- debounced persistence
- per-block failure isolation

It does not build or render one accessibility/DOM object per internal numeric point in typed Data/Graph results.

## Deliberate Phase 10 limitations

Not certified in this phase:

- arbitrary backward/forward dependency DAG execution
- circular dependency solving
- concurrent parallel block execution
- live collaborative notebooks
- cross-notebook references
- externally linked datasets/files
- rich WYSIWYG Markdown editing
- embedded interactive mini-Graph canvas inside each block
- arbitrary code/script blocks
- worksheet execution of untrusted JavaScript
- cloud sync/conflict resolution
- semantic diff/merge of notebook versions

These remain explicit boundaries rather than hidden execution behavior.
