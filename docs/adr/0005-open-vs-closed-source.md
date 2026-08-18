# ADR-0005: Open vs Closed Source Strategy

## Status

Accepted

## Date

2026-02-15

## Context

We need to decide what parts of the project to open-source. Considerations:

- Open source builds trust (users can verify no backdoors)
- Open source enables community contributions
- Open source exposes implementation details to censors
- A custom app could be cloned by competitors or adversaries

## Decision

**Hybrid approach**:

- **Open source**: Server specs, deployment scripts, architecture docs, worker.js
- **Closed source**: Future custom app (if/when built)

## Rationale

### Open Source (server side)

- Server configs are not secret — protocols (VLESS, Hy2, etc.) are well-known
- Censors already know these protocols exist; our configs don't give them new info
- Open specs enable community contributions (especially DPI testing from Iran)
- GitHub repo acts as documentation and knowledge base

### Closed Source (app side, future)

- A custom app with DPI detection logic is proprietary intelligence
- Competitors could clone the app and brand it
- DPI evasion strategies in the app could be studied by censors if exposed
- Revenue model depends on app distribution control

## Consequences

- **Positive**: Community trust through transparent server infrastructure
- **Positive**: Contributors can improve server configs and docs
- **Negative**: Must be careful not to include secrets in open repos
- **Negative**: App development loses community contribution benefits

## Reconsideration

If we make the repo public (for branch protection), all server specs become visible.
This is acceptable because:

1. No secrets in the repo — issue #8 is **resolved** (v4.1.0 externalized all 21 secrets via `buildConfig(env)`)
2. Protocol implementations are already open-source upstream
3. The value is in the infrastructure, not the configs
4. Git history scrub required before going public (see docs/ops/operations.md)

## Related

- Issue #2: Branch protection requires public repo or GitHub Pro
- Issue #8: ~~Move secrets out of worker.js~~ **Done** (v4.1.0)
- strategy-roadmap.md — Decision Log
