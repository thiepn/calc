# Changelog

All notable production changes to Calc are recorded here.

## [1.0.1] — 2026-09-23

### Bug fixes and hardening

- Prevented stored HTML/script injection through custom-tool metadata, tool result titles, and CSV histogram column names.
- Malformed encoded Tool deep links no longer crash Calc during startup or hash navigation.
- Tool search keeps focus while typing and retains the intended grid layout.
- Notebook title edits are recovery-safe before blur; reference copying handles unavailable/denied clipboard APIs without throwing.
- Unsafe imported notebook block IDs are rejected before DOM selector paths, and notebook import size is bounded.
- Rapid notebook edits always advance optimistic persistence revisions.
- Notebook-store read failures no longer create replacement notebooks or consume session recovery as if persisted notebooks had vanished.
- Remote notebook updates preserve local dirty edits as a separately persisted, visible conflict copy without corrupting the in-memory notebook list.
- Backups and controlled PWA updates abort if the active notebook or settings cannot be flushed safely.
- localStorage denial is non-fatal.
- Persisted Settings read failures leave unknown records untouched; device-ID write failure degrades safely and fallback angle/theme changes do not overwrite unknown persisted values.
- Malformed persisted Custom Tools are quarantined instead of aborting startup.
- Dynamic custom-tool aliases no longer hijack or erase existing alias mappings.
- Custom-tool save, archive, restore, and delete operations are persistence-first, so failed writes leave working runtime tools intact.
- Custom-tool revision conflicts install the newer persisted original and preserve local edits as a Draft conflict copy without masking the warning.
- Cross-tab Custom Tool refresh rebuilds runtime state from persisted truth, removes stale Active definitions after archive, defers safely while the builder is open, refreshes the editor after close, and preserves last-known-good state if the read fails.
- History write failures are reported, and failed Clear History operations no longer make persisted entries appear deleted.
- Mobile Worksheet layout no longer hides notebook switching, import/export, delete, and version controls.

### Verification

- Added a browser bug-sweep suite covering workspace navigation, malformed deep links, dynamic-rendering safety, continuous tool search, blocked Web Storage, notebook import/recovery/persistence/conflicts, Custom Tool lifecycle/conflicts/cross-tab refresh, History failure handling, every registered tool UI, and core Data interactions.
- The bug sweep runs alongside the existing migration, backup/restore, large-persistence, corruption, performance, and offline PWA soak on Chromium, Firefox, WebKit, and mobile Chromium.
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
