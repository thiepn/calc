# Implementation Phase 11 — Persistence, Backup, PWA & Cross-Device Architecture

Status: implemented

## Delivered

### Persistence subsystem

Added persistence.js with:
- CalcDatabase and Repository
- database migrations
- optimistic writes
- integrity hashing
- full backup
- encrypted backup
- selective restore
- atomic restore
- recovery journal
- quota/storage helpers
- tombstones
- BroadcastChannel coordination
- provider-neutral sync manager

### Database schema

Calc DB is now version 4.

Migrations:
- v1 core stores
- v2 custom tools
- v3 meta/journal
- v4 tombstones

app.js no longer owns IndexedDB schema creation/versioning.

### Full backups

Full backups include history, notebooks, settings, custom tools, and tombstones.

Backup manifests include counts, store hashes, payload hash, DB/app metadata, and timestamps.

### Encrypted backups

Optional password-protected .calcbackup.enc.json uses PBKDF2-SHA-256 plus AES-GCM through Web Crypto.

Wrong passwords and damaged/tampered files fail explicitly.

### Share backup

When supported, Web Share can share the generated backup file directly. There is no Calc server.

### Restore

Implemented:
- integrity-first preview
- merge
- replace
- selective domains
- newer/incoming/conflict-copy policies
- selected-domain Notebook/Custom Tool validation
- stale-plan fingerprint protection
- atomic selected-store commit
- recovery journal
- reload only after successful commit

### Optimistic concurrency

Notebook and custom-tool writes are revision checked.

Stale writes create conflict copies instead of overwriting newer persisted revisions.

### Tombstones

Notebook/custom-tool deletion records revisioned tombstones atomically.

Tombstones are included in backups and form the deletion contract for future sync.

### Cross-tab coordination

BroadcastChannel handles settings, notebooks, custom tools, history, restores, and deletions.

Unsaved conflicting local edits are preserved as copies.

### Crash recovery

sessionStorage notebook snapshots recover newer unsaved edits as separate copies after crash/reload.

### Data & Backup workspace

Added:
- full backup
- encrypted backup password
- Share Backup
- restore password
- merge/replace
- selective store picker
- conflict policy
- restore preview
- integrity check
- storage/quota status
- persistent-storage request
- recovery journal status
- update status
- sync-architecture status

### PWA updates

Updates now install and wait.

Restart & update flushes pending persistence, sends SKIP_WAITING, activates the new worker, cleans old caches, claims clients, and reloads after controller change.

### Cross-device architecture

Added stable device ID, sync schema, adapter contract, disabled adapter, sync manager, tombstones, and backup-compatible transfer boundary.

Remote synchronization remains intentionally disabled.

### Certification

Phase 11 certification covers:
- stable deterministic hashes
- migration plans through DB v4
- backup manifests
- future-version rejection
- tamper detection
- encrypted backup round trip
- wrong-password rejection
- merge/replace/selective restore
- conflict copies
- stale restore plans
- atomic restore success/failure
- recovery journal
- integrity reports
- settings merge
- optimistic revision checks
- tombstone deletion
- sync disabled/enabled adapter behavior
- cross-tab message shape
- browser integration and service-worker update invariants

## Phase boundary

Implementation Phase 12 should focus on scale and final resilience:
- chunked/streamed large backups
- incremental notebook/dataset storage
- trash/recovery UI over tombstones
- schema migration soak tests
- multi-tab stress testing
- adversarial corruption testing
- final release-hardening of restore/update flows
