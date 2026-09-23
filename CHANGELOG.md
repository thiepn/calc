# Changelog

All notable production changes to Calc are recorded here.

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
