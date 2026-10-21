# Repository papercuts

## Open

- [ ] `2026-10-21T17:46:42Z` — `codex` — Amplify bundled dependencies can make `npm install` write a lockfile that clean `npm ci` rejects (nested Zod/OpenTelemetry entries). Regenerate the lock in a directory without node_modules, review it, and verify a clean install before dependency-update pushes.
