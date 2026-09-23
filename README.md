# Calc

A local-first universal calculator PWA and mathematical workstation.

**Current stable release: v1.0.1** · IndexedDB schema v5 · production channel.

## Current implementation

Calc currently includes:

- exact arbitrary-size Integer/Rational arithmetic;
- finite Real and exact-capable Complex scalars;
- symbolic algebra, equation solving, calculus and numerical methods;
- first-class physical quantities, units, constants and engineering relations;
- canonical Matrix/Vector/subspace objects and certified numerical decompositions;
- typed Dataset/probability/inference/regression systems;
- Graph V2 with explicit, piecewise, parametric, polar, implicit and inequality plots;
- a registry-driven specialized calculator system with finance, geometry, date, programmer and number-theory tools;\n- a safe declarative Custom Formula Builder with Draft/Active/Archived lifecycle, tests, quantities, relations, revision history, and strict `.calctool.json` import/export;\n- typed Worksheets & Notebooks V2 with Math/Text/Tool/Matrix/Data/Graph blocks, dependencies, stale tracking, version restore, import/export, and recovery mode;\n- a versioned persistence/backup layer with chunked large-notebook storage, streamed plaintext backups, encrypted backups, selective atomic restore, recoverable Trash, optimistic multi-tab writes, storage diagnostics, controlled PWA updates, and provider-neutral sync architecture;
- a Phase 13 release-candidate gate with large-fixture soak, v4→v5 migration certification, corruption/interruption tests, offline PWA checks, and Chromium/Firefox/WebKit/mobile browser coverage;
- persistent history/worksheets;
- offline/installable PWA support.

Calc deliberately distinguishes exact from approximate, unsupported from impossible, physical dimension from semantic quantity kind, statistical missingness from zero, and rendering from mathematical conclusions.

## Tools V2

The Tools workspace is generated from a canonical Tool Registry rather than a UI switch statement.

It currently registers **37 enabled tools** across:

```text
Everyday
Finance
Geometry
Dates & Time
Programmer
Number Theory
Units & Measurement
Engineering
```

The registry provides:

- stable tool IDs/versions;
- typed input schemas;
- search;
- command-palette discovery;
- deep links such as `#tools/loan`;
- normalized result envelopes;
- structured tool-history payloads.

### Everyday

```text
Percentage of value
Percentage change
Reverse percentage
Ratio & proportion
Fraction / decimal / percent
Split bill & tip
```

### Finance

```text
Compound interest
Present value
Annuity payment
Loan & amortization
NPV
IRR
CAGR
ROI
Margin & markup
Break-even
```

Money uses currency minor units and blocks implicit cross-currency arithmetic.

### Geometry

```text
Triangle solver — SSS / SAS / ASA / AAS / SSA
Circle solver
Rectangle
Regular polygon
Distance & midpoint
Line intersection
```

The triangle solver retains both valid SSA branches when the ambiguous case has two solutions.

### Dates & Time

```text
Date difference
Add calendar period
Age
Weekday & ISO week
Business days
```

Calendar arithmetic distinguishes elapsed duration from years/months/days and clamps invalid month-end targets explicitly.

### Programmer

```text
Bit integer inspector
Bit operations
```

Features include 8/16/32/64-bit values, two's complement, explicit signedness, strict/wrap input handling, shifts and rotations.

### Number theory

```text
GCD / LCM / Bézout
Modular inverse
Chinese remainder theorem
Primality
Prime factorization
Divisors
```

## Custom Formula Builder

Custom Builder lives inside the Tools workspace.

It supports three safe modes:

```text
Formula
Relation
Built-in proxy
```

Formula example:

```text
variables:
  distance · quantity · km
  time     · quantity · hr

expression:
  distance / time

output:
  km/hr
```

Activation requires:

```text
schema validation
→ AST / identifier validation
→ semantic / dimensional validation
→ deterministic tests
→ Active
```

Custom tools cannot execute JavaScript, `eval`, network requests, DOM code, or browser APIs.

Lifecycle:

```text
Draft
Active
Archived
```

Active custom tools compile into ordinary `ToolDefinition` objects under stable IDs such as:

```text
custom.<id>
```

and then participate in the normal Tools list, search, command palette, and history.

Other builder features include:

