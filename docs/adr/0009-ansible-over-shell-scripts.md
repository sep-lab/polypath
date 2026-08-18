# ADR 0009 — Ansible Replaces Shell Deploy Scripts

**Status:** Accepted
**Date:** 2026-03-26

## Context

The repository accumulated 20+ shell scripts in `tools/deploy/` for
deploying individual protocols. Each script was imperative and not
idempotent — running one twice could break things. There was no single
command to bring a server to the desired state. The "desired state" was
tribal knowledge of which scripts had been run.

## Decision

Replace all deploy scripts with Ansible playbooks in `infra/ansible/`:

- **`infra/ansible/roles/`** — idempotent roles: base, haproxy, singbox,
  xray, shadowtls, naiveproxy, cloak, finalmask, amneziawg, warp, backup
- **`infra/ansible/playbooks/site.yml`** — full server setup (single command)
- **`infra/ansible/playbooks/protocols.yml`** — protocol-only update
- **`infra/ansible/playbooks/upgrade.yml`** — pull latest Docker images

Protocol flags (e.g., `has_naiveproxy`, `has_cloak`) are per-server
in `infra/ansible/inventory/group_vars/<server>.yml`.

The old scripts are deprecated (header added) but not deleted until
Ansible playbooks are validated against all 4 servers.

## Consequences

- **Server state is always derivable from the repo.** Running `site.yml`
  twice produces 0 changes (idempotent by design).
- **New server setup = one command:** `ansible-playbook site.yml`
- **CI lints playbooks** via `ansible-lint` on every PR.
- **GitHub Actions deploys** via `deploy-ansible.yml` with manual approval
  gate (`environment: production`).
- **Old scripts preserved** until Ansible validation is complete.
