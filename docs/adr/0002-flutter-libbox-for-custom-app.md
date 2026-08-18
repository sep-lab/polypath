# ADR-0002: Flutter + libbox for Custom App

## Status

Proposed

## Date

2026-03-09

## Context

We need to decide on the technology stack for a future custom VPN app that can:

- Auto-select protocols based on DPI conditions
- Leverage phone resources (CPU, network stack, storage)
- Work on both Android and iOS
- Be distributable outside app stores (sideloading)

Options considered:

- Flutter + libbox (sing-box's library)
- React Native + custom native modules
- Native Android (Kotlin) + Native iOS (Swift) separately
- Go Mobile (gomobile) + minimal UI

## Decision

Use **Flutter with libbox** (sing-box's Go library).

## Rationale

- Hiddify (our current client) proves Flutter + libbox works at scale
- Cross-platform: single codebase for Android + iOS + Desktop
- libbox provides battle-tested proxy implementations (VLESS, Hysteria2, etc.)
- Flutter has a large community and good documentation
- Hiddify's source code is open — we can learn from their architecture

## Consequences

- **Positive**: Single codebase, proven stack, access to all sing-box protocols
- **Positive**: Can fork/extend Hiddify's architecture
- **Negative**: Flutter apps are ~15MB+ (larger than native)
- **Negative**: iOS distribution limited to TestFlight (10K users, 90-day builds) or enterprise cert
- **Negative**: Requires Dart + Go cross-compilation expertise

## References

- [Hiddify source](https://github.com/hiddify/hiddify-app)
- [sing-box libbox](https://sing-box.sagernet.org/clients/apple/)
- strategy-roadmap.md — Track 3: Custom App
- RESEARCH-TOPICS.md — Topics 1 & 2