- exact Rational scalar inputs where possible;
- quantity variables and dimensional output validation;
- scalar relation solving through the certified algebra engine;
- structured min/max/positive/nonzero constraints;
- required passing tests before activation;
- revision history and restore-as-new-Draft;
- safe duplication of compatible built-in tools;
- IndexedDB persistence;
- strict `.calctool.json` import/export;
- forced-Draft imports with new local IDs;
- startup isolation for invalid old/corrupt Active manifests.

## Worksheets & Notebooks V2

The former Math/Text worksheet prototype has been replaced by a typed notebook engine.

Block types:

```text
Math
Text
Tool
Matrix
Data
Graph
```

Top-down symbols remain supported:

```text
Block A
a = 5

Block B
a * 2
→ 10
```

Stable typed block references use:

```text
{{block:<block-id>}}
```

A referenced Rational, real scalar, or Quantity is passed as a typed value rather than reconstructed from display text.

Notebook execution tracks:

```text
dirty
stale
clean
error
blocked
```

If an upstream block fails, dependent blocks become blocked while independent later branches continue to run.

Other notebook capabilities include:

- automatic migration of older worksheets;
- Active custom-tool blocks through stable Tool Registry IDs;
- Matrix operations through Phase 5;
- Data summaries/correlation/regression through Phase 6;
- Graph V2 source blocks;
- exact typed result serialization;
- clean-block result reuse;
- stale propagation across old and new dependency edges;
- manual or debounced Auto run;
- block duplicate/reorder/delete;
- up to 30 local revision snapshots;
- restore-as-new-revision;
- `.calcnb.json` import/export;
- Markdown export;
- recovery mode for malformed legacy records;
- 500-block notebook complexity budget.

## Persistence, Backup & PWA

Calc now uses a dedicated versioned persistence layer instead of owning IndexedDB schema logic inside the UI.

Current database schema:

```text
calc-db · version 5

history
worksheets
settings
customTools
meta
journal
tombstones
chunks
```

Data & Backup supports:

- full `.calcbackup.json` backups;
- optional password-encrypted `.calcbackup.enc.json` backups;
- PBKDF2-SHA-256 + AES-GCM encryption through Web Crypto;
- Web Share file transfer where supported;
- merge or replace restore;
- selective History / Notebooks / Settings / Custom Tools / deletion-metadata restore;
- newer / incoming / conflict-copy merge policies;
- hash/integrity verification before restore;
- stale-plan protection if another tab changes selected data after preview;
- atomic restore with recovery journal;
- database integrity reports;
- storage/quota reporting;
- persistent-storage requests.

Notebook and custom-tool writes use optimistic revisions. A stale tab cannot silently overwrite a newer saved revision; local edits are preserved as conflict copies.

DB v4 introduced tombstones for explicit deletion history. DB v5 adds the internal `chunks` store used to externalize large notebook sources, serialized results, and revision snapshots. Unchanged chunks are reused rather than rewritten, and recoverable Trash can retain chunk-backed notebook payloads without copying them into one large record.

### PWA updates

New service workers now install and wait instead of replacing an active editing session.

```text
update downloaded
→ Update ready
→ Restart & update
→ flush pending data
→ persistence integrity/update preflight
→ SKIP_WAITING
→ activate
→ reload
```

`persistence.js` is part of the offline application shell.

### Cross-device architecture

Calc remains local-first. Remote sync is disabled by default.

Phase 11 provides:

```text
calc.sync/v1
SyncAdapter
DisabledSyncAdapter
SyncManager
stable device ID
tombstones
backup-compatible transfer boundary
```

Today, the supported cross-device workflow is encrypted/plain backup transfer and restore; no Calc account or Calc cloud server is required.

## Release-candidate certification

Phase 13 adds a separate `Calc Release Soak` workflow. It reruns the cumulative deterministic suites, enforces static release budgets, then runs production-like browser tests on Chromium, Firefox, WebKit, and a Pixel 7 Chromium profile.

The browser soak covers:

- realistic IndexedDB v4 → v5 migration;
- multi-megabyte notebook chunk persistence and unchanged-chunk reuse;
- streamed backup verification and selective restore;
- Trash isolation during notebook-only restore;
- explicitly aborted writes and deliberately corrupted chunk recovery;
- offline service-worker reload on install-oriented Chromium targets;
- broad persistence performance and heap-growth ceilings.

GitHub Pages is triggered only after that workflow succeeds and checks out the exact certified commit SHA. A normal push can no longer deploy directly around the RC gate.

## Production release

