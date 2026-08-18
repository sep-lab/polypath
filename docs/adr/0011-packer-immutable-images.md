# ADR 0011 — Packer Immutable Server Images

**Status:** Accepted
**Date:** 2026-03-26

## Context

Bootstrapping a fresh server with Ansible took 20+ minutes: installing
Docker, configuring UFW, installing HAProxy, setting up fail2ban, etc.
Each new server required a full Ansible run before any VPN service started.
This was slow and increased the blast radius of configuration errors.

## Decision

Use Packer to bake base images that include:

- Docker CE
- UFW (configured with all required rules)
- HAProxy
- fail2ban
- unattended-upgrades

Packer definitions in `infra/packer/`:

- `ubuntu-base.pkr.hcl` — shared Ansible provisioner config
- `hetzner.pkr.hcl` — Hetzner snapshot builder
- `gcp.pkr.hcl` — GCP machine image builder
- `scaleway.pkr.hcl` — Scaleway image builder

**VPN services (sing-box, xray) are NOT baked** into the image — they
require runtime secrets (UUIDs, passwords, keys) and are configured
post-launch by `ansible-playbook protocols.yml`.

Terraform modules accept a `baked_image_id` variable. When a new image
is baked, update this variable and `tofu apply` replaces the server.

## Consequences

- **New server launch time reduced significantly** — base software is
  already installed in the image.
- **Replacing a server = Packer + Terraform + `protocols.yml`.**
- **CI validates Packer HCL** via `packer validate` on every PR.
- **Images are provider-specific** — one build per cloud provider.
- See `docs/ops/server-replacement.md` for the full replacement procedure.
