# ADR-0004: Protocol Priority Order for Iran

## Status

Accepted

## Date

2026-02-01

## Context

We support 14 protocols across 4 servers. Users in Iran face different DPI rules per ISP (Irancell, MCI, Rightel, fixed-line). We need a deterministic priority order for the subscription config list — Hiddify tries them top-to-bottom, so order matters.

## Decision

Use the following priority order (v4.0), optimized for Iran's DPI landscape:

| Priority | Protocol | Why |
|----------|----------|-----|
| 1 | XHTTP-CDN | CDN-fronted + no WS headers + anti-detection fingerprint |
| 2 | XHTTP-CDN + Clean CF IPs | Bypasses per-ISP CF IP throttling |
| 3 | Finalmask XDNS/XICMP | UDP-based, looks like DNS/game traffic |
| 4 | XrayHTTP | Direct TCP with fake HTTP headers to whitelisted domains |
| 5 | VLESS Reality | Direct TLS mimicking Google — highest throughput |
| 6 | Hysteria2 | UDP/QUIC — fast, bypasses TCP-focused DPI |
| 7 | Hy2 Salamander+Hop | Obfuscated QUIC + port cycling (20K-50K range) |
| 8 | ShadowTLS v3 | Real TLS handshake to Google — most covert TCP |
| 9 | IPv6 Reality/Hy2 | When ISP blocks IPv4 only |
| 10 | CDN-WS | CDN-fronted but WS more detectable than XHTTP |
| 11 | SS2022, NaiveProxy, Cloak | Plan B diverse protocol fingerprints |
| 12 | DNS Tunnel | Emergency — always works, slow (~63 KB/s) |
| 13 | EDtunnel | Zero IP exposure — ultimate last resort |

## Rationale

- CDN-fronted first: IP-hidden, survives IP blocks
- XHTTP over WS: XHTTP has no `Upgrade: websocket` header — harder to fingerprint
- UDP before advanced TCP: Finalmask evades TCP-focused DPI
- Direct protocols mid-list: fastest throughput but IP-exposed
- DNS tunnel and EDtunnel last: always work but slowest

## Consequences

- **Positive**: Users get the best working protocol automatically
- **Positive**: Order adapts to Iran's current DPI behavior
- **Negative**: Must be manually updated when DPI rules change
- **Future**: Smart client app (ADR-0002) will make this dynamic

## References

- architecture.md — Fallback Priority section
- worker.js — subscription builder logic (lines 940-1050)
