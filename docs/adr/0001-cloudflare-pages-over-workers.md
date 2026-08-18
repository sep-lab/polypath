# ADR-0001: Cloudflare Pages over Workers for Smart-Sub

## Status

Accepted

## Date

2026-01-15

## Context

We need a serverless platform to host the smart-subscription worker that generates VPN configs. Options considered:

- Cloudflare Workers (workers.dev subdomain)
- Cloudflare Pages (custom domain via CNAME)
- Self-hosted on VPN server
- Deno Deploy / Vercel Edge

## Decision

Use **Cloudflare Pages** with custom domain (`sub.example.com`) instead of Workers.

## Rationale

- Workers.dev subdomain is **blocked in Iran** — returning error 1101
- Pages allows custom domain via CNAME, which routes through CF's CDN normally
- Pages custom domain works from Iran even when workers.dev is blocked
- Same worker.js code runs on both; only the deployment target differs

## Consequences

- **Positive**: Production accessible from Iran via custom domain
- **Positive**: Free tier sufficient for our scale
- **Negative**: If CF abuse-flags the Pages project (which has happened — error 8000119), we lose deployment ability
- **Negative**: Cannot use Workers-specific features like Durable Objects
- **Mitigation**: Keep self-hosted backup ready (see ADR-0003)

## Related

- Issue #1: CF Pages & Workers deployment blocked
- Issue #3: Eliminate Cloudflare SPOF
