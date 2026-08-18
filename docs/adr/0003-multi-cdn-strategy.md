# ADR-0003: Multi-CDN Strategy to Eliminate Cloudflare SPOF

## Status

Proposed

## Date

2026-03-09

## Context

Our entire subscription delivery and CDN-based protocol infrastructure depends on a single Cloudflare account. This account has already been abuse-flagged (Pages error 8000119, Workers error 1101). If Cloudflare fully terminates the account:

- `sub.example.com` goes down — all users lose configs
- CDN protocols (XHTTP-CDN, CDN-WS, EDtunnel) stop working
- No subscription URL delivery mechanism

## Decision

Implement a **multi-CDN fallback strategy** with self-hosted backup.

## Plan

### Phase 1: Self-Hosted Backup (Immediate)

- Deploy worker.js as Node.js service on Helsinki server
- Caddy reverse proxy for HTTPS on backup domain
- DNS failover: backup domain on non-CF registrar

### Phase 2: Alternative CDN (This Month)

- Evaluate: Gcore, Fastly, BunnyCDN, ArvanCloud
- Set up at least one CDN protocol path through non-CF CDN
- Test from Iran for accessibility

### Phase 3: Decentralized Distribution (Q2 2026)

- Telegram bot for config distribution
- IPFS/IPNS-based config hosting
- Peer-to-peer config relay

## Consequences

- **Positive**: No single point of failure for config delivery
- **Positive**: CDN protocol diversity (harder to block all CDNs at once)
- **Negative**: More infrastructure to maintain
- **Negative**: Cost increase (self-hosted backup, additional CDN)

## Related

- Issue #1: CF deployment blocked
- Issue #3: Eliminate CF SPOF
- RESEARCH-TOPICS.md — Topic 4
