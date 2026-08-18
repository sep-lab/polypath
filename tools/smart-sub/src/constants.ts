// ── Constants ─────────────────────────────────────────────────────
// All module-scope constants extracted from worker.js.

import type { FragmentSettings } from "./types";

// Cloudflare clean IPs — diverse ranges for resilience against per-range blocking.
// Rotated by admin via PATCH /admin/clean-ips if any get blocked.
// Each range has different peering paths to Iran; if one range is blocked,
// others from different CF datacenters may still work.
export const CF_CLEAN_IPS: string[] = [
  // Range 141.101.x.x (CF partner network)
  "141.101.113.153",
  // Range 162.159.x.x (CF anycast)
  "162.159.130.234",
  "162.159.134.233",
  // Range 188.114.x.x (CF Europe)
  "188.114.97.3",
  "188.114.98.224",
  "188.114.99.100",
  // Range 104.16-17.x.x (CF primary)
  "104.16.132.229",
  "104.17.148.22",
  // Range 172.67.x.x (CF secondary)
  "172.67.71.160",
];

// Alt SNIs disabled — all servers use server_name: "www.google.com"
// which rejects connections with a different SNI
export const ALT_REALITY_SNIS: string[] = [];

// CDN-subdomain trick: DPI checks Host header but doesn't validate
// that the subdomain actually exists. CDN-style subdomains look like
// real asset/stream requests, far more convincing than bare domains.
export const WHITELISTED_HOSTS: string[] = [
  "cdn-static.varzesh3.com",        // looks like Varzesh3 static CDN
  "dkstatics-public.digikala.com",   // real Digikala CDN pattern
  "dl.cafebazaar.ir",                // looks like CafeBazaar APK download
  "stream48.cdn.asset.filimo.com",   // looks like Filimo video stream (from intel)
  "cdn-dl.aparat.com",               // looks like Aparat video download CDN
  "mir-data-60.myket.ir",            // looks like Myket CDN data (from intel)
  "cdn-live.telewebion.com",         // looks like Telewebion live stream CDN
  "api.tgju.org",                    // looks like TGJU price API
  "dl8.soft98.ir",                   // looks like Soft98 download mirror
  "cdn.bartarinha.ir",               // looks like Bartarinha CDN
  "cdn.zula.ir",                     // looks like Zula messenger CDN (from intel)
  "static.bale.ai",                  // looks like Bale messenger assets
];

// Original bare domains (for reference / fallback if CDN subdomains get flagged)
export const WHITELISTED_HOSTS_BARE: string[] = [
  "varzesh3.com", "digikala.com", "cafebazaar.ir", "filimo.com",
  "aparat.com", "myket.ir", "telewebion.com", "tgju.org",
  "soft98.ir", "bartarinha.ir", "zula.ir", "bale.ai",
];

export const ISP_DNS_RESOLVERS: Record<string, string[]> = {
  mci: [
    "2.188.21.100", "2.188.21.120", "2.188.21.190", "2.188.21.20",
    "2.188.21.200", "2.188.21.230", "2.188.21.240", "2.188.21.90",
  ],
  irancell: [
    "94.183.126.175", "94.183.124.45", "37.202.225.135", "37.202.225.137",
    "87.248.130.22", "193.84.255.67", "185.24.253.8", "188.213.65.54",
  ],
  other: [
    "5.160.233.150", "2.144.6.138", "164.138.206.100", "185.206.92.250",
    "185.206.95.198", "185.66.226.83", "194.225.144.2",
  ],
};

export const FRAGMENT: FragmentSettings = {
  packets: "tlshello",
  length: "10-100",
  interval: "10-50",
};

export const ISP_FRAGMENTS: Record<string, FragmentSettings> = {
  irancell: { packets: "tlshello", length: "3-30", interval: "30-100" },
  mci:      { packets: "tlshello", length: "5-80", interval: "15-60" },
  rightel:  { packets: "tlshello", length: "10-150", interval: "5-30" },
  shatel:   { packets: "tlshello", length: "5-80", interval: "15-60" },
  mobinnet: { packets: "tlshello", length: "5-60", interval: "20-70" },
};

