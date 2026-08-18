# polypath

**A reproducible, multi-layered anti-censorship VPN stack — infrastructure, config generation, and the research behind it.**

[![CI](https://github.com/sep-lab/polypath/actions/workflows/ci.yml/badge.svg)](https://github.com/sep-lab/polypath/actions/workflows/ci.yml)
[![Tests](https://github.com/sep-lab/polypath/actions/workflows/test.yml/badge.svg)](https://github.com/sep-lab/polypath/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[See it in 30 seconds](#see-it-in-30-seconds) · [How it works](#how-it-works) · [Deploy your own](#deploy-your-own) · [Threat model](./docs/threat-model.md) · [Contributing](./CONTRIBUTING.md)

---

## The problem

A censor does not need to break your encryption. They need to recognise your
connection — from its opening handshake, its destination IP, or the fact that it
looks like nothing they allow — and drop it. Every individual circumvention
protocol eventually gets recognised.

So the useful unit is not a protocol. It is a **fleet of independent paths** plus
the machinery to keep generating fresh client configs as paths die.

That machinery is what this repo is. It runs four servers across four providers,
provisions them from code, and serves a subscription endpoint that generates
per-user configs across every surviving transport — filtered by where the user is
and which network they are on.

## See it in 30 seconds

No VPS, no domain, no Cloudflare account, no credentials from anyone:

```bash
git clone https://github.com/sep-lab/polypath && cd polypath
npm ci && npm run demo
```

That builds the worker, runs it against a committed fixture of **fictional**
servers ([RFC 5737](https://datatracker.ietf.org/doc/html/rfc5737) documentation
IPs, which route nowhere), and prints the configs it generates:

```text
  169 configs generated

    153  vless
      8  hy2
      4  sing-box (AnyTLS/ShadowTLS)
      3  naive+https
      1  ss

  Geo-aware filtering
   default          169 configs
   CF-IPCountry: IR 153 configs  (CDN-only + TLS fragment + ISP tuning)
```

`npm test` runs 307 tests, also with no network access.

## How it works

Three layers, deliberately decoupled:

| Layer | What it does | Where |
|---|---|---|
| **Infrastructure** | Provisions servers, bakes images, configures every protocol | `infra/` — OpenTofu, Packer, Ansible |
| **Config as data** | Server topology, CDN addresses, per-ISP tuning — schema-validated YAML, no secrets | `config/` |
| **Config generation** | A Cloudflare Pages worker that turns that data into per-user subscription URIs | `tools/smart-sub/` |

Secrets never enter the first two layers. `config/servers.yaml` stores the *name*
of the environment variable holding each credential (`ip_env`, `pass_env`,
`short_id_env`), never the value — and the JSON schema rejects a raw value, so
that property is enforced in CI rather than by convention.

The generator is geo- and ISP-aware: a request from a censored network gets a
filtered, reordered set with TLS fragmentation and MUX padding applied, while an
uncensored request gets the full list including direct connections.

## Deploy your own

**[docs/guides/quickstart.md](./docs/guides/quickstart.md)** walks through it end
to end with one VPS and one domain. Nothing in it requires access to this
project's infrastructure.

Short version: provision a server → set `DOMAIN` and your server IP → generate
your own keys → `ansible-playbook site.yml` → deploy the worker → point a client
at your subscription URL.

## Read this before you rely on it

**[docs/threat-model.md](./docs/threat-model.md)** — what this defends against,
and just as importantly what it does not. Summary of the "does not": endpoint
compromise, traffic correlation by a global observer, legal risk to whoever
operates or hosts a server, and metadata visible to relay operators. There is
also a real revocation gap documented there.

If you are in a jurisdiction where running or using this carries legal risk,
that risk is yours and this repo cannot reduce it. Read the threat model first.

## Repo map

```text
config/          Server topology, CDN data, per-ISP tuning (+ JSON schemas)
infra/
  ansible/       Roles per protocol; site.yml provisions a full server
  terraform/     Cloud resources across Hetzner / Oracle / GCP / Scaleway
  packer/        Immutable base images
tools/
  smart-sub/     The subscription worker (TypeScript -> bundled worker.js)
  backup-sub/    Same core, deployed to a second provider
  deploy/        Per-protocol deploy scripts (predate the Ansible roles)
docs/
  threat-model.md    Adversary, defences, and limits
  guides/            Quickstart, server setup, client setup
  adr/               11 architecture decision records
  research/          DPI bypass research notes
scripts/         Config build, validation, doc generation, the demo
tests/           307 tests — unit, integration, contract, config
```

`tools/smart-sub/worker.js` and `tools/backup-sub/core-worker.js` are **generated**.
Edit `tools/smart-sub/src/`, then `npm run build`.

## Project status — honestly

This is a working system that four people's traffic depends on, not a research
prototype. It is also not a product, and some of what it documents is ahead of
what it deploys:

- Several protocols described in older docs are **implemented but not deployed**,
  or were deployed and removed after being detected. `config/servers.yaml` is the
  source of truth for what is actually live.
- The research notes in `docs/research/` mix measured results with reports from
  others. They are being labelled for provenance.

Documented negative results — which protocols stopped working, and how they were
detected — are kept on purpose. In this field the failures are more useful than
the successes, and most projects delete them.

## Contributing

See **[CONTRIBUTING.md](./CONTRIBUTING.md)**. The 30-second demo above is the whole
setup — no server access, no credentials, no coordination with a maintainer.

Good places to start are labelled [`good first issue`](https://github.com/sep-lab/polypath/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
and [`help wanted`](https://github.com/sep-lab/polypath/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
The most valuable contribution is usually a **measurement**: which transport
survives on which network, with the method you used.

### Contributing infrastructure

If you want to add capacity, run this playbook on **your own** server and peer it.
Do not send anyone SSH access to a machine, and do not register infrastructure in
someone else's name — whoever the account belongs to carries the legal exposure.

## Documentation

| Doc | Purpose |
|---|---|
| [Threat model](./docs/threat-model.md) | Adversary, defences, and explicit limits |
| [Quickstart](./docs/guides/quickstart.md) | Deploy your own, start to finish |
| [Architecture](./architecture.md) | Full system design, layers, data flow |
| [Roadmap](./docs/roadmap.md) | What is planned, and what was ruled out |
| [ADRs](./docs/adr/) | 11 decision records with trade-offs |
| [API reference](./docs/api.md) | Subscription worker endpoints |
| [Client setup](./docs/guides/client-setup.md) | Configuring client apps |
| [Operations](./docs/ops/operations.md) | Maintenance, backup, troubleshooting |
| [Security policy](./SECURITY.md) | Reporting a vulnerability |
| [Changelog](./CHANGELOG.md) | Version history |

## License

MIT — see [LICENSE](./LICENSE).
