# Changelog

All notable production changes to Calc are recorded here.

## [1.0.1] — 2026-09-23

### Bug fixes and hardening

- Prevented stored HTML/script injection through custom-tool metadata, tool result titles, and CSV histogram column names.
- Malformed encoded Tool deep links no longer crash Calc during startup or hash navigation.
- Tool search now keeps focus while typing instead of recreating its own input after each keystroke.
- Notebook title edits are recovery-safe immediately, reference copying handles clipboard denial, and unsafe imported block IDs are rejected.
- Web Storage denial is non-fatal, and notebook imports now have a bounded file-size limit.
- Malformed persisted custom tools are quarantined instead of aborting application startup.
- Dynamic custom-tool aliases no longer hijack or erase existing alias mappings.
- Tool-search results retain their grid layout after the focus-preserving rendering change.\n- Backups and app updates now abort if the active notebook cannot be persisted, preventing stale exports after quota/write failures.

### Verification

- Added a browser bug-sweep suite for navigation, deep links, search, injection resistance, recovery, registry-wide tool UI execution, and core Data interactions.
- The bug sweep runs with the production soak on Chromium, Firefox, WebKit, and mobile Chromium.

## [1.0.0] — 2026-09-23

### Calculator platform

- Exact and approximate scalar mathematics with complex-number support.
- Symbolic algebra, equation solving, calculus, numerical methods, quantities, units, constants, and engineering relations.
- Linear algebra, probability, statistics, datasets, regression, and Graph V2.
- Registry-driven everyday, finance, geometry, date/time, programmer, number-theory, unit, and engineering calculators.
- Safe Custom Formula Builder with validation, tests, lifecycle, import/export, and revision history.
- Typed Worksheets & Notebooks V2 with six block types, dependencies, version history, import/export, and recovery mode.

### Local-first data and resilience

- IndexedDB schema v5 with chunked large-notebook payload storage.
- Incremental notebook persistence that avoids rewriting unchanged chunks.
- Plain and password-encrypted backups with integrity hashes and selective atomic restore.
- Recoverable Trash with 30-day retention.
- Multi-tab optimistic revision handling and conflict copies.
- Storage diagnostics, quota checks, migration soak tests, corruption detection, and read-only recovery for damaged notebook payloads.
- Controlled service-worker updates with persistence preflight.

### Release hardening

- Real v4 → v5 database migration certification.
- Multi-megabyte notebook, backup, restore, corruption, interruption, and performance soak.
- Chromium, Firefox, WebKit, and mobile Chromium release matrix.
- Offline PWA reload certification on install-oriented Chromium targets.
- GitHub Pages deployment gated behind successful release certification of the exact commit SHA.
- Production release creation gated behind successful Pages deployment.

### Release-blocking defects fixed

- Selective notebook restore no longer destroys chunk-backed Trash payloads.
- Multi-element UI selectors consistently use the collection selector, preventing startup crashes.
- Service-worker offline certification uses navigation-safe browser orchestration.
