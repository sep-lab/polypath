# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project (exposed credentials, misconfigured protocols, server access issues), please report it **privately**.

### How to Report

1. **DO NOT** open a public GitHub issue
2. Use GitHub's **private vulnerability reporting**: on this repository go to the **Security** tab → **Report a vulnerability**. This opens a private advisory visible only to the maintainers.
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Time

This is a small, best-effort project — there is no staffed on-call. Expect an acknowledgement within a few days, and please allow reasonable time for a fix before any public disclosure. Critical reports (credential exposure, server compromise) are prioritised.

## Scope

| In Scope | Out of Scope |
|---|---|
| Server configurations & credentials | General VPN protocol research |
| Worker.js account system (UUIDs, tiers) | Upstream dependency vulnerabilities |
| Deploy scripts with hardcoded values | Cloudflare platform issues |
| DNS/CDN misconfigurations | Client app (Hiddify) bugs |
| SSH access & key management | |

## Security Practices

- All secrets stored in `vars.env` (gitignored, never committed)
- UUIDs and credentials shared only via Signal/encrypted channel
- Server SSH access via ed25519 keys only (no password auth)
- Regular credential rotation via `tools/uuid-rotate.sh`
- CF API tokens scoped to minimum required permissions
