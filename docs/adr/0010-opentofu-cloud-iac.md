# ADR 0010 — OpenTofu for Cloud Infrastructure

**Status:** Accepted
**Date:** 2026-03-26

## Context

All four VPN servers (Helsinki/Hetzner, Madrid/Oracle, Dammam/GCP,
London/Scaleway) were provisioned manually via cloud consoles. DNS records
in Cloudflare were created manually. There was no record of what firewall
rules existed or why. Recreating a server from scratch required reading
multiple wiki pages and tribal knowledge.

## Decision

Declare all cloud resources in OpenTofu (Terraform-compatible) in
`infra/terraform/`:

- **Modules** per provider: `hetzner-server`, `oracle-instance`,
  `gcp-instance`, `scaleway-instance`, `cloudflare-dns`, `cloudflare-pages`
- **State** stored in Cloudflare R2 (`vpn-tofu-state` bucket)
- **Environment**: `infra/terraform/environments/production/`

**CRITICAL:** Existing resources must be **imported** before any apply.
Never create existing infrastructure from scratch with `tofu apply`.

`scripts/generate-terraform-vars.js` writes `terraform.tfvars` from
config files and secrets (gitignored).

## Consequences

- **Servers are cattle, not pets.** Replacing a server = Terraform + Ansible.
- **Drift is detectable.** `tofu plan` shows any manual changes made outside IaC.
- **State in R2** — no S3 costs, stays within Cloudflare ecosystem.
- **Requires import step** for existing resources before first apply.
- **CI runs `tofu plan`** on PRs touching `infra/terraform/**` or `config/**`.
