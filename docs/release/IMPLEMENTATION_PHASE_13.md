# Implementation Phase 13 — Release-Candidate Certification & Production Soak

Phase 13 freezes feature expansion and certifies the existing Calc product under realistic persistence, browser, offline, and failure conditions.

## Scope

No new mathematical subsystem is introduced. The phase is release hardening only:

- realistic large fixtures;
- v4 → v5 database upgrade soak;
- multi-megabyte large notebook persistence;
- chunk reuse and write-amplification checks;
- streamed backup and restore matrix;
- Trash isolation during selective notebook restore;
- interrupted transaction and corruption recovery;
- offline PWA reload;
- cross-browser desktop coverage;
- mobile Chromium coverage;
- storage performance envelope;
- static release budgets;
- deployment gating.

## Browser/device matrix

The release workflow runs the same production soak against:

- Chromium desktop;
- Firefox desktop;
- WebKit desktop;
- Chromium using a Pixel 7 mobile profile.

PWA offline reload is certified on Chromium desktop and the mobile Chromium profile because those are the install-oriented targets for this browser-first PWA. The remaining projects still certify startup, database migration, large persistence, restore, corruption handling, and performance behavior.

## Required production-soak scenarios

### v4 → v5 migration

A real IndexedDB v4 fixture is created with:

- 1,200 calculation-history records;
- multiple notebooks;
- settings;
- a custom-tool record;
- meta state;
- tombstone data.

Calc must reopen it as v5, create the chunk store, and preserve the pre-upgrade records.

### large notebook persistence

A multi-megabyte notebook exercises:

- externalized block sources;
- large serialized block results;
- version-snapshot payloads;
- incremental re-save;
- zero chunk rewrites when unchanged;
- hydration equality.

### Backup and restore

The soak builds a multi-megabyte plaintext backup through the chunked Blob path, verifies it, deletes the notebook into Trash, and performs a notebook-only restore.

The release gate specifically requires **Trash isolation**: selective notebook restore must not clear, overwrite, or corrupt payload chunks owned by a Trash item.

### interrupted operations

An explicitly aborted IndexedDB write transaction must leave no partial record.

A deliberately removed payload chunk must:

- reject strict hydration;
- appear as an integrity issue;
- open through tolerant notebook loading only in read-only recovery mode.

No automatic overwrite of the damaged record is permitted.

### offline PWA reload

After the service worker controls the app:

- the shell version handshake must report the RC cache;
- the browser is forced offline;
- navigation reload must succeed from the cached shell;
- ordinary calculator execution must remain functional.

### performance envelope

A repeated multi-megabyte persistence fixture is measured in-browser.

The RC gate uses deliberately broad ceilings to catch catastrophic regressions rather than benchmark noise:

- large initial save < 15 s;
- five repeated hydrations < 12 s total;
- backup Blob construction < 15 s;
- Chromium heap growth, when exposed by the browser, < 160 MiB.

## Static RC gates

The static gate rejects a release if:

- DB schema is not v5;
- the RC service-worker cache is wrong;
- an application-shell asset is missing;
- external runtime scripts/styles are introduced;
- PWA scope/start URL regress;
- the installed-app zoom lock regresses;
- release-soak browser coverage is removed;
- Pages can deploy directly from a push without certification;
- core file-size budgets are exceeded.

## Deployment rule

GitHub Pages no longer deploys directly from a push.

The production path is:

```text
push to main
→ Calc CI
→ Calc Release Soak
   → deterministic cumulative certification
   → Chromium
   → Firefox
   → WebKit
   → mobile Chromium
   → RC certification
→ Deploy Calc to GitHub Pages
```

Pages checks out the exact SHA reported by the successful release-soak run.

## Final defect fixed in Phase 13

Phase 12 used one internal chunk store for active notebooks and recoverable Trash payloads. A selective notebook restore cleared that entire chunk store, which could invalidate a Trash item even though Trash was not selected.

Phase 13 changes restore behavior so that:

- chunks referenced by unselected Trash items are protected;
- old active-notebook chunks are deleted selectively;
- restored notebooks use a restore-specific chunk namespace;
- active/restored notebooks cannot overwrite Trash-owned chunks;
- restoring Trash itself removes only chunks no longer needed by active notebooks.

This behavior is now a release-soak regression test.

## Release-candidate boundary

After Phase 13, changes intended for a release candidate should be limited to verified defect fixes, compatibility corrections, documentation, and release metadata. New product features should wait until the next post-release implementation cycle.
