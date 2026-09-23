# Calc v1.0.1

Calc v1.0.1 is a bug-fix and resilience release on top of the v1.0.0 production baseline.

## Fixed

- Dynamic custom-tool metadata and CSV column names are rendered as text rather than executable HTML.
- Malformed Tool deep links no longer crash application initialization.
- Tool search remains focused through continuous typing.
- Notebook title edits are recovery-safe before blur, and reference copying handles clipboard denial safely.
- Calc no longer treats localStorage availability as a startup requirement.
- Unsafe imported notebook block IDs are rejected before reaching DOM selector paths, and notebook import size is bounded.
- A corrupt persisted Custom Tool is quarantined without preventing the rest of Calc from starting.
- Custom-tool alias registration/unregistration no longer damages existing alias resolution.
- The Tools list layout remains stable after search rendering was made focus-preserving.

## Certification

The release is certified by the cumulative deterministic suites plus the cross-browser production soak and runtime bug sweep on Chromium, Firefox, WebKit, and mobile Chromium. GitHub Pages deploys only the exact certified SHA, and the production release workflow verifies the live version before creating the tag.
