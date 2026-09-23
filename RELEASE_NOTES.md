# Calc v1.0.0

Calc v1.0.0 is the first production baseline of the local-first universal calculator and mathematical workstation.

## Included

The release includes the complete calculator stack built through Implementation Phases 1–13: exact arithmetic, symbolic algebra, calculus and numerical methods, quantities and units, linear algebra, statistics and data tools, Graph V2, specialized calculators, Custom Formula Builder, typed notebooks, and the versioned local-first persistence/backup system.

## Data safety

Calc v1.0.0 uses IndexedDB schema v5. Large notebook payloads are chunked and incrementally persisted. Backups support integrity verification, optional password encryption, selective atomic restore, and compatibility with older supported database backups. Deleted recoverable content is retained in Trash for 30 days.

Updates are controlled: pending persistence is flushed and an integrity/update preflight must pass before a waiting service worker is activated.

## Certification

The exact release commit must pass:

- the cumulative deterministic mathematics and product test suite;
- the production release static gate;
- realistic v4 → v5 upgrade and backup/restore tests;
- multi-megabyte persistence and corruption/fault tests;
- Chromium, Firefox, WebKit, and mobile Chromium browser soak;
- offline PWA reload checks;
- gated GitHub Pages deployment.

The GitHub release is created only after the certified commit is successfully deployed.