Calc v1.0.0 remains the original production baseline; v1.0.1 is the current bug-fix release. Release metadata is centralized in `VERSION` and `release.json`, and runtime/backup/PWA version sources are certification-locked to the current release version.

After the release soak passes, GitHub Pages deploys the exact certified SHA. A separate production-release workflow then verifies the live Pages metadata, generates SHA-256 checksums for the shipped runtime files, and creates or verifies the release tag declared in `release.json` against that exact deployed SHA.

The final release gate also certifies:

- clean-device startup and schema initialization;
- healthy persistence/update preflight;
- restoration of a valid pre-upgrade DB-v4 backup into DB v5;
- valid current-version backup generation after upgrade/restore;
- production service-worker version handshake and offline reload.

## Graph V2

Graph supports:

```text
sin(x)
f(x)=x^2/5

slider(a;1;-3;3;0.1)
a*x^2

piecewise(-x;-inf;0;() | x;0;inf;[))
parametric(cos(t);sin(t);t;0;2*pi)
polar(1+cos(theta);theta;0;2*pi)
implicit(x^2+y^2-1)
ineq(y<=x^2)
```

Certified graph analysis routes through the algebra/calculus engines for roots, intersections, extrema, tangents and definite integrals.

## Data workspace

Provides typed dataset import, descriptive statistics, Pearson/Spearman, SVD regression, histogram/box plots, confidence intervals, t-tests and probability distributions.

## Matrix workspace

Provides exact structural linear algebra plus LU, Householder QR, Cholesky, SVD, pseudoinverse, eigenanalysis, diagonalization, characteristic/minimal polynomials and the restricted exact Jordan subset.

## Quantity examples

```text
5 km + 300 m
80 km / 1.25 hr to km/hr
5 kg * 9.81 m/s^2
20 degC to degF
sin(90 deg)
constant(g0)
eng(ohm, V=12 V, R=6 ohm)
```

## Architecture

- `math.js` — Phase 1 deterministic scalar/parser kernel.
- `algebra.js` — Phase 2 symbolic algebra.
- `calculus.js` / `calculus-worker.js` — Phase 3 calculus/numerical methods.
- `units.js` — Phase 4 quantities/constants/engineering.
- `linear-algebra.js` — Phase 5 linear algebra.
- `statistics.js` / `statistics-worker.js` — Phase 6 probability/statistics/data.
- `graph.js` / `graph-worker.js` — Phase 7 graph models, geometry and analysis.
- `tools.js` — Phase 8 Tool Registry, finance, dates, geometry, programmer and number theory.\n- `custom-tools.js` — Phase 9 safe custom formulas, relations, validation, lifecycle and import/export.\n- `notebook.js` — Phase 10 typed notebook blocks, dependencies, versioning, execution, import/export and recovery.\n- `persistence.js` — Phase 11–14 DB migrations, chunked notebook persistence, backup/restore, encryption, Trash/tombstones, multi-tab coordination, resilience diagnostics and stable production metadata.
- `app.js` — application state, persistence, workspaces and UI routing.
- `styles.css` — responsive design system.
- `sw.js` + `manifest.webmanifest` — offline/installable PWA runtime.
- `tests/` — cumulative deterministic certification suites.
- `docs/math/` — normative mathematical/product semantics.

No external runtime libraries are required.

## Verification

GitHub Actions runs cumulative certification for:

- core numeric/parser behavior;
- deterministic expression fuzzing;
- symbolic algebra;
- calculus/numerical methods;
- quantities/constants/engineering;
- Linear Algebra V2;
- Probability/Statistics/Data V2;
- Graphing V2;
- Specialized Calculators V2;\n- Custom Formula Builder;\n- Worksheets & Notebooks V2;\n- Persistence / Backup / PWA architecture;
- Phase 13 static RC certification;
- Phase 14 production version/release gate;
- clean-device and pre-upgrade backup compatibility certification;
- cross-browser production soak before Pages deployment;
- live deployment verification before the GitHub release is created.

The Phase 8 registry-wide test executes every enabled generic tool with its declared defaults in addition to deterministic boundary/reference cases.

See the files under `docs/math/` and `docs/release/` for the exact supported semantics, verification scope and deliberate limitations. Custom Tools are specified in `docs/math/CUSTOM_TOOLS_SEMANTICS.md`; notebook semantics are specified in `docs/math/NOTEBOOK_SEMANTICS.md`; persistence/PWA semantics are specified in `docs/math/PERSISTENCE_PWA_SEMANTICS.md`.
