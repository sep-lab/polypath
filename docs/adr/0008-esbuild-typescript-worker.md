# ADR 0008 — esbuild + TypeScript for Worker Bundling

**Status:** Accepted
**Date:** 2026-03-26

## Context

The worker was hand-written JavaScript with no type safety. The
backup-sub worker (`tools/backup-sub/core-worker.js`) was manually
synced from the main worker, leading to drift and bugs. Changes had
to be made twice.

## Decision

Migrate to TypeScript source in `tools/smart-sub/src/`:

- `generators.ts` — URI generator functions
- `constants.ts` — re-exports from `generated-constants.ts`
- `config.ts` — runtime config builder from env vars
- `index.ts` — Cloudflare Worker entry point

Use esbuild to bundle the TypeScript source to:

- `tools/smart-sub/worker.js` — production Cloudflare Worker
- `tools/backup-sub/core-worker.js` — backup sub (auto-copied by build)

`npm run build` runs `build:config` (generates constants from YAML)
then esbuild (bundles TypeScript) in a single command.

## Consequences

- **Type safety** catches errors at build time, not at runtime in Iran.
- **Auto-sync of backup-sub** — no manual copy step.
- **No manual worker.js editing** — the generated file has a banner warning.
- **esbuild is fast** — full rebuild takes < 10ms.
- **`tsc --noEmit`** runs in CI for type checking without emitting files.