// Keep in sync with config/isp-tuning.yaml -> asn_to_isp.
// Entries below the divider are recognised for labelling and probe reporting
// but have no measured fragment profile, so they fall back to FRAGMENT.
export const ASN_TO_ISP: Record<string, string> = {
  "44244": "irancell",
  "197207": "mci",
  "57218": "rightel",
  "31549": "shatel",
  "50810": "mobinnet",
  // -- recognised, no measured tuning profile yet --
  "58224": "tci",
  "12880": "itc",
  "43754": "asiatech",
  "16322": "parsonline",
  "49666": "tic",
};

export const MUX = {
  protocol: "h2",
  maxConcurrency: 8,
  padding: true,
} as const;

export const FINALMASK = {
  xdns_port: 10053,
  xicmp_port: 10054,
  wechat_port: 10055,
  dtls_port: 10056,
  srtp_port: 10057,
} as const;

export const SHADOWTLS_DEFAULTS = {
  port: 10443,
  version: 3,
  handshake_server: "www.google.com",
} as const;

export const SALAMANDER_DEFAULTS = {
  hop_min: 20000,
  hop_max: 50000,
  hop_interval: 30,
} as const;

// Per-ISP preferred hosts for XrayHTTP — ordered by reliability on that ISP.
// Government-affiliated hosts (Tier 1) are safest for long-term use.
// Rotation strategy: if primary gets flagged, client auto-tries next in list.
export const ISP_HOST_PRIORITY: Record<string, string[]> = {
  irancell: [
    "cdn-live.telewebion.com",       // state TV — will never be blocked
    "mir-data-60.myket.ir",          // gov-adjacent app store
    "cdn-static.varzesh3.com",       // state sports — tier 1
    "static.bale.ai",                // gov messenger
    "cdn.zula.ir",                   // gov messenger
    "cdn-dl.aparat.com",             // video platform
  ],
  mci: [
    "mir-data-60.myket.ir",          // confirmed working on MCI
    "cdn-live.telewebion.com",       // state TV
    "dkstatics-public.digikala.com", // major e-commerce
    "cdn-dl.aparat.com",             // video platform
    "stream48.cdn.asset.filimo.com", // movie streaming
    "dl.cafebazaar.ir",              // app store
  ],
  rightel: [
    "cdn-dl.aparat.com",             // most lenient ISP — broader host support
    "cdn-live.telewebion.com",
    "mir-data-60.myket.ir",
    "dkstatics-public.digikala.com",
    "stream48.cdn.asset.filimo.com",
    "cdn-static.varzesh3.com",
  ],
  shatel: [
    "cdn-live.telewebion.com",
    "cdn-dl.aparat.com",
    "dkstatics-public.digikala.com",
    "mir-data-60.myket.ir",
    "dl8.soft98.ir",
    "stream48.cdn.asset.filimo.com",
  ],
};

// Protocols known to be broken per ISP (from field testing March 2026).
// These get filtered OUT of subscription output for the detected ISP.
export const ISP_BLOCKED_PROTOCOLS: Record<string, string[]> = {
  irancell: [
    "CDN-WS",       // DPI detects Upgrade: websocket header even through CF CDN
    "Reality",       // TLS/443 encrypted protos blocked
    "Hy2",           // QUIC/8443 blocked
    "Hy2-Hop",       // QUIC blocked regardless of port hopping
    "Hy2-IPv6",      // QUIC blocked
    "Reality-IPv6",  // encrypted blocked
    "gRPC-CDN",      // gRPC over HTTP/2 detected
  ],
  mci: [
    "CDN-WS",       // WebSocket upgrade detected on MCI too (less aggressive than Irancell)
    "Hy2",          // QUIC generally blocked
    "Hy2-Hop",
  ],
  // rightel, shatel, mobinnet — generally more lenient, don't block by default
};

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  // The only HTML this worker serves is the /mtproto page, which needs inline
  // styles and nothing else. No scripts, no remote origins, no framing.
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};
