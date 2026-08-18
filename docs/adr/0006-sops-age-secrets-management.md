# ADR-0006: sops + age for Secrets Management

## Status

Accepted

## Date

2026-03-26

## Context

The project manages secrets for 4 VPN servers (UUIDs, private keys, passwords, API tokens) and Cloudflare credentials. Previously, secrets were either:

- Hardcoded in `worker.js` (security risk, tracked in git history)
- Stored in `vars.env` (gitignored, but no encryption at rest, no sharing mechanism)

Requirements:

- Secrets must be encrypted at rest and safe to commit to git
- No external service dependency (no Vault, no cloud KMS)
- Team members must be able to decrypt with a single key
- Must integrate with existing shell-based deploy scripts
- Must support CI/CD (GitHub Actions) without storing plaintext

## Decision

Use **sops** (v3.12+) with **age** encryption for all secret files.

- Encrypted files: `tools/deploy/vars.env` (sops-encrypted, committed to git)
- `.sops.yaml` at repo root defines encryption rules and age recipients
- age public key: configured in `.sops.yaml` for all `*.env` files
- Decryption in CI via `SOPS_AGE_KEY` GitHub Actions secret

## Rationale

### Why sops + age (over alternatives)

| Alternative | Why not |
|---|---|
| HashiCorp Vault | External service, complex setup, overkill for 4 servers |
| AWS KMS / GCP KMS | Cloud vendor lock-in, requires IAM setup |
| git-crypt | Less flexible (full-file only), no partial encryption |
| GPG | Complex key management, key distribution is painful |
| Plain env vars | No encryption at rest, no audit trail |

### Why age (over GPG)

- Single binary, no keyring management
- Simple key format (one line)
- No expiry, no subkeys, no trust model overhead
- Modern cryptography (X25519 + ChaCha20-Poly1305)

### Why sops

- Encrypts values but keeps keys/structure visible (easy diff review)
- Supports age, GPG, and cloud KMS (future flexibility)
- `sops exec-env` integrates cleanly with shell deploy scripts
- Well-maintained Mozilla project with active community

## Implementation

1. `.sops.yaml` at repo root defines age recipients and file patterns
2. `tools/deploy/vars.env` is sops-encrypted (committed)
3. `tools/deploy/vars.env.example` remains plaintext (template)
4. Deploy scripts use `sops exec-env vars.env 'bash deploy-foo.sh'`
5. CI decrypts via `SOPS_AGE_KEY` secret in GitHub Actions environment
6. Pre-commit hook prevents committing unencrypted `*.env` files

## Consequences

- **Positive**: Secrets are encrypted at rest and safe in git history
- **Positive**: No external service dependency — works offline
- **Positive**: Simple onboarding — share one age secret key with new team members
- **Positive**: Auditable — git log shows who changed which secrets and when
- **Negative**: Requires sops + age installed locally (documented in docs/ops/checklist.md)
- **Negative**: Single age key means any team member can decrypt all secrets (acceptable for small team)
- **Negative**: Key rotation requires re-encrypting all files (rare operation)

## Related

- Phase 5 of project modernization (commit 1144dcc)
- `docs/ops/checklist.md` — Phase 2 installs sops + age
- `.sops.yaml` — encryption configuration
- `SECURITY.md` — references sops+age setup
