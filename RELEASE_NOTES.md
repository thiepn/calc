# Calc v1.0.1

Calc v1.0.1 is a bug-fix and resilience release on top of the v1.0.0 production baseline.

## Fixed

- Dynamic custom-tool metadata and CSV column names are rendered as text rather than executable HTML.
- Malformed Tool deep links no longer crash initialization.
- Tool search remains focused through continuous typing and keeps its layout.
- Notebook title edits are recovery-safe before blur; reference copying handles unavailable clipboard APIs safely.
- Unsafe imported notebook block IDs are rejected, and notebook import size is bounded.
- Rapid notebook edits advance optimistic persistence revisions.
- Notebook read failures do not fabricate replacement/recovery copies.
- Remote notebook updates preserve local dirty edits as visible, persisted conflict copies.
- Backup and controlled update flows abort rather than proceeding with unsaved notebook/settings state.
- localStorage denial is non-fatal; Settings read/write degradation does not overwrite unknown persisted state.
- Corrupt persisted Custom Tools are quarantined without breaking startup.
- Custom-tool aliases remain correct through dynamic registration/removal.
- Custom-tool lifecycle changes are persistence-first, failed writes leave runtime state intact, revision conflicts reconcile to the newer persisted original, and local edits become Draft conflict copies.
- Cross-tab Custom Tool archive/update events rebuild the runtime from persisted truth, safely defer while the builder is open, refresh the editor on close, and retain last-known-good state if refresh fails.
- History save/clear failures are reported truthfully and do not create a false deleted state.
- Phone-sized Worksheet layouts retain notebook switching, import/export, delete, and version-management controls.

## Certification

v1.0.1 is certified by the complete deterministic mathematics/product suite plus the expanded runtime bug sweep and production soak on Chromium, Firefox, WebKit, and mobile Chromium. The browser suite includes degraded-storage startup, navigation, malformed routes, rendering safety, registry-wide tool execution, Data workflows, notebook and Custom Tool conflicts, backup safety, IndexedDB migration, large-data persistence, corruption recovery, and offline PWA operation.

GitHub Pages deploys only the exact certified SHA. The production release workflow verifies the live version, generates SHA-256 release artifacts, and creates v1.0.1 only for that deployed commit.
