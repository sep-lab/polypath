# Threat model

What this system defends against, how, and — more importantly — what it does not.

Read this before you rely on it, and before you ask anyone else to.

---

## 1. The adversary

A national-scale censor with in-path control of the network between the user and
the internet. Concretely, it can:

| Capability | What it means here |
|---|---|
| **Passive flow classification** | Recognise a connection from its opening bytes: TLS fingerprint, handshake shape, packet sizes and timing |
| **SNI inspection and filtering** | Read the server name in a TLS ClientHello and drop the flow |
| **Protocol allowlisting** | Invert the model — drop everything that is not a recognised, permitted protocol to a permitted destination |
| **IP and prefix blocking** | Null-route a server, a range, or a hosting provider |
| **DNS manipulation** | Poison or hijack resolution for chosen names |
| **Bidirectional dropping** | Drop the *server's response* even when the client's request got through |
| **Active probing** | Connect to a suspected proxy and see how it answers |
| **Volume and reputation analysis** | Flag an IP by throughput, flow symmetry, or the plausibility of its reverse DNS |
| **Total shutdown** | Sever international transit entirely, for days or months |

This is an **in-path** adversary, not merely on-path. It can silently discard
rather than only inject. That distinction matters: evasion tricks that rely on
racing an injected reset — TTL games, sequence-number tricks — are structurally
weaker here than against an injection-only censor.

Explicitly **out of scope**: a global passive observer correlating both ends of a
connection, and an adversary with control of the user's device.

## 2. What each layer defends against

| Layer | Defends against | Mechanism |
|---|---|---|
| **Protocol diversity** (many transports) | Any single protocol being fingerprinted | If one path dies the others are unaffected. This is the core design bet. |
| **Reality / TLS camouflage** | Active probing, TLS fingerprinting | An unauthenticated prober is transparently proxied to a genuine third-party site and gets a real response with a real certificate chain |
| **CDN fronting** | Origin IP blocking | The client connects to CDN edge addresses; blocking them means blocking the CDN |
| **Multi-provider fleet** | Provider-level or prefix-level blocking | Four servers, four providers, four countries |
| **TLS fragmentation / MUX padding** | SNI-based filtering, size fingerprinting | Splits the ClientHello, pads multiplexed streams. **See §4 — this is currently degraded.** |
| **Per-ISP tuning** | Divergent filtering between carriers | Different fragment parameters and protocol sets per network |
| **Failed-auth throttling** | Credential guessing, enumeration | Repeated failures from one caller are throttled; successes are never counted |
| **DNS tunnelling** | Total shutdown of ordinary transit | UDP/53 is often preserved deliberately, because blocking it breaks domestic services |
| **Subscription generation** | Config staleness as paths die | Clients re-fetch and get whatever currently works, without user action |

## 3. What this does **not** protect against

Read this section twice. Everything here is a real, current limitation.

### 3.0 Volumetric abuse

Failed-authentication attempts are throttled per caller, which addresses
credential guessing. It is **not** a general rate limiter: a caller presenting a
valid credential can still make unlimited requests. Volumetric protection
belongs at the edge (Cloudflare Rate Limiting rules on `/sub/*` and `/admin/*`)
and is not configured by this repo.

### 3.1 Credential revocation is incomplete

Disabling a user blocks their subscription URL and the configs that embed their
UUID — VLESS and Hysteria2. It does **not** revoke Shadowsocks 2022, ShadowTLS,
NaiveProxy, Cloak, AmneziaWG, Finalmask, or MTProto: those use credentials shared
across all users, so the generators ignore the per-user identifier.

**A past subscriber retains working access to several protocols on every server,
permanently, until those shared secrets are rotated fleet-wide.** Treat "disable
user" as "revoke their subscription feed", not "revoke their access".

MTProto is the sharpest case: its secret is the entire authentication material,
with no per-user component and no revocation path at all.

### 3.2 Server operators see metadata

Whoever runs an exit server sees which destinations a user connects to, and when.
This system does not implement onion routing or a mixnet. If you would not accept
your ISP seeing that, do not accept a volunteer's server seeing it either.

Relays forward the real client IP to the origin, so the origin sees end-user
addresses from a censored country. That is necessary for geo-aware config
generation and is a deliberate trade-off, not an accident.

### 3.3 Endpoint compromise

Nothing here protects a user whose device is compromised, seized, or inspected at
a checkpoint. Client configs are stored in plaintext by every client app.

A single leaked config line yields the subscription URL, and the subscription URL
yields every config for that user — the UUID is simultaneously the subscription
token and the VPN password. One credential spans two authentication planes.

### 3.4 Traffic analysis and IP-based fingerprinting

Padding and fragmentation change how a flow *opens*. They do not disguise its
volume or timing over minutes.

Separately, destination-IP records alone — no TLS fingerprints, no ports, no
timing — are enough to identify a large fraction of visited sites. Hiding a
*name*, whether by fronting or by encrypting the ClientHello, does not hide the
*address*. Against that adversary the only defence is destination diversity.

### 3.5 Relay hosts are identifiable as relays

A single-IP host that receives inbound connections and then opens matching
outbound flows has a behavioural signature that no amount of link obfuscation
conceals: it acts as both server and client, and its outbound destinations
correlate with its inbound traffic. Published research detects this at low false
positive rates, and uses "is this in a VPS-dense ASN?" as a cheap first filter.

Every server in this fleet is a single-IP VPS in a well-known hosting ASN. This
defeats every protocol listed in §2 simultaneously, and we do not currently
mitigate it. Field reports consistently show that bridges on obscure networks
survive while bridges on major cloud providers get blocked.

### 3.6 Legal risk

This system cannot reduce the legal exposure of the person who operates a server,
registers the account, or uses the service. In some jurisdictions each of those
is independently prosecutable.

Two rules follow, and this project treats them as non-negotiable:

- **Never ask anyone to register infrastructure in their name on your behalf.**
  Whoever owns the account carries the exposure, not whoever runs the software.
- **Never accept SSH access to someone else's machine**, and never hand yours over.
  Contribute capacity by running the playbook on your own server and peering it.

### 3.7 Total shutdown

During a sustained nationwide shutdown with international transit severed and a
default-deny allowlist in force, **nothing in this stack works.** Every transport
here needs either a reachable IP or a resolvable name, and an allowlist denies
both.

DNS tunnelling over UDP/53 has historically been the last channel to survive,
because blocking it breaks domestic services too. That is a pattern, not a
guarantee, and it has not held in every event.

## 4. Known-degraded defences

Documented here rather than quietly left in the code.

**TLS fragmentation is degraded.** Reports from mid-2026 indicate the DPI now
performs TCP reassembly, which nullifies fragmentation used on its own. Combining
record-layer fragmentation with TCP-layer segmentation is more durable than
either alone, but should no longer be treated as load-bearing.

**Client-side evasion is structurally insufficient here.** Where a censor drops
the *server's response* rather than the client's request, no amount of
client-side packet manipulation helps. Evasion has to be applied server-side.

## 5. If you are deciding whether to use this

Reasonable if: you want protocol diversity against a filtering censor, you accept
that your exit server operator sees your destinations, and you understand the
legal position in your jurisdiction.

**Not** the right tool if: you need anonymity from the server operator (use Tor),
you are defending against a global passive adversary, or you need a guarantee of
availability during a full shutdown.

## 6. Reporting

Security issues: see [SECURITY.md](../SECURITY.md). Please do not open a public
issue for anything that would expose live infrastructure or a person.
