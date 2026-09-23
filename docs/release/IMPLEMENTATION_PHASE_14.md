# Implementation Phase 14 — Final RC Freeze & Production Release

Phase 14 turns the certified Phase 13 candidate into the immutable Calc v1.0.0 production baseline.

## Strict scope

No product feature expansion is permitted in this phase.

Allowed changes are limited to:

- verified release-blocking defect fixes;
- version and production metadata;
- release notes and changelog;
- certification tests;
- clean-install and upgrade/backup compatibility tests;
- deployment/release automation;
- documentation required to ship v1.0.0.

## Production version contract

All release-facing version sources must agree:

```text
VERSION                    1.0.0
package.json               1.0.0
release.json               1.0.0 / v1.0.0 / stable / production
app.js                     APP_VERSION = 1.0.0
persistence.js             stable persistence runtime, no RC suffix
sw.js                      calc-shell-v1.0.0
manifest.webmanifest       version = 1.0.0
backup metadata            appVersion = 1.0.0
```

CI fails if any of these drift.

## Final release certification

The Phase 13 production soak remains mandatory. Phase 14 adds release-only gates for:

- a genuinely clean browser profile;
- production version metadata;
- a pre-upgrade v4 backup restored into v1.0.0;
- post-upgrade backup verification;
- update-preflight health;
- production service-worker version handshake;
- absence of RC/phase placeholders in runtime metadata;
- release workflow integrity;
- generated SHA-256 checksums for the shipped runtime files.

## Clean-device baseline

A fresh browser context must initialize Calc without pre-existing IndexedDB/localStorage state, create schema v5, expose app version 1.0.0, remain mathematically functional, and pass persistence update preflight.

## Backup-before-upgrade compatibility

The release suite constructs a valid backup representing data created on DB v4 before upgrade. Calc v1.0.0 must validate it, restore it into DB v5, preserve the user data, and produce a valid post-restore v1.0.0 backup.

This is independent from the direct IndexedDB v4 → v5 migration test.

## Production release chain

```text
push final candidate
→ Calc CI
→ Calc Release Soak
   → deterministic certification
   → production release gate
   → Chromium
   → Firefox
   → WebKit
   → mobile Chromium
   → RC certification
→ Deploy Calc to GitHub Pages
   → checkout exact certified SHA
   → deploy
→ Calc Production Release
   → checkout exact deployed SHA
   → verify release metadata
   → verify live Pages version
   → generate SHA-256 release checksums
   → create v1.0.0 tag and GitHub Release
```

The release workflow is idempotent: if v1.0.0 already exists, it must point to the same certified SHA or the workflow fails.

## v1.0.0 production baseline

After the v1.0.0 tag is created, this commit becomes the maintenance baseline. Future feature development should move to a later version. Changes to the v1.0.0 line should be narrowly scoped defect/security fixes with their own certification.
