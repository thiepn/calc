# Persistence, Backup, PWA & Cross-Device Semantics

This document defines the certified application-wide persistence behavior introduced in Implementation Phase 11.

## Governing principles

Calc remains local-first. Core mathematics, notebooks, custom tools, history, and settings remain usable without an account, cloud service, network connection, or remote sync provider.

Cross-device architecture is present as a provider-neutral boundary, but remote synchronization is disabled by default.

## Persistence architecture

Persistence lives in persistence.js.

Primary services:
- CalcDatabase
- Repository
- versioned repository writes
- backup builder and validator
- encrypted backup codec
- restore planner and atomic executor
- integrity checker
- recovery journal
- storage estimator
- tombstone helpers
- cross-tab coordinator
- sync adapter and sync manager

The UI no longer owns IndexedDB schema creation/versioning directly.

## Database

Database: calc-db
Current version: 4

Stores:
- history
- worksheets
- settings
- customTools
- meta
- journal
- tombstones

## Explicit migrations

v0 to v1 creates history, worksheets, and settings.
v1 to v2 creates customTools.
v2 to v3 creates meta and journal.
v3 to v4 creates tombstones.

Migration metadata is written to meta when available. Backups created by a database version newer than the running Calc version are rejected.

## Repository boundary

Repositories provide all, get, put, putVersioned, delete, clear, and count.

Compatibility helper functions remain in app.js so older workspace code can migrate incrementally without owning IndexedDB internals.

## Optimistic revision writes

Versioned mutable entities currently protected:
- notebooks
- custom tools

The repository reads the current persisted revision inside the same read-write transaction. A stale caller receives REVISION_CONFLICT instead of overwriting a newer entity.

When conflicts occur, Calc preserves the local edited version under a new conflict-copy ID while the newer persisted entity remains intact. Custom-tool conflict copies return to Draft.

## Cross-tab coordination

Calc uses BroadcastChannel when supported. Messages contain sender, entity type, entity ID, revision, action, and time.

Settings can propagate between tabs. Notebook/custom-tool updates refresh local in-memory state. If a conflicting tab has unsaved edits, those edits are preserved as conflict copies rather than silently overwritten.

Remote custom-tool deletion uninstalls its dynamic ToolDefinition. Saving local editor content for a remotely deleted tool creates a new Draft conflict copy instead of resurrecting the deleted ID.

## Tombstones

Database v4 adds tombstones.

A tombstone records:
- source entity store/type
- entity ID
- deletion revision
- deletion timestamp
- device ID where available

Notebook/custom-tool deletion is atomic with tombstone creation.

This allows future sync providers to distinguish an entity that has never been received from one that was explicitly deleted.

## Backup schema

Plain backup schema: calc.backup/v1

Full backups contain:
- history
- notebooks
- settings
- custom tools
- tombstones

Meta and journal internals are not treated as portable user data.

The manifest stores database/app metadata, store counts, per-store integrity hashes, whole-payload hash, and creation time.

## Integrity hashing

Backup hashing uses deterministic key ordering. SHA-256 is used when Web Crypto is available. Restricted test environments may use a clearly marked deterministic non-cryptographic fallback for reproducibility only.

## Encrypted backups

Encrypted schema: calc.backup.encrypted/v1

Encryption uses Web Crypto:
- PBKDF2
- SHA-256
- random 128-bit salt
- default 250000 iterations
- AES-GCM 256-bit key
- random 96-bit IV

Passwords are never stored in the backup. Decryption happens before ordinary backup integrity validation.

If Web Crypto is unavailable, encrypted backup is unavailable rather than falling back to weak encryption.

## Backup sharing

When Web Share supports files, Calc can share the generated plaintext or encrypted backup file. No Calc server is involved.

## Backup compatibility

Future database-version backups are rejected. Older backups missing newer optional stores are normalized compatibly; for example, a pre-v4 backup has an empty tombstone set.

## Restore staging

Restore sequence:
1. parse/decrypt backup
2. schema validation
3. store-structure validation
4. hash verification
5. restore mode selection
6. selected-store planning
7. Notebook/Custom Tool validation for selected domains
8. stale-plan fingerprint check
9. atomic commit
10. reload

No persistent user data changes during preview/planning.

## Restore modes

Merge combines backup and local data.
Replace replaces only the selected local domains.

Unselected domains remain untouched.

## Selective restore

Users can independently restore:
- History
- Notebooks
- Settings
- Custom Tools
- Deletion metadata/tombstones

At least one domain must be selected.

Domain-specific Notebook/Custom Tool validation is applied only when that domain is selected.

## Merge conflicts

Supported policies:
- newer revision
- incoming backup
- conflict copy

Conflict copies receive a new ID/key and conflict label where applicable.

## Restore staleness

Restore preview fingerprints the selected local stores.

Before Apply, Calc re-hashes those stores. If another tab changed selected data after preview, Calc returns RESTORE_STALE_PLAN and requires a new preview.

## Atomic restore

Selected user-data stores, the committed restore journal entry, and lastRestore metadata are written in one IndexedDB transaction.

If any write fails, the transaction aborts and selected data is not partially replaced. A failed journal record is written afterward where possible.

## Recovery journal

Restore journal states:
- started
- committed
- failed

The Settings workspace reports incomplete/failed restore operations. Old journal entries are cleanup-eligible after retention.

## Session crash recovery

While a notebook has unsaved local edits, Calc stores a sessionStorage recovery snapshot.

On startup:
- if persisted data is at least as new, the snapshot is discarded
- if the session snapshot is newer, Calc restores it as a separate recovery copy
- the original persisted notebook ID is not overwritten

## Storage quota

Calc uses navigator.storage.estimate where available and reports usage, quota, percentage, and persistence status.

Calc can request persistent storage through navigator.storage.persist.

Quota errors are surfaced as storage guidance rather than generic calculator errors.

## Integrity checker

The checker validates each portable store for stable keys, duplicates, record shape, and deterministic hash.

It reports database version, record counts, hashes, and issues. The operation is read-only.

## PWA update lifecycle

Service-worker updates no longer force activation over an active session.

Sequence:
1. new worker downloads and installs
2. worker waits
3. Calc shows Update ready
4. user chooses Restart & update
5. pending app data is flushed
6. Calc sends SKIP_WAITING
7. worker activates
8. old Calc shell caches are removed
9. clients are claimed
10. controllerchange reloads the app

Supported messages include SKIP_WAITING and GET_VERSION. Activation broadcasts SW_ACTIVATED with the shell version.

## Offline shell

The local-first shell pre-caches canonical runtime modules including persistence.js, notebook.js, custom-tools.js, tools.js, graph/statistics/calculus workers, math/algebra/units/linear-algebra, app UI, manifest, icon, styles, and index.

Navigation has an offline shell fallback.

## Provider-neutral sync architecture

Sync schema: calc.sync/v1

Architecture includes:
- SyncAdapter
- DisabledSyncAdapter
- SyncManager
- stable device ID
- backup-compatible transfer boundary
- deletion tombstones

Sync is disabled by default. No provider credentials, API calls, server endpoint, or remote data store are configured in Phase 11.

## Cross-device transfer in Phase 11

Supported transfer:
- download backup
- optionally encrypt
- optionally share through Web Share
- restore on another device

No Calc account is required.

## Deliberate limitations

Not certified in Phase 11:
- active cloud synchronization
- user accounts
- background remote sync while closed
- collaborative/CRDT editing
- cross-device push notifications
- cloud E2E key management
- remote device revocation
- record-level restore inside one selected domain
- automatic backup password recovery
- streaming backups beyond the in-memory backup limit
