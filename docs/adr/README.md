# Architecture Decision Records (ADRs)

We use ADRs to document significant architectural decisions. Each ADR follows the [MADR format](https://adr.github.io/madr/).

## Index

| # | Decision | Status | Date |
|---|----------|--------|------|
| [0001](0001-cloudflare-pages-over-workers.md) | CF Pages over Workers for smart-sub | Accepted | 2026-01-15 |
| [0002](0002-flutter-libbox-for-custom-app.md) | Flutter + libbox for custom app | Proposed | 2026-03-09 |
| [0003](0003-multi-cdn-strategy.md) | Multi-CDN strategy to eliminate CF SPOF | Proposed | 2026-03-09 |
| [0004](0004-protocol-priority-order.md) | Protocol priority order for Iran | Accepted | 2026-02-01 |
| [0005](0005-open-vs-closed-source.md) | Open vs closed source strategy | Accepted | 2026-02-15 |
| [0006](0006-sops-age-secrets-management.md) | sops + age for secrets management | Accepted | 2026-03-26 |

## Creating a New ADR

1. Copy an existing ADR as a template
2. Use the next sequential number: `NNNN-short-title.md`
3. Set status to `Proposed`
4. Fill in Context, Decision, Rationale, Consequences
5. Open a PR with the ADR for team review
6. Update status to `Accepted` when merged

## Statuses

- **Proposed**: Under discussion, not yet decided
- **Accepted**: Decision made and in effect
- **Deprecated**: No longer applies (superseded by another ADR)
- **Superseded**: Replaced by a newer ADR (link to replacement)
