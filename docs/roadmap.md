# Roadmap

What is planned, what was ruled out, and why.

Priorities are shaped by two things: what the current deployment measurably lacks,
and published research on what censors actually do. Where a claim here comes from
outside measurement rather than our own, it is marked *(reported)*.

---

## P0 — Correctness before capability

Nothing new should ship until these land. Each is small; each invalidates a claim
the docs currently make.

| # | Item | Why |
|---|---|---|
| 1 | ~~**Fix ASN detection**~~ | **Done.** `detectIranISP()` read request headers Cloudflare does not set, so it always returned `unknown` and every per-ISP feature was inert. Now reads `request.cf.asn`, with the ASN map extended to Iran's larger networks and a test guarding YAML/constants drift. |
| 2 | **Reconcile docs with reality** | Several protocols described as deployed are implemented but not provisioned, disabled, or removed after detection. `config/servers.yaml` is the source of truth; the prose needs to match it. |
| 3 | **Close the revocation gap** | Disabling a user does not revoke Shadowsocks 2022, ShadowTLS, NaiveProxy, Cloak, AmneziaWG, Finalmask or MTProto — all use fleet-wide shared secrets. See [threat model §3.1](./threat-model.md). Needs per-user keying or a documented rotation procedure. |
| 4 | ~~**Split the admin credential**~~ | **Done.** `ADMIN_TOKEN` now separates the admin API credential from the subscription UUID, all checks are constant-time, and `Authorization: Bearer` is preferred over `?key=`. |

## P1 — Where the leverage is

### Config distribution is a two-host chokepoint

Both subscription endpoints depend on resolving a specific name and presenting a
non-allowlisted SNI. Under a default-deny allowlist both fail, and the Cloudflare
account has been abuse-blocked once already.

Worth adding, roughly ascending effort: a signed encrypted blob published to a
git host; an allowlisted serverless origin; a Telegram bot distributor; DNS TXT
distribution over resolvers that stay reachable during partial shutdowns.

Related: an **offline emergency bundle**. If a client's refresh fails in the first
hour of a shutdown it currently has nothing. A signed, pre-shared bundle of
last-known-good configs is the difference between degraded and dead.

### Use the measurements we already collect

Probe reports come back from real networks and are used for exactly one boolean
(shutdown auto-detect), then discarded. Health data is read only by `/health` and
`/stats` — the subscription builder never consults it.

Scoring `(network, protocol, server)` from those reports and feeding it into
config ordering would replace the hardcoded priority tables with a learned one,
and would make the "manually update when DPI rules change" consequence in ADR-0004
go away. This is the single highest-value architectural change on the list.

### Per-user diversity

Every user currently receives the same server order, the same TLS fingerprint, the
same Reality short ID, and the same clean-IP list. One blocked user is every
blocked user, and enumerating one subscription reveals the whole estate. A
deterministic per-user shuffle and subset is cheap.

### Server-side evasion

*(reported)* Where a censor drops the **server's response** rather than the
client's request, client-side evasion cannot help. Evasion budget should move
server-side. This also means fragmentation-based approaches — which act on the
client's ClientHello — are structurally limited on those networks.

## P2 — Protocols and techniques worth evaluating

Ordered by expected value, not novelty.

| Item | What it adds | Effort |
|---|---|---|
| **Post-quantum-capable TLS fingerprints** | *(reported)* A majority of real browser connections now carry a hybrid key share. A ClientHello claiming a modern browser **without** one is anomalous — so parroting an older profile is now itself a signal. Pin a current profile and verify it in CI. | S |
| **Xray FinalMask profiles** | A packet-masking framework already present in a core we run: programmable handshake templates, combined record- and TCP-layer fragmentation, DNS and ICMP transports, UDP port hopping. Config only, no new daemon. Largest unused capability in the stack. | M |
| **VLESS Encryption** | Post-quantum hybrid key exchange with replay protection that does not need clock sync, and no outer TLS to detect inside. *Caveat:* not supported by sing-box, so a large share of clients cannot use it — plan a two-tier protocol story. | S |
| **Hysteria2 size-randomising obfuscation** | Uniform high-entropy UDP is itself a signature. Randomising packet **sizes** rather than XOR-ing every packet targets the classifier that actually fires. *Check first:* browser-QUIC parroting fails against Ed25519 certificates. | S |
| **Shadowsocks 2022 with a connection prefix** | Re-enables a protocol we already ship but had to disable, by defeating entropy-based fully-encrypted-traffic detection. | S |
| **AnyTLS deployed server-side** | The generator exists; no server runs it. Padding targets the nested-handshake signature. TCP-only, which is the right property where UDP is broadly dropped. | S |
| **TUIC v5** | Fingerprint diversity — but *(reported)* QUIC initials are dropped wholesale on the target networks, so this is insurance rather than a current win. | S |

## P3 — Deliberately not doing

Recording these so they are not proposed again.

- **Trojan-Go** — unmaintained since 2024, and plain-TLS fingerprinting is exactly
  what this project removed from the relay for being detected. Adding it is a regression.
- **Protocol mimicry** (imitating Zoom/Teams/iCloud) — a censor that checks whether
  inter-arrival timing matches the real codec wins. Tunnelling *through* a genuinely
  allowlisted service is the version that works; imitating one is not.
- **Refraction networking / Conjure** — requires an ISP partner. Worth integrating
  as a client if someone else operates it; not buildable on a VPS.
- **Multipath (MPTCP/MPQUIC)** — no censorship benefit demonstrated; connection
  migration is the useful primitive instead.
- **Building a mesh messenger** — during shutdowns these appear fast and ship
  critical vulnerabilities faster. Out of scope.

## Structural risk we do not currently mitigate

*(reported)* A single-IP host that accepts inbound connections and opens matching
outbound flows is identifiable as a relay by that behavioural contrast alone,
independent of which protocol it speaks — and "is this in a VPS-dense hosting ASN?"
is a cheap first filter. Every server in this fleet fits that description.

This defeats every protocol in the stack simultaneously. Partial mitigations:
provider and ASN diversity, running a genuine service on the same host, and
separating egress from ingress. None are implemented.

---

Corrections and citations welcome — [open an issue](https://github.com/sep-lab/polypath/issues),
and see the safety note in [CONTRIBUTING.md](../CONTRIBUTING.md) before reporting
from a censored network.
