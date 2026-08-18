# ADR 0007 — Config as Data: Extract Static Config to YAML

**Status:** Accepted
**Date:** 2026-03-26

## Context

The worker had grown to 2700+ lines with data and logic mixed together.
Constants like CF_CLEAN_IPS, WHITELISTED_HOSTS, ISP DNS resolvers, and
fragment settings were hardcoded in TypeScript. Changing a Cloudflare IP
required editing TypeScript source, rebuilding, and redeploying.

## Decision

Extract all static configuration to `config/*.yaml` files:

- `config/cdn.yaml` — CF clean IPs, whitelisted hosts, SNIs
- `config/isp-tuning.yaml` — fragment settings, MUX, ASN mappings, DNS resolvers
- `config/servers.yaml` — server topology (non-secret)
- `config/protocols.yaml` — protocol definitions and flags

Generate TypeScript constants at build time via `scripts/build-config.js`,
outputting `tools/smart-sub/src/generated-constants.ts`. The `constants.ts`
module now contains only a single re-export line.

JSON schemas in `config/schemas/` validate all YAML files on every CI run.

## Consequences

- **Single source of truth.** Config changes are in YAML, not TypeScript.
- **`docs:generate` derives documentation** from config files automatically.
- **Config changes require `npm run build`** — `build:config` runs automatically
  as the first step of `npm run build`.
- **CI validates schemas** on every PR via `npm run validate:config`.
- **`CF_CLEAN_IPS` matches `cf_clean_ips` in `config/cdn.yaml`** exactly.
