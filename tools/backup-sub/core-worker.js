// GENERATED FILE — do not edit. Change src/ modules and run: npm run build

// tools/smart-sub/src/constants.ts
var CF_CLEAN_IPS = [
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
  "172.67.71.160"
];
var ALT_REALITY_SNIS = [];
var WHITELISTED_HOSTS = [
  "cdn-static.varzesh3.com",
  // looks like Varzesh3 static CDN
  "dkstatics-public.digikala.com",
  // real Digikala CDN pattern
  "dl.cafebazaar.ir",
  // looks like CafeBazaar APK download
  "stream48.cdn.asset.filimo.com",
  // looks like Filimo video stream (from intel)
  "cdn-dl.aparat.com",
  // looks like Aparat video download CDN
  "mir-data-60.myket.ir",
  // looks like Myket CDN data (from intel)
  "cdn-live.telewebion.com",
  // looks like Telewebion live stream CDN
  "api.tgju.org",
  // looks like TGJU price API
  "dl8.soft98.ir",
  // looks like Soft98 download mirror
  "cdn.bartarinha.ir",
  // looks like Bartarinha CDN
  "cdn.zula.ir",
  // looks like Zula messenger CDN (from intel)
  "static.bale.ai"
  // looks like Bale messenger assets
];
var ISP_DNS_RESOLVERS = {
  mci: [
    "2.188.21.100",
    "2.188.21.120",
    "2.188.21.190",
    "2.188.21.20",
    "2.188.21.200",
    "2.188.21.230",
    "2.188.21.240",
    "2.188.21.90"
  ],
  irancell: [
    "94.183.126.175",
    "94.183.124.45",
    "37.202.225.135",
    "37.202.225.137",
    "87.248.130.22",
    "193.84.255.67",
    "185.24.253.8",
    "188.213.65.54"
  ],
  other: [
    "5.160.233.150",
    "2.144.6.138",
    "164.138.206.100",
    "185.206.92.250",
    "185.206.95.198",
    "185.66.226.83",
    "194.225.144.2"
  ]
};
var FRAGMENT = {
  packets: "tlshello",
  length: "10-100",
  interval: "10-50"
};
var ISP_FRAGMENTS = {
  irancell: { packets: "tlshello", length: "3-30", interval: "30-100" },
  mci: { packets: "tlshello", length: "5-80", interval: "15-60" },
  rightel: { packets: "tlshello", length: "10-150", interval: "5-30" },
  shatel: { packets: "tlshello", length: "5-80", interval: "15-60" },
  mobinnet: { packets: "tlshello", length: "5-60", interval: "20-70" }
};
var ASN_TO_ISP = {
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
  "49666": "tic"
};
var MUX = {
  protocol: "h2",
  maxConcurrency: 8,
  padding: true
};
var FINALMASK = {
  xdns_port: 10053,
  xicmp_port: 10054,
  wechat_port: 10055,
  dtls_port: 10056,
  srtp_port: 10057
};
var SHADOWTLS_DEFAULTS = {
  port: 10443,
  version: 3,
  handshake_server: "www.google.com"
};
var SALAMANDER_DEFAULTS = {
  hop_min: 2e4,
  hop_max: 5e4,
  hop_interval: 30
};
var ISP_HOST_PRIORITY = {
  irancell: [
    "cdn-live.telewebion.com",
    // state TV — will never be blocked
    "mir-data-60.myket.ir",
    // gov-adjacent app store
    "cdn-static.varzesh3.com",
    // state sports — tier 1
    "static.bale.ai",
    // gov messenger
    "cdn.zula.ir",
    // gov messenger
    "cdn-dl.aparat.com"
    // video platform
  ],
  mci: [
    "mir-data-60.myket.ir",
    // confirmed working on MCI
    "cdn-live.telewebion.com",
    // state TV
    "dkstatics-public.digikala.com",
    // major e-commerce
    "cdn-dl.aparat.com",
    // video platform
    "stream48.cdn.asset.filimo.com",
    // movie streaming
    "dl.cafebazaar.ir"
    // app store
  ],
  rightel: [
    "cdn-dl.aparat.com",
    // most lenient ISP — broader host support
    "cdn-live.telewebion.com",
    "mir-data-60.myket.ir",
    "dkstatics-public.digikala.com",
    "stream48.cdn.asset.filimo.com",
    "cdn-static.varzesh3.com"
  ],
  shatel: [
    "cdn-live.telewebion.com",
    "cdn-dl.aparat.com",
    "dkstatics-public.digikala.com",
    "mir-data-60.myket.ir",
    "dl8.soft98.ir",
    "stream48.cdn.asset.filimo.com"
  ]
};
var ISP_BLOCKED_PROTOCOLS = {
  irancell: [
    "CDN-WS",
    // DPI detects Upgrade: websocket header even through CF CDN
    "Reality",
    // TLS/443 encrypted protos blocked
    "Hy2",
    // QUIC/8443 blocked
    "Hy2-Hop",
    // QUIC blocked regardless of port hopping
    "Hy2-IPv6",
    // QUIC blocked
    "Reality-IPv6",
    // encrypted blocked
    "gRPC-CDN"
    // gRPC over HTTP/2 detected
  ],
  mci: [
    "CDN-WS",
    // WebSocket upgrade detected on MCI too (less aggressive than Irancell)
    "Hy2",
    // QUIC generally blocked
    "Hy2-Hop"
  ]
  // rightel, shatel, mobinnet — generally more lenient, don't block by default
};
var SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  // The only HTML this worker serves is the /mtproto page, which needs inline
  // styles and nothing else. No scripts, no remote origins, no framing.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

// tools/smart-sub/src/config.ts
function buildConfig(env) {
  const shadowtlsPassword = env.SHADOWTLS_PASSWORD;
  const salamanderPassword = env.SALAMANDER_PASSWORD;
  const ssUserKey = env.SS_USER_KEY;
  const finalmaskSeed = env.FINALMASK_SEED;
  const adminUuid = env.ADMIN_UUID;
  const edtunnel = {
    pages: (env.EDTUNNEL_PAGES || "").split(",").filter(Boolean),
    path: "/?ed=2048",
    port: 443
  };
  const vercelRelays = (env.VERCEL_RELAY_HOSTS || "").split(",").filter(Boolean);
  const netlifyRelays = (env.NETLIFY_RELAY_HOSTS || "").split(",").filter(Boolean);
  const servers = [
    {
      tag: "helsinki",
      location: "Finland",
      provider: "Hetzner",
      ip: env.HEL_IP,
      ipv6: env.HEL_IPV6 || null,
      reality_port: 443,
      reality_port_alt: 8443,
      hy2_port: 8443,
      reality_pubkey: env.HEL_REALITY_PUBKEY,
      reality_short_id: env.HEL_REALITY_SHORT_ID,
      sni: "www.google.com",
      has_dns_tunnel: true,
      cdn_ws: { host: "cdn.example.com", path: "/ws", port: 443 },
      http_obfs: { port: 80, host: "cdn-live.telewebion.com", path: "/" },
      xhttp_cdn: { host: "cdn.example.com", path: "/xhttp", port: 443 },
      ss2022: {
        port: 80,
        method: "2022-blake3-aes-128-gcm",
        server_key: env.HEL_SS_KEY,
        user_key: ssUserKey
      },
      finalmask: {
        xdns_port: FINALMASK.xdns_port,
        xicmp_port: FINALMASK.xicmp_port,
        wechat_port: FINALMASK.wechat_port,
        dtls_port: FINALMASK.dtls_port,
        srtp_port: FINALMASK.srtp_port,
        seed: finalmaskSeed
      },
      grpc_cdn: null,
      // gRPC requires HTTP/2 end-to-end — incompatible with HAProxy TCP mode
      shadowtls: {
        port: SHADOWTLS_DEFAULTS.port,
        password: shadowtlsPassword,
        handshake_server: SHADOWTLS_DEFAULTS.handshake_server
      },
      hy2_hop: {
        port_range: `${SALAMANDER_DEFAULTS.hop_min}-${SALAMANDER_DEFAULTS.hop_max}`,
        salamander_password: salamanderPassword
      },
      naive: {
        host: "web.example.com",
        port: 2087,
        user: "vpnuser",
        pass: env.HEL_NAIVE_PASS
      },
      cloak: null,
      amneziawg: null,
      relay: null,
      mtproto: {
        port: 3443,
        secret: env.HEL_MTPROTO_SECRET
      },
      geo_restrict: null,
      geo_exclude: null,
      geo_cdn_only: null,
      enabled: true
    },
    {
      tag: "oracle-madrid",
      location: "Madrid",
      provider: "Oracle Cloud (Free)",
      ip: env.ORC_IP,
      ipv6: null,
      reality_port: 443,
      reality_port_alt: 8443,
      hy2_port: 8443,
      reality_pubkey: env.ORC_REALITY_PUBKEY,
      reality_short_id: env.ORC_REALITY_SHORT_ID,
      sni: "www.google.com",
      has_dns_tunnel: true,
      cdn_ws: { host: "cdn2.example.com", path: "/ws", port: 443 },
      http_obfs: { port: 80, host: "mir-data-60.myket.ir", path: "/" },
      xhttp_cdn: { host: "cdn2.example.com", path: "/xhttp", port: 443 },
      ss2022: {
        port: 80,
        method: "2022-blake3-aes-128-gcm",
        server_key: env.ORC_SS_KEY,
        user_key: ssUserKey
      },
      finalmask: {
        xdns_port: FINALMASK.xdns_port,
        xicmp_port: FINALMASK.xicmp_port,
        wechat_port: FINALMASK.wechat_port,
        dtls_port: FINALMASK.dtls_port,
        srtp_port: FINALMASK.srtp_port,
        seed: finalmaskSeed
      },
      grpc_cdn: null,
      // gRPC requires HTTP/2 end-to-end — incompatible with HAProxy TCP mode
      shadowtls: {
        port: SHADOWTLS_DEFAULTS.port,
        password: shadowtlsPassword,
        handshake_server: SHADOWTLS_DEFAULTS.handshake_server
      },
      hy2_hop: {
        port_range: `${SALAMANDER_DEFAULTS.hop_min}-${SALAMANDER_DEFAULTS.hop_max}`,
        salamander_password: salamanderPassword
      },
      naive: {
        host: "web2.example.com",
        port: 2087,
        user: "vpnuser",
        pass: env.ORC_NAIVE_PASS
      },
      cloak: null,
      amneziawg: null,
      relay: null,
      mtproto: {
        port: 3443,
        secret: env.ORC_MTPROTO_SECRET
      },
      geo_restrict: null,
      geo_exclude: null,
      geo_cdn_only: ["IR"],
      // Madrid direct IP blocked from Iran, but CDN-fronted configs work via CF
      enabled: true
    },
    {
      tag: "gcp-middle-east",
      location: "Dammam",
      provider: "Google Cloud ($300 credit)",
      ip: env.GCP_IP,
      ipv6: null,
      reality_port: 443,
      reality_port_alt: 8443,
      hy2_port: 8443,
      reality_pubkey: env.GCP_REALITY_PUBKEY,
      reality_short_id: env.GCP_REALITY_SHORT_ID,
      sni: "www.google.com",
      has_dns_tunnel: false,
      cdn_ws: { host: "cdn4.example.com", path: "/ws", port: 443 },
      http_obfs: { port: 80, host: "cdn-dl.aparat.com", path: "/" },
      xhttp_cdn: { host: "cdn4.example.com", path: "/xhttp", port: 443 },
      ss2022: {
        port: 80,
        method: "2022-blake3-aes-128-gcm",
        server_key: env.GCP_SS_KEY,
        user_key: ssUserKey
      },
      finalmask: {
        xdns_port: FINALMASK.xdns_port,
        xicmp_port: FINALMASK.xicmp_port,
        wechat_port: FINALMASK.wechat_port,
        dtls_port: FINALMASK.dtls_port,
        srtp_port: FINALMASK.srtp_port,
        seed: finalmaskSeed
      },
      grpc_cdn: null,
      // gRPC requires HTTP/2 end-to-end — incompatible with HAProxy TCP mode
      shadowtls: {
        port: SHADOWTLS_DEFAULTS.port,
        password: shadowtlsPassword,
        handshake_server: SHADOWTLS_DEFAULTS.handshake_server
      },
      hy2_hop: {
        port_range: `${SALAMANDER_DEFAULTS.hop_min}-${SALAMANDER_DEFAULTS.hop_max}`,
        salamander_password: salamanderPassword
      },
      naive: null,
      cloak: null,
      amneziawg: null,
      relay: null,
      mtproto: {
        port: 3443,
        secret: env.GCP_MTPROTO_SECRET
      },
      geo_restrict: null,
      geo_exclude: null,
      geo_cdn_only: null,
      enabled: true
    },
    {
      tag: "scaleway-london",
      location: "London",
      provider: "Scaleway",
      ip: env.SCW_IP,
      ipv6: env.SCW_IPV6 || null,
      reality_port: 443,
      reality_port_alt: 8443,
      hy2_port: 8443,
      reality_pubkey: env.SCW_REALITY_PUBKEY,
      reality_short_id: env.SCW_REALITY_SHORT_ID,
      sni: "www.google.com",
      has_dns_tunnel: true,
      cdn_ws: { host: "cdn3.example.com", path: "/ws", port: 443 },
      http_obfs: { port: 80, host: "cdn-media.divar.ir", path: "/" },
      xhttp_cdn: { host: "cdn3.example.com", path: "/xhttp", port: 443 },
      ss2022: {
        port: 80,
        method: "2022-blake3-aes-128-gcm",
        server_key: env.SCW_SS_KEY,
        user_key: ssUserKey
      },
      finalmask: {
        xdns_port: FINALMASK.xdns_port,
        xicmp_port: FINALMASK.xicmp_port,
        wechat_port: FINALMASK.wechat_port,
        dtls_port: FINALMASK.dtls_port,
        srtp_port: FINALMASK.srtp_port,
        seed: finalmaskSeed
      },
      grpc_cdn: null,
      // gRPC requires HTTP/2 end-to-end — incompatible with HAProxy TCP mode
      shadowtls: {
        port: SHADOWTLS_DEFAULTS.port,
        password: shadowtlsPassword,
        handshake_server: SHADOWTLS_DEFAULTS.handshake_server
      },
      hy2_hop: {
        port_range: `${SALAMANDER_DEFAULTS.hop_min}-${SALAMANDER_DEFAULTS.hop_max}`,
        salamander_password: salamanderPassword
      },
      naive: {
        host: "web4.example.com",
        port: 2087,
        user: "vpnuser",
        pass: env.SCW_NAIVE_PASS
      },
      cloak: {
        port: 2053,
        uid: env.SCW_CLOAK_UID,
        public_key: env.SCW_CLOAK_PUBKEY,
        server_name: "www.google.com",
        encryption: "plain",
        browser_sig: "chrome"
      },
      amneziawg: null,
      relay: null,
      mtproto: {
        port: 3443,
        secret: env.SCW_MTPROTO_SECRET
      },
      geo_restrict: null,
      geo_exclude: null,
      geo_cdn_only: null,
      enabled: true
    }
  ];
  for (const server of servers) {
    if (server.enabled && !server.ip) {
      throw new Error(
        `Server "${server.tag}" is enabled but has no IP configured. Set the corresponding env var (e.g. HEL_IP, ORC_IP).`
      );
    }
  }
  const envUsers = {
    [adminUuid]: { name: "admin", tier: "premium", enabled: true, source: "env" }
  };
  if (env.FAMILY_UUID) {
    envUsers[env.FAMILY_UUID] = { name: "family", tier: "premium", enabled: true, source: "env" };
  }
  if (env.TEST_UUID) {
    envUsers[env.TEST_UUID] = {
      name: "test",
      tier: "premium",
      enabled: true,
      source: "env",
      expires: env.TEST_UUID_EXPIRES || "2026-04-07"
    };
  }
  const freeServerLimit = parseInt(env.FREE_SERVER_LIMIT || "2", 10);
  return { servers, envUsers, adminUuid, freeServerLimit, edtunnel, vercelRelays, netlifyRelays };
}

// tools/smart-sub/src/utils.ts
function isValidUUID(uuid) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}
function detectIranISP(request) {
  const cf = request.cf;
  const platformAsn = cf?.asn;
  const raw = platformAsn !== void 0 && platformAsn !== null ? String(platformAsn) : request.headers.get("cf-asn") || "";
  const asnNum = raw.replace(/^AS/i, "").trim();
  return ASN_TO_ISP[asnNum] || "unknown";
}
function getISPFragment(isp) {
  return ISP_FRAGMENTS[isp] || FRAGMENT;
}
function getServersForUser(user, servers, freeServerLimit, country = null) {
  const upperCountry = country ? country.toUpperCase() : null;
  const enabled = servers.filter((s) => {
    if (!s.enabled) return false;
    if (s.geo_restrict && s.geo_restrict.length > 0) {
      if (!upperCountry) return false;
      return s.geo_restrict.includes(upperCountry);
    }
    if (s.geo_exclude && s.geo_exclude.length > 0 && upperCountry) {
      return !s.geo_exclude.includes(upperCountry);
    }
    return true;
  });
  if (user.tier === "free") {
    return enabled.slice(0, freeServerLimit);
  }
  return enabled;
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SECURITY_HEADERS
    }
  });
}
function detectClient(request, searchParams) {
  const explicit = (searchParams.get("client") || "").toLowerCase();
  if (explicit === "hiddify" || explicit === "singbox" || explicit === "sing-box") return "hiddify";
  if (explicit === "xray" || explicit === "v2ray") return "xray";
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  if (ua.includes("hiddify") || ua.includes("sfa/") || ua.includes("sfi/") || ua.includes("sing-box")) {
    return "hiddify";
  }
  return "auto";
}
function filterForSingBox(lines) {
  return lines.filter((uri) => {
    if (uri.startsWith("hy2://")) return true;
    if (uri.startsWith("sing-box://")) return true;
    if (uri.startsWith("naive+")) return false;
    if (uri.startsWith("awg://")) return false;
    if (uri.startsWith("ss://")) return !uri.includes("plugin=ck-client");
    if (uri.startsWith("vless://")) {
      const qIdx = uri.indexOf("?");
      if (qIdx < 0) return false;
      const hash = uri.indexOf("#", qIdx);
      const qs = uri.substring(qIdx + 1, hash > 0 ? hash : void 0);
      const params = new URLSearchParams(qs);
      const type = params.get("type");
      if (type === "kcp") return false;
      return true;
    }
    return false;
  });
}
function filterByISP(lines, isp) {
  const blocked = ISP_BLOCKED_PROTOCOLS[isp];
  if (!blocked || blocked.length === 0) return lines;
  return lines.filter((uri) => {
    const hashIdx = uri.indexOf("#");
    if (hashIdx < 0) return true;
    const name = uri.substring(hashIdx + 1);
    return !blocked.some((prefix) => name.startsWith(prefix));
  });
}
function sortConfigsByISP(lines, isp) {
  if (!isp || isp === "unknown") return lines;
  function priority(uri) {
    switch (isp) {
      case "irancell":
        if (uri.includes("#XrayHTTP-") || uri.includes("headerType=http")) return 1;
        if (uri.startsWith("ss://") && !uri.includes("sing-box://")) return 2;
        if (uri.includes("#XHTTP-CDN-") || uri.includes("type=xhttp")) return 3;
        if (uri.includes("#Finalmask-") || uri.includes("type=kcp")) return 4;
        if (uri.includes("#gRPC-CDN-")) return 5;
        if (uri.includes("#ShadowTLS-")) return 6;
        if (uri.includes("#CDN-WS-") || uri.includes("type=ws")) return 7;
        return 10;
      case "mci":
        if (uri.includes("#XHTTP-CDN-") || uri.includes("type=xhttp")) return 1;
        if (uri.includes("#XrayHTTP-") || uri.includes("headerType=http")) return 2;
        if (uri.includes("#Finalmask-") || uri.includes("type=kcp")) return 3;
        if (uri.startsWith("ss://") && !uri.includes("sing-box://")) return 4;
        if (uri.includes("#gRPC-CDN-")) return 5;
        if (uri.includes("#ShadowTLS-")) return 6;
        if (uri.includes("#CDN-WS-") || uri.includes("type=ws")) return 7;
        return 10;
      case "rightel":
        if (uri.includes("#XHTTP-CDN-") || uri.includes("type=xhttp")) return 1;
        if (uri.includes("#XrayHTTP-") || uri.includes("headerType=http")) return 2;
        if (uri.includes("#CDN-WS-") || uri.includes("type=ws")) return 3;
        if (uri.includes("#Finalmask-") || uri.includes("type=kcp")) return 4;
        if (uri.startsWith("ss://") && !uri.includes("sing-box://")) return 5;
        return 10;
      default:
        return 10;
    }
  }
  return [...lines].sort((a, b) => priority(a) - priority(b));
}
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}
function extractAdminCredential(request, url) {
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  return url.searchParams.get("key");
}
async function isAdminRequest(request, url, adminToken, adminUuid) {
  const presented = extractAdminCredential(request, url);
  if (!presented) return false;
  const expected = adminToken || adminUuid;
  return timingSafeEqual(presented, expected);
}
function isValidHostOrIp(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v || v.length > 253) return false;
  if (/[\s/@?#\\[\]<>"'`]/.test(v)) return false;
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  if (ipv4.test(v)) return true;
  if (/^[0-9a-fA-F:]+$/.test(v) && v.includes(":")) return true;
  return /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(v);
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// tools/smart-sub/src/kv.ts
async function getAllKvUsers(env) {
  if (!env.HEALTH) return {};
  const list = await env.HEALTH.list({ prefix: "user:" });
  const users = {};
  for (const key of list.keys) {
    const uuid = key.name.replace("user:", "");
    const raw = await env.HEALTH.get(key.name);
    if (raw) {
      try {
        users[uuid] = { ...JSON.parse(raw), source: "kv" };
      } catch {
      }
    }
  }
  return users;
}
async function getKvUser(env, uuid) {
  if (!env.HEALTH) return null;
  const raw = await env.HEALTH.get(`user:${uuid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function setKvUser(env, uuid, userData) {
  if (!env.HEALTH) return false;
  await env.HEALTH.put(`user:${uuid}`, JSON.stringify(userData));
  return true;
}
async function deleteKvUser(env, uuid) {
  if (!env.HEALTH) return false;
  await env.HEALTH.delete(`user:${uuid}`);
  return true;
}
async function resolveUser(env, uuid, envUsers) {
  const kvUser = await getKvUser(env, uuid);
  if (kvUser) return { ...kvUser, source: "kv" };
  return envUsers[uuid] || null;
}
async function resolveAllUsers(env, envUsers) {
  const kvUsers = await getAllKvUsers(env);
  const merged = { ...envUsers };
  for (const [uuid, user] of Object.entries(kvUsers)) {
    merged[uuid] = user;
  }
  return merged;
}
async function getServerOverride(env, tag) {
  if (!env.HEALTH) return null;
  const raw = await env.HEALTH.get(`server_override:${tag}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function setServerOverride(env, tag, data) {
  if (!env.HEALTH) return false;
  await env.HEALTH.put(`server_override:${tag}`, JSON.stringify(data));
  return true;
}
async function deleteServerOverride(env, tag) {
  if (!env.HEALTH) return false;
  await env.HEALTH.delete(`server_override:${tag}`);
  return true;
}
async function getAllServerOverrides(env) {
  if (!env.HEALTH) return {};
  const list = await env.HEALTH.list({ prefix: "server_override:" });
  const overrides = {};
  for (const key of list.keys) {
    const tag = key.name.replace("server_override:", "");
    const raw = await env.HEALTH.get(key.name);
    if (raw) {
      try {
        overrides[tag] = JSON.parse(raw);
      } catch {
      }
    }
  }
  return overrides;
}
async function applyServerOverrides(env, servers) {
  const overrides = await getAllServerOverrides(env);
  for (const server of servers) {
    const ov = overrides[server.tag];
    if (!ov) continue;
    if (ov.ip) server.ip = ov.ip;
    if (ov.ipv6 !== void 0) server.ipv6 = ov.ipv6;
    if (ov.enabled !== void 0) server.enabled = ov.enabled;
  }
  return servers;
}
async function storeProbeReport(env, report) {
  if (!env.HEALTH) return false;
  const key = `probe_report:${report.timestamp || (/* @__PURE__ */ new Date()).toISOString()}`;
  await env.HEALTH.put(key, JSON.stringify(report), { expirationTtl: 60 * 60 * 24 * 30 });
  return true;
}
async function getRecentProbeReports(env, limit = 20) {
  if (!env.HEALTH) return [];
  const list = await env.HEALTH.list({ prefix: "probe_report:" });
  const keys = list.keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, limit);
  const reports = [];
  for (const key of keys) {
    const raw = await env.HEALTH.get(key.name);
    if (raw) {
      try {
        reports.push(JSON.parse(raw));
      } catch {
      }
    }
  }
  return reports;
}
async function getHealthData(env) {
  if (!env.HEALTH) return {};
  const raw = await env.HEALTH.get("server_health");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
async function setHealthData(env, data) {
  if (!env.HEALTH) return;
  await env.HEALTH.put("server_health", JSON.stringify(data));
}
async function getCleanIpOverrides(env) {
  if (!env.HEALTH) return null;
  const raw = await env.HEALTH.get("clean_ips");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function setCleanIpOverrides(env, ips) {
  if (!env.HEALTH) return false;
  await env.HEALTH.put("clean_ips", JSON.stringify(ips));
  return true;
}
async function deleteCleanIpOverrides(env) {
  if (!env.HEALTH) return false;
  await env.HEALTH.delete("clean_ips");
  return true;
}
async function trackSubRequest(env, uuid) {
  if (!env.HEALTH) return;
  const key = `sub_hits:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
  const raw = await env.HEALTH.get(key);
  const hits = raw ? JSON.parse(raw) : {};
  hits[uuid] = (hits[uuid] || 0) + 1;
  hits["_total"] = (hits["_total"] || 0) + 1;
  await env.HEALTH.put(key, JSON.stringify(hits), { expirationTtl: 60 * 60 * 24 * 30 });
}
var AUTH_FAIL_WINDOW_SECONDS = 15 * 60;
var AUTH_FAIL_LIMIT = 20;
function authFailKey(clientId) {
  return `authfail:${clientId}`;
}
function clientIdFor(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
async function isAuthThrottled(env, clientId) {
  if (!env.HEALTH) return false;
  const raw = await env.HEALTH.get(authFailKey(clientId));
  if (!raw) return false;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= AUTH_FAIL_LIMIT;
}
async function recordAuthFailure(env, clientId) {
  if (!env.HEALTH) return;
  const key = authFailKey(clientId);
  const raw = await env.HEALTH.get(key);
  const n = raw ? parseInt(raw, 10) : 0;
  await env.HEALTH.put(key, String((Number.isFinite(n) ? n : 0) + 1), {
    expirationTtl: AUTH_FAIL_WINDOW_SECONDS
  });
}
var AUTH_THROTTLE = {
  windowSeconds: AUTH_FAIL_WINDOW_SECONDS,
  limit: AUTH_FAIL_LIMIT
};

// tools/smart-sub/src/probe.ts
function generateProbeScript(config, reportUrl) {
  const servers = config.servers.filter((s) => s.enabled);
  const cdnDomains = [...new Set(
    servers.map((s) => s.cdn_ws?.host).filter((h) => Boolean(h))
  )];
  const serverEntries = servers.map((s) => {
    const protocols = [];
    if (s.reality_pubkey) protocols.push(`reality:${s.reality_port}`);
    if (s.hy2_port) protocols.push(`hy2:${s.hy2_port}`);
    if (s.http_obfs) protocols.push(`http:${s.http_obfs.port}`);
    if (s.finalmask) protocols.push(`xdns:${s.finalmask.xdns_port}:udp`);
    if (s.shadowtls) protocols.push(`stls:${s.shadowtls.port}`);
    if (s.naive) protocols.push(`naive:${s.naive.port}`);
    return `  "${s.tag}|${s.ip}|${protocols.join(",")}"`;
  }).join("\n");
  return `#!/usr/bin/env bash
# \u2500\u2500 VPN Iran Probe Script \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
# Auto-generated by smart-sub worker. Tests VPN reachability from Iran.
# Run: curl -sL <sub-url>/probe | bash
# Or save and run: curl -sL <sub-url>/probe -o probe.sh && chmod +x probe.sh && ./probe.sh
#
# What it tests:
#   1. TCP connectivity to each server (port 443, 80, 8443)
#   2. TLS handshake with Reality SNI domains
#   3. DNS resolution of CDN domains
#   4. HTTPS fetch through CDN (actual connectivity)
#   5. Clean CF IP reachability
#
# Results are POST'd back to the worker, which forwards alerts to Telegram
# server-side. The only credential in this script is a probe-reporting token
# scoped to POST /probe/report \u2014 it grants no other access. No VPN configs,
# no admin credential and no bot token are included.

set -euo pipefail

REPORT_URL="${reportUrl}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RESULTS="[]"

# Colors
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

log() { echo -e "$1"; }

add_result() {
  local test_name="$1" target="$2" status="$3" latency="$4" detail="$5"
  RESULTS=$(echo "$RESULTS" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
data.append({'test': '$test_name', 'target': '$target', 'status': '$status', 'latency_ms': $latency, 'detail': '$detail'})
print(json.dumps(data))
" 2>/dev/null || echo "$RESULTS")
}

log "\\n\${YELLOW}\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\${NC}"
log "\${YELLOW}  VPN Iran Probe \u2014 $(date -u +"%Y-%m-%d %H:%M UTC")\${NC}"
log "\${YELLOW}\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\${NC}\\n"

# \u2500\u2500 Detect ISP \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
log "\${YELLOW}[1/5] Detecting ISP...\${NC}"
ISP_INFO=$(curl -s --connect-timeout 5 https://ipinfo.io/json 2>/dev/null || echo '{}')
MY_IP=$(echo "$ISP_INFO" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('ip','unknown'))" 2>/dev/null || echo "unknown")
MY_ISP=$(echo "$ISP_INFO" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('org','unknown'))" 2>/dev/null || echo "unknown")
MY_COUNTRY=$(echo "$ISP_INFO" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('country','??'))" 2>/dev/null || echo "??")
MY_CITY=$(echo "$ISP_INFO" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('city','unknown'))" 2>/dev/null || echo "unknown")
log "  IP: $MY_IP  ISP: $MY_ISP  Country: $MY_COUNTRY  City: $MY_CITY"

# \u2500\u2500 Test TCP Connectivity \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
log "\\n\${YELLOW}[2/5] Testing TCP connectivity to servers...\${NC}"

SERVERS=(
${serverEntries}
)

for entry in "\${SERVERS[@]}"; do
  IFS='|' read -r TAG IP PROTOCOLS <<< "$entry"

  # Test port 443 (Reality/HAProxy)
  START=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")
  if nc -z -w 5 "$IP" 443 2>/dev/null; then
    END=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")
    LATENCY=$(( (END - START) / 1000000 )) 2>/dev/null || LATENCY=0
    log "  \${GREEN}\u2713\${NC} $TAG ($IP:443) \u2014 \${LATENCY}ms"
    add_result "tcp_443" "$TAG" "up" "$LATENCY" "'port 443 reachable'"
  else
    log "  \${RED}\u2717\${NC} $TAG ($IP:443) \u2014 BLOCKED"
    add_result "tcp_443" "$TAG" "down" "0" "'connection refused or timeout'"
  fi

  # Test port 80 (XrayHTTP/SS2022)
  if nc -z -w 5 "$IP" 80 2>/dev/null; then
    log "  \${GREEN}\u2713\${NC} $TAG ($IP:80)"
    add_result "tcp_80" "$TAG" "up" "0" "'port 80 reachable'"
  else
    log "  \${RED}\u2717\${NC} $TAG ($IP:80) \u2014 BLOCKED"
    add_result "tcp_80" "$TAG" "down" "0" "'port 80 blocked'"
  fi

  # Test port 8443 UDP (Hysteria2) \u2014 best effort
  if command -v nc &>/dev/null && nc -zu -w 3 "$IP" 8443 2>/dev/null; then
    log "  \${GREEN}\u2713\${NC} $TAG ($IP:8443/udp)"
    add_result "udp_8443" "$TAG" "up" "0" "'hy2 port reachable'"
  else
    log "  \${YELLOW}?\${NC} $TAG ($IP:8443/udp) \u2014 unknown (UDP probes unreliable)"
    add_result "udp_8443" "$TAG" "unknown" "0" "'udp probe unreliable'"
  fi
done

# \u2500\u2500 Test TLS Handshake with Reality SNIs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
log "\\n\${YELLOW}[3/5] Testing TLS handshake (Reality SNI)...\${NC}"

REALITY_TESTS=(
  "${servers.map((s) => `${s.ip}|${s.reality_port}|${s.sni}|${s.tag}`).join('"\n  "')}"
)

for entry in "\${REALITY_TESTS[@]}"; do
  IFS='|' read -r IP PORT SNI TAG <<< "$entry"
  START=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")
  if echo | timeout 5 openssl s_client -connect "$IP:$PORT" -servername "$SNI" -verify_return_error 2>/dev/null | grep -q "Verify return code: 0"; then
    END=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")
    LATENCY=$(( (END - START) / 1000000 )) 2>/dev/null || LATENCY=0
    log "  \${GREEN}\u2713\${NC} $TAG TLS\u2192$SNI \u2014 \${LATENCY}ms"
    add_result "tls_reality" "$TAG" "up" "$LATENCY" "'TLS handshake OK with $SNI'"
  else
    log "  \${RED}\u2717\${NC} $TAG TLS\u2192$SNI \u2014 FAILED"
    add_result "tls_reality" "$TAG" "down" "0" "'TLS handshake failed'"
  fi
done

# \u2500\u2500 Test CDN DNS Resolution \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
log "\\n\${YELLOW}[4/5] Testing CDN DNS resolution...\${NC}"

CDN_DOMAINS=(
  ${cdnDomains.map((d) => `"${d}"`).join("\n  ")}
  "sub.example.com"
)

for DOMAIN in "\${CDN_DOMAINS[@]}"; do
  RESOLVED=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
  if [ -n "$RESOLVED" ]; then
    log "  \${GREEN}\u2713\${NC} $DOMAIN \u2192 $RESOLVED"
    add_result "dns_cdn" "$DOMAIN" "up" "0" "'$RESOLVED'"
  else
    log "  \${RED}\u2717\${NC} $DOMAIN \u2014 DNS BLOCKED"
    add_result "dns_cdn" "$DOMAIN" "down" "0" "'DNS resolution failed'"
  fi
done

# \u2500\u2500 Test CDN HTTPS + Clean CF IPs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
log "\\n\${YELLOW}[5/5] Testing CDN HTTPS & Clean CF IPs...\${NC}"

CLEAN_IPS=(${CF_CLEAN_IPS.map((ip) => `"${ip}"`).join(" ")})

for DOMAIN in "\${CDN_DOMAINS[@]}"; do
  # Direct CDN fetch
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "https://$DOMAIN/" 2>/dev/null)
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    log "  \${GREEN}\u2713\${NC} HTTPS $DOMAIN \u2192 HTTP $HTTP_CODE"
    add_result "https_cdn" "$DOMAIN" "up" "0" "'HTTP $HTTP_CODE'"
  else
    log "  \${RED}\u2717\${NC} HTTPS $DOMAIN \u2192 HTTP $HTTP_CODE"
    add_result "https_cdn" "$DOMAIN" "down" "0" "'HTTP $HTTP_CODE'"
  fi
done

# Test clean CF IPs (TLS to CDN domain through clean IP)
for IP in "\${CLEAN_IPS[@]}"; do
  CDN_HOST="${cdnDomains[0] || "cdn.example.com"}"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 \\
    --resolve "\${CDN_HOST}:443:\${IP}" "https://\${CDN_HOST}/" 2>/dev/null)
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "301" ]; then
    log "  \${GREEN}\u2713\${NC} Clean IP $IP \u2192 HTTP $HTTP_CODE"
    add_result "clean_ip" "$IP" "up" "0" "'HTTP $HTTP_CODE via $CDN_HOST'"
  else
    log "  \${RED}\u2717\${NC} Clean IP $IP \u2192 HTTP $HTTP_CODE"
    add_result "clean_ip" "$IP" "down" "0" "'HTTP $HTTP_CODE'"
  fi
done

# \u2500\u2500 Summary & Report \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
TOTAL=$(echo "$RESULTS" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(len(d))" 2>/dev/null || echo "?")
UP=$(echo "$RESULTS" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(sum(1 for r in d if r['status']=='up'))" 2>/dev/null || echo "?")
DOWN=$(echo "$RESULTS" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(sum(1 for r in d if r['status']=='down'))" 2>/dev/null || echo "?")

log "\\n\${YELLOW}\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\${NC}"
log "  Total tests: $TOTAL  |  \${GREEN}Up: $UP\${NC}  |  \${RED}Down: $DOWN\${NC}"
log "\${YELLOW}\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\${NC}"

# Build report JSON
REPORT=$(python3 -c "
import json
results = json.loads('''$RESULTS''')
report = {
  'timestamp': '$TIMESTAMP',
  'isp': '$MY_ISP',
  'country': '$MY_COUNTRY',
  'city': '$MY_CITY',
  'ip_prefix': '.'.join('$MY_IP'.split('.')[:2]) + '.x.x',
  'total_tests': len(results),
  'up': sum(1 for r in results if r['status'] == 'up'),
  'down': sum(1 for r in results if r['status'] == 'down'),
  'unknown': sum(1 for r in results if r['status'] == 'unknown'),
  'results': results,
}
print(json.dumps(report))
" 2>/dev/null)

# POST results back to worker
if [ -n "$REPORT_URL" ] && [ "$REPORT_URL" != "null" ]; then
  log "\\nSending report to worker..."
  RESP=$(curl -s -X POST "$REPORT_URL" \\
    -H "Content-Type: application/json" \\
    -d "$REPORT" 2>/dev/null)
  log "  Response: $RESP"
fi

# Telegram alerts are sent server-side by /probe/report

log "\\n\${GREEN}Done!\${NC} Results have been reported."
`;
}

// tools/smart-sub/src/generators.ts
function generateRealityURI(server, uuid) {
  const params = new URLSearchParams({
    encryption: "none",
    flow: "xtls-rprx-vision",
    security: "reality",
    sni: server.sni,
    fp: "chrome",
    pbk: server.reality_pubkey,
    sid: server.reality_short_id,
    type: "tcp"
  });
  return `vless://${uuid}@${server.ip}:${server.reality_port}?${params}#Reality-${server.location}`;
}
function generateHy2URI(server, uuid) {
  const params = new URLSearchParams({
    insecure: "1",
    sni: server.sni
  });
  return `hy2://${uuid}@${server.ip}:${server.hy2_port}?${params}#Hysteria2-${server.location}`;
}
function generateIPv6RealityURI(server, uuid) {
  if (!server.ipv6) return null;
  const params = new URLSearchParams({
    encryption: "none",
    flow: "xtls-rprx-vision",
    security: "reality",
    sni: server.sni,
    fp: "chrome",
    pbk: server.reality_pubkey,
    sid: server.reality_short_id,
    type: "tcp"
  });
  return `vless://${uuid}@[${server.ipv6}]:${server.reality_port}?${params}#Reality-IPv6-${server.location}`;
}
function generateIPv6Hy2URI(server, uuid) {
  if (!server.ipv6) return null;
  const params = new URLSearchParams({
    insecure: "1",
    sni: server.sni
  });
  return `hy2://${uuid}@[${server.ipv6}]:${server.hy2_port}?${params}#Hy2-IPv6-${server.location}`;
}
function generateAmneziaWGURI(server, _uuid) {
  if (!server.amneziawg) return null;
  const awg = server.amneziawg;
  const config = [
    "[Interface]",
    `Address = ${awg["client_addr"]}/24`,
    `DNS = ${awg["dns"]}`,
    `PrivateKey = ${awg["client_private_key"]}`,
    `Jc = ${awg["jc"]}`,
    `Jmin = ${awg["jmin"]}`,
    `Jmax = ${awg["jmax"]}`,
    `S1 = ${awg["s1"]}`,
    `S2 = ${awg["s2"]}`,
    `H1 = ${awg["h1"]}`,
    `H2 = ${awg["h2"]}`,
    `H3 = ${awg["h3"]}`,
    `H4 = ${awg["h4"]}`,
    "",
    "[Peer]",
    `PublicKey = ${awg["public_key"]}`,
    `PresharedKey = ${awg["psk"]}`,
    `Endpoint = ${server.ip}:${awg["port"]}`,
    `AllowedIPs = 0.0.0.0/0, ::/0`,
    `PersistentKeepalive = 25`
  ].join("\n");
  const encoded = btoa(config);
  return `awg://${encoded}#AWG-${server.location}`;
}
function generateCdnWsURI(server, uuid, opts = {}) {
  if (!server.cdn_ws) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "tls",
    sni: server.cdn_ws.host,
    host: server.cdn_ws.host,
    path: server.cdn_ws.path,
    type: "ws",
    fp: "chrome",
    alpn: "h2,http/1.1"
  });
  const frag = opts.fragmentSettings || (opts.fragment ? FRAGMENT : null);
  if (frag) {
    params.set("fragment", `${frag.packets},${frag.length},${frag.interval}`);
  }
  if (opts.mux) {
    params.set("mux", MUX.protocol);
    params.set("muxPadding", "true");
    params.set("muxMaxConcurrency", String(MUX.maxConcurrency));
  }
  const addr = opts.address || server.cdn_ws.host;
  const suffix = opts.nameSuffix || "";
  return `vless://${uuid}@${addr}:${server.cdn_ws.port}?${params}#CDN-WS${suffix}-${server.location}`;
}
function generateXhttpCdnURI(server, uuid, opts = {}) {
  if (!server.xhttp_cdn) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "tls",
    sni: server.xhttp_cdn.host,
    host: server.xhttp_cdn.host,
    path: server.xhttp_cdn.path,
    type: "xhttp",
    mode: "packet-up",
    fp: "chrome",
    alpn: "h2,http/1.1"
  });
  const frag = opts.fragmentSettings || (opts.fragment ? FRAGMENT : null);
  if (frag) {
    params.set("fragment", `${frag.packets},${frag.length},${frag.interval}`);
  }
  if (opts.mux) {
    params.set("mux", MUX.protocol);
    params.set("muxPadding", "true");
    params.set("muxMaxConcurrency", String(MUX.maxConcurrency));
  }
  const addr = opts.address || server.xhttp_cdn.host;
  const suffix = opts.nameSuffix || "";
  return `vless://${uuid}@${addr}:${server.xhttp_cdn.port}?${params}#XHTTP-CDN${suffix}-${server.location}`;
}
function generateGrpcCdnURI(server, uuid, opts = {}) {
  if (!server.grpc_cdn) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "tls",
    sni: server.grpc_cdn.host,
    type: "grpc",
    serviceName: server.grpc_cdn.serviceName,
    mode: "gun",
    fp: "chrome",
    alpn: "h2"
  });
  const frag = opts.fragmentSettings || (opts.fragment ? FRAGMENT : null);
  if (frag) {
    params.set("fragment", `${frag.packets},${frag.length},${frag.interval}`);
  }
  const addr = opts.address || server.grpc_cdn.host;
  const suffix = opts.nameSuffix || "";
  return `vless://${uuid}@${addr}:${server.grpc_cdn.port}?${params}#gRPC-CDN${suffix}-${server.location}`;
}
function generateHttpObfsURI(server, uuid) {
  if (!server.http_obfs) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "tcp",
    headerType: "http",
    host: server.http_obfs.host,
    path: server.http_obfs.path
  });
  return `vless://${uuid}@${server.ip}:${server.http_obfs.port}?${params}#XrayHTTP-${server.location}`;
}
function generateHttpObfsMultiHostURIs(server, uuid, isp) {
  if (!server.http_obfs) return [];
  const ispHosts = isp && ISP_HOST_PRIORITY[isp];
  const hostList = ispHosts || WHITELISTED_HOSTS;
  return hostList.filter((h) => h !== server.http_obfs.host).map((host) => {
    const params = new URLSearchParams({
      encryption: "none",
      security: "none",
      type: "tcp",
      headerType: "http",
      host,
      path: server.http_obfs.path
    });
    const parts = host.split(".");
    const domainPart = parts.length >= 2 ? parts.at(-2) : parts[0];
    const tag = domainPart.slice(0, 5);
    return `vless://${uuid}@${server.ip}:${server.http_obfs.port}?${params}#XrayHTTP-${tag}-${server.location}`;
  });
}
function generateSs2022URI(server, _uuid) {
  if (!server.ss2022) return null;
  const password = `${server.ss2022.server_key}:${server.ss2022.user_key}`;
  const userInfo = `${server.ss2022.method}:${password}`;
  const encoded = btoa(userInfo);
  return `ss://${encoded}@${server.ip}:${server.ss2022.port}#SS2022-${server.location}`;
}
function generateNaiveURI(server, _uuid) {
  if (!server.naive) return null;
  return `naive+https://${server.naive.user}:${server.naive.pass}@${server.naive.host}:${server.naive.port}#Naive-${server.location}`;
}
function generateXhttpCdnCleanIPURIs(server, uuid, opts = {}, cleanIps) {
  if (!server.xhttp_cdn) return [];
  const ips = cleanIps || CF_CLEAN_IPS;
  return ips.map(
    (ip, i) => generateXhttpCdnURI(server, uuid, {
      address: ip,
      nameSuffix: `-CF${i + 1}`,
      fragment: opts.fragment || false,
      fragmentSettings: opts.fragmentSettings || null,
      mux: opts.mux || false
    })
  ).filter((u) => u !== null);
}
function generateCdnWsCleanIPURIs(server, uuid, opts = {}, cleanIps) {
  if (!server.cdn_ws) return [];
  const ips = cleanIps || CF_CLEAN_IPS;
  return ips.map(
    (ip, i) => generateCdnWsURI(server, uuid, {
      address: ip,
      nameSuffix: `-CF${i + 1}`,
      fragment: opts.fragment || false,
      fragmentSettings: opts.fragmentSettings || null,
      mux: opts.mux || false
    })
  ).filter((u) => u !== null);
}
function generateGrpcCdnCleanIPURIs(server, uuid, opts = {}, cleanIps) {
  if (!server.grpc_cdn) return [];
  const ips = (cleanIps || CF_CLEAN_IPS).slice(0, 3);
  return ips.map(
    (ip, i) => generateGrpcCdnURI(server, uuid, {
      address: ip,
      nameSuffix: `-CF${i + 1}`,
      fragment: opts.fragment || false,
      fragmentSettings: opts.fragmentSettings || null
    })
  ).filter((u) => u !== null);
}
function generateEdtunnelURIs(uuid, edtunnel) {
  return edtunnel.pages.map((host, i) => {
    const params = new URLSearchParams({
      encryption: "none",
      security: "tls",
      sni: host,
      host,
      path: edtunnel.path,
      type: "ws",
      fp: "chrome"
    });
    return `vless://${uuid}@${host}:${edtunnel.port}?${params}#EDtunnel-${i + 1}`;
  });
}
function generateEdtunnelCleanIPURIs(uuid, edtunnel) {
  const uris = [];
  for (const host of edtunnel.pages) {
    for (let i = 0; i < CF_CLEAN_IPS.length; i++) {
      const params = new URLSearchParams({
        encryption: "none",
        security: "tls",
        sni: host,
        host,
        path: edtunnel.path,
        type: "ws",
        fp: "chrome"
      });
      uris.push(`vless://${uuid}@${CF_CLEAN_IPS[i]}:${edtunnel.port}?${params}#EDtunnel-CF${i + 1}`);
    }
    break;
  }
  return uris;
}
function generateFinalmaskXdnsURI(server, uuid) {
  if (!server.finalmask || !server.finalmask.xdns_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "dns",
    seed: server.finalmask.seed
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.xdns_port}?${params}#Finalmask-XDNS-${server.location}`;
}
function generateFinalmaskXicmpURI(server, uuid) {
  if (!server.finalmask || !server.finalmask.xicmp_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "utp",
    seed: server.finalmask.seed
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.xicmp_port}?${params}#Finalmask-XICMP-${server.location}`;
}
function generateFinalmaskWechatURI(server, uuid) {
  if (!server.finalmask || !server.finalmask.wechat_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "wechat-video",
    seed: server.finalmask.seed
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.wechat_port}?${params}#Finalmask-WeChat-${server.location}`;
}
function generateFinalmaskDtlsURI(server, uuid) {
  if (!server.finalmask || !server.finalmask.dtls_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "dtls",
    seed: server.finalmask.seed
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.dtls_port}?${params}#Finalmask-DTLS-${server.location}`;
}
function generateFinalmaskSrtpURI(server, uuid) {
  if (!server.finalmask || !server.finalmask.srtp_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "srtp",
    seed: server.finalmask.seed
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.srtp_port}?${params}#Finalmask-SRTP-${server.location}`;
}
function generateHy2HopURI(server, uuid) {
  if (!server.hy2_hop) return null;
  const params = new URLSearchParams({
    insecure: "1",
    sni: server.sni,
    obfs: "salamander",
    "obfs-password": server.hy2_hop.salamander_password
  });
  return `hy2://${uuid}@${server.ip}:${server.hy2_hop.port_range}?${params}#Hy2-Hop-${server.location}`;
}
function generateShadowTLSURI(server, _uuid) {
  if (!server.shadowtls || !server.ss2022) return null;
  const innerPassword = `${server.ss2022.server_key}:${server.ss2022.user_key}`;
  const config = {
    type: "shadowtls",
    tag: `ShadowTLS-${server.location}`,
    server: server.ip,
    server_port: server.shadowtls.port,
    version: 3,
    password: server.shadowtls.password,
    tls: {
      enabled: true,
      server_name: server.shadowtls.handshake_server,
      utls: { enabled: true, fingerprint: "chrome" }
    },
    detour: `shadowtls-ss-${server.tag}`
  };
  const innerConfig = {
    type: "shadowsocks",
    tag: `shadowtls-ss-${server.tag}`,
    method: server.ss2022.method,
    password: innerPassword,
    multiplex: { enabled: true, padding: true }
  };
  const shareData = btoa(JSON.stringify([config, innerConfig]));
  return `sing-box://import-outbound?data=${shareData}#ShadowTLS-${server.location}`;
}
function generateAnyTlsURI(server, _uuid) {
  if (!server.anytls) return null;
  const anytls = server.anytls;
  const config = {
    type: "anytls",
    tag: `AnyTLS-${server.location}`,
    server: server.ip,
    server_port: anytls["port"],
    password: anytls["password"],
    idle_timeout: "15m",
    tls: {
      enabled: true,
      server_name: anytls["sni"] || server.sni || "www.google.com",
      utls: { enabled: true, fingerprint: "chrome" }
    }
  };
  const shareData = btoa(JSON.stringify([config]));
  return `sing-box://import-outbound?data=${shareData}#AnyTLS-${server.location}`;
}
function generateCloakSs2022URI(server, _uuid) {
  if (!server.cloak || !server.ss2022) return null;
  const password = `${server.ss2022.server_key}:${server.ss2022.user_key}`;
  const userInfo = `${server.ss2022.method}:${password}`;
  const encoded = btoa(userInfo);
  const pluginOpts = [
    `UID=${server.cloak.uid}`,
    `PublicKey=${server.cloak.public_key}`,
    `ServerName=${server.cloak.server_name}`,
    `BrowserSig=${server.cloak.browser_sig}`,
    `EncryptionMethod=${server.cloak.encryption}`,
    `Transport=direct`,
    `ProxyMethod=shadowsocks`
  ].join(";");
  const pluginParam = encodeURIComponent(`ck-client;${pluginOpts}`);
  return `ss://${encoded}@${server.ip}:${server.cloak.port}/?plugin=${pluginParam}#Cloak-${server.location}`;
}
function generateRelayServerConfigs(server, uuid) {
  const configs = [];
  const anyTls = generateAnyTlsURI(server, uuid);
  if (anyTls) configs.push(anyTls);
  const stls = generateShadowTLSURI(server, uuid);
  if (stls) configs.push(stls);
  return configs;
}
function generateRelayRealityURI(server, uuid) {
  if (!server.relay) return null;
  const relay = server.relay;
  const params = new URLSearchParams({
    encryption: "none",
    flow: "xtls-rprx-vision",
    security: "reality",
    sni: server.sni,
    fp: "chrome",
    pbk: server.reality_pubkey,
    sid: server.reality_short_id,
    type: "tcp"
  });
  return `vless://${uuid}@${relay["ip"]}:${server.reality_port}?${params}#Relay-Reality-${server.location}`;
}
function generateRelayHy2URI(server, uuid) {
  if (!server.relay) return null;
  const relay = server.relay;
  const params = new URLSearchParams({
    insecure: "1",
    sni: server.sni
  });
  return `hy2://${uuid}@${relay["ip"]}:${server.hy2_port}?${params}#Relay-Hy2-${server.location}`;
}
function generateRelaySs2022URI(server, _uuid) {
  if (!server.relay || !server.ss2022) return null;
  const relay = server.relay;
  const password = `${server.ss2022.server_key}:${server.ss2022.user_key}`;
  const userInfo = `${server.ss2022.method}:${password}`;
  const encoded = btoa(userInfo);
  return `ss://${encoded}@${relay["ip"]}:${server.ss2022.port}#Relay-SS2022-${server.location}`;
}
function generateMTProtoLink(server) {
  if (!server.mtproto) return null;
  const { port, secret } = server.mtproto;
  return `https://t.me/proxy?server=${server.ip}&port=${port}&secret=${secret}`;
}
function generateRealityAltSNIURIs(server, uuid) {
  if (!server.reality_pubkey) return [];
  const uris = [];
  for (const sni of ALT_REALITY_SNIS) {
    if (sni === server.sni) continue;
    const params = new URLSearchParams({
      encryption: "none",
      flow: "xtls-rprx-vision",
      security: "reality",
      sni,
      fp: "chrome",
      pbk: server.reality_pubkey,
      sid: server.reality_short_id,
      type: "tcp"
    });
    uris.push(`vless://${uuid}@${server.ip}:${server.reality_port}?${params}#Reality-${sni.split(".")[0]}-${server.location}`);
  }
  return uris;
}
function generateRelayXhttpURIs(server, uuid, relayHosts, provider, opts = {}) {
  if (!server.xhttp_cdn || !relayHosts.length) return [];
  const uris = [];
  for (const relay of relayHosts) {
    const relayPath = `/relay/${server.xhttp_cdn.host}${server.xhttp_cdn.path}`;
    const params = new URLSearchParams({
      encryption: "none",
      security: "tls",
      sni: relay,
      host: relay,
      path: relayPath,
      type: "xhttp",
      mode: "packet-up",
      fp: "chrome",
      alpn: "h2,http/1.1"
    });
    const frag = opts.fragmentSettings || (opts.fragment ? FRAGMENT : null);
    if (frag) {
      params.set("fragment", `${frag.packets},${frag.length},${frag.interval}`);
    }
    if (opts.mux) {
      params.set("mux", MUX.protocol);
      params.set("muxPadding", "true");
    }
    uris.push(`vless://${uuid}@${relay}:443?${params}#XHTTP-${provider}-${server.location}`);
  }
  return uris;
}
function generateRelayCdnWsURIs(server, uuid, relayHosts, provider, opts = {}) {
  if (!server.cdn_ws || !relayHosts.length) return [];
  if (provider === "Netlify") return [];
  const uris = [];
  for (const relay of relayHosts) {
    const relayPath = `/relay/${server.cdn_ws.host}${server.cdn_ws.path}`;
    const params = new URLSearchParams({
      encryption: "none",
      security: "tls",
      sni: relay,
      host: relay,
      path: relayPath,
      type: "ws",
      fp: "chrome",
      alpn: "h2,http/1.1"
    });
    const frag = opts.fragmentSettings || (opts.fragment ? FRAGMENT : null);
    if (frag) {
      params.set("fragment", `${frag.packets},${frag.length},${frag.interval}`);
    }
    if (opts.mux) {
      params.set("mux", MUX.protocol);
      params.set("muxPadding", "true");
    }
    uris.push(`vless://${uuid}@${relay}:443?${params}#CDN-WS-${provider}-${server.location}`);
  }
  return uris;
}

// tools/smart-sub/src/singbox.ts
function parseVlessURI(uri) {
  const hashIdx = uri.indexOf("#");
  const tag = hashIdx >= 0 ? decodeURIComponent(uri.substring(hashIdx + 1)) : "vless";
  const mainPart = hashIdx >= 0 ? uri.substring(8, hashIdx) : uri.substring(8);
  const [userHost, query] = mainPart.split("?");
  if (!userHost || !query) return null;
  const atIdx = userHost.indexOf("@");
  if (atIdx < 0) return null;
  const uuid = userHost.substring(0, atIdx);
  const hostPort = userHost.substring(atIdx + 1);
  const colonIdx = hostPort.lastIndexOf(":");
  const server = hostPort.substring(0, colonIdx);
  const port = parseInt(hostPort.substring(colonIdx + 1), 10);
  const params = new URLSearchParams(query);
  const transport = params.get("type") || "tcp";
  const security = params.get("security") || "none";
  const outbound = {
    type: "vless",
    tag,
    server: server.replace(/^\[|\]$/g, ""),
    // strip IPv6 brackets
    server_port: port,
    uuid,
    flow: params.get("flow") || void 0
  };
  if (security === "tls") {
    outbound.tls = {
      enabled: true,
      server_name: params.get("sni") || params.get("host") || "",
      utls: { enabled: true, fingerprint: params.get("fp") || "chrome" },
      alpn: params.get("alpn")?.split(",") || void 0
    };
  } else if (security === "reality") {
    outbound.tls = {
      enabled: true,
      server_name: params.get("sni") || "",
      utls: { enabled: true, fingerprint: params.get("fp") || "chrome" },
      reality: {
        enabled: true,
        public_key: params.get("pbk") || "",
        short_id: params.get("sid") || ""
      }
    };
  }
  if (transport === "ws") {
    outbound.transport = {
      type: "ws",
      path: params.get("path") || "/",
      headers: { Host: params.get("host") || params.get("sni") || "" }
    };
  } else if (transport === "xhttp") {
    outbound.transport = {
      type: "httpupgrade",
      path: params.get("path") || "/",
      host: params.get("host") || params.get("sni") || ""
    };
  } else if (transport === "grpc") {
    outbound.transport = {
      type: "grpc",
      service_name: params.get("serviceName") || ""
    };
  } else if (transport === "tcp" && params.get("headerType") === "http") {
    outbound.transport = {
      type: "http",
      host: [params.get("host") || ""],
      path: params.get("path") || "/"
    };
  }
  const fragment = params.get("fragment");
  if (fragment) {
    const [packets, length, interval] = fragment.split(",");
    outbound.tls_fragment = { enabled: true, packets, length, interval };
  }
  const mux = params.get("mux");
  if (mux) {
    outbound.multiplex = {
      enabled: true,
      protocol: mux,
      max_connections: parseInt(params.get("muxMaxConcurrency") || "8", 10),
      padding: params.get("muxPadding") === "true"
    };
  }
  if (!outbound.flow) delete outbound.flow;
  return outbound;
}
function parseHy2URI(uri) {
  const hashIdx = uri.indexOf("#");
  const tag = hashIdx >= 0 ? decodeURIComponent(uri.substring(hashIdx + 1)) : "hysteria2";
  const mainPart = hashIdx >= 0 ? uri.substring(6, hashIdx) : uri.substring(6);
  const [userHost, query] = mainPart.split("?");
  if (!userHost) return null;
  const atIdx = userHost.indexOf("@");
  const password = atIdx >= 0 ? userHost.substring(0, atIdx) : "";
  const hostPort = atIdx >= 0 ? userHost.substring(atIdx + 1) : userHost;
  const colonIdx = hostPort.lastIndexOf(":");
  const server = hostPort.substring(0, colonIdx).replace(/^\[|\]$/g, "");
  const portStr = hostPort.substring(colonIdx + 1);
  const params = query ? new URLSearchParams(query) : new URLSearchParams();
  const outbound = {
    type: "hysteria2",
    tag,
    server,
    server_port: parseInt(portStr.split("-")[0], 10),
    // first port if range
    password,
    tls: {
      enabled: true,
      server_name: params.get("sni") || "",
      insecure: params.get("insecure") === "1"
    }
  };
  if (params.get("obfs") === "salamander") {
    outbound.obfs = {
      type: "salamander",
      password: params.get("obfs-password") || ""
    };
  }
  if (portStr.includes("-")) {
    outbound.server_port = parseInt(portStr.split("-")[0], 10);
    outbound.hop_ports = portStr;
  }
  return outbound;
}
function parseSsURI(uri) {
  const hashIdx = uri.indexOf("#");
  const tag = hashIdx >= 0 ? decodeURIComponent(uri.substring(hashIdx + 1)) : "shadowsocks";
  const mainPart = hashIdx >= 0 ? uri.substring(5, hashIdx) : uri.substring(5);
  const atIdx = mainPart.lastIndexOf("@");
  if (atIdx < 0) return null;
  const encoded = mainPart.substring(0, atIdx);
  const hostPortPlugin = mainPart.substring(atIdx + 1);
  let decoded;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }
  const methodColonIdx = decoded.indexOf(":");
  if (methodColonIdx < 0) return null;
  const method = decoded.substring(0, methodColonIdx);
  const password = decoded.substring(methodColonIdx + 1);
  const qIdx = hostPortPlugin.indexOf("?");
  const hostPort = qIdx >= 0 ? hostPortPlugin.substring(0, qIdx) : hostPortPlugin;
  const colonIdx = hostPort.lastIndexOf(":");
  const server = hostPort.substring(0, colonIdx).replace(/^\[|\]$/g, "");
  const port = parseInt(hostPort.substring(colonIdx + 1).replace(/\/$/, ""), 10);
  if (qIdx >= 0 && hostPortPlugin.includes("ck-client")) return null;
  return {
    type: "shadowsocks",
    tag,
    server,
    server_port: port,
    method,
    password
  };
}
function parseSingBoxURI(uri) {
  const hashIdx = uri.indexOf("#");
  const main = hashIdx >= 0 ? uri.substring(0, hashIdx) : uri;
  const match = main.match(/data=([A-Za-z0-9+/=]+)/);
  if (!match) return [];
  try {
    const json = atob(match[1]);
    return JSON.parse(json);
  } catch {
    return [];
  }
}
function buildSingBoxConfig(uris) {
  const outbounds = [];
  for (const uri of uris) {
    let parsed = null;
    if (uri.startsWith("vless://")) {
      parsed = parseVlessURI(uri);
    } else if (uri.startsWith("hy2://")) {
      parsed = parseHy2URI(uri);
    } else if (uri.startsWith("ss://")) {
      parsed = parseSsURI(uri);
    } else if (uri.startsWith("sing-box://")) {
      parsed = parseSingBoxURI(uri);
    } else if (uri.startsWith("naive+") || uri.startsWith("awg://")) {
      continue;
    }
    if (parsed) {
      if (Array.isArray(parsed)) {
        outbounds.push(...parsed);
      } else {
        outbounds.push(parsed);
      }
    }
  }
  const proxyTags = outbounds.map((o) => o.tag);
  return {
    log: { level: "warn" },
    dns: {
      servers: [
        { tag: "dns-remote", address: "https://1.1.1.1/dns-query", detour: "auto" },
        { tag: "dns-direct", address: "local" }
      ]
    },
    outbounds: [
      {
        type: "urltest",
        tag: "auto",
        outbounds: proxyTags,
        url: "https://www.gstatic.com/generate_204",
        interval: "5m",
        tolerance: 200
      },
      {
        type: "selector",
        tag: "manual",
        outbounds: ["auto", ...proxyTags],
        default: "auto"
      },
      ...outbounds,
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
      { type: "dns", tag: "dns-out" }
    ],
    route: {
      rules: [
        { protocol: "dns", outbound: "dns-out" }
      ],
      auto_detect_interface: true,
      final: "manual"
    }
  };
}

// tools/smart-sub/src/index.ts
function truncateHitKeys(hits) {
  const out = {};
  for (const [uuid, count] of Object.entries(hits)) {
    out[uuid.substring(0, 8) + "..."] = count;
  }
  return out;
}
function isExpired(expires) {
  const t = new Date(expires).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() > t;
}
async function adminGate(request, url, env, adminUuid, status = 401, message = "Unauthorized") {
  const clientId = clientIdFor(request);
  if (await isAuthThrottled(env, clientId)) {
    return jsonResponse({ error: "Too Many Requests" }, 429);
  }
  if (!await isAdminRequest(request, url, env.ADMIN_TOKEN, adminUuid)) {
    await recordAuthFailure(env, clientId);
    return jsonResponse({ error: message }, status);
  }
  return null;
}
function normalizeExpires(value) {
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value !== "string") return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
var index_default = {
  async fetch(request, env) {
    try {
      const config = buildConfig(env);
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === "/health") {
        const isAdmin = await isAdminRequest(request, url, env.ADMIN_TOKEN, config.adminUuid);
        const healthData = await getHealthData(env);
        const visibleServers = isAdmin ? config.servers.filter((s) => s.enabled) : config.servers.filter((s) => s.enabled && (!s.geo_restrict || s.geo_restrict.length === 0));
        const results = visibleServers.map((server) => {
          const health = healthData[server.tag] || { status: "unknown", last_check: null };
          const entry = {
            tag: server.tag,
            location: server.location,
            protocols: [
              server.reality_pubkey ? "reality" : null,
              server.hy2_port ? "hysteria2" : null,
              server.has_dns_tunnel ? "dns-tunnel" : null,
              server.finalmask ? "finalmask" : null,
              server.shadowtls ? "shadowtls-v3" : null,
              server.hy2_hop ? "hy2-salamander" : null,
              server.naive ? "naiveproxy" : null,
              server.anytls ? "anytls" : null,
              server.is_relay ? "relay" : null
            ].filter(Boolean),
            health: health.status,
            latency_ms: health["latency_ms"],
            last_check: health.last_check
          };
          if (isAdmin) {
            entry["ip"] = server.ip;
            entry["provider"] = server.provider;
            entry["enabled"] = server.enabled;
          }
          return entry;
        });
        return jsonResponse({
          servers: results,
          server_count: results.length,
          checked_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      if (path === "/health/report" && request.method === "POST") {
        const healthGate = await adminGate(request, url, env, config.adminUuid);
        if (healthGate) return healthGate;
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        const healthData = await getHealthData(env);
        const bodyResults = body["results"] || [];
        for (const result of bodyResults) {
          const tag = result["tag"];
          healthData[tag] = {
            status: result["status"],
            latency_ms: result["latency_ms"],
            last_check: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        await setHealthData(env, healthData);
        return jsonResponse({ ok: true, updated: bodyResults.length });
      }
      if (path.startsWith("/admin/")) {
        const adminApiGate = await adminGate(request, url, env, config.adminUuid);
        if (adminApiGate) return adminApiGate;
        if (path === "/admin/users" && request.method === "GET") {
          const allUsers = await resolveAllUsers(env, config.envUsers);
          const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
          const todayHits = env.HEALTH ? JSON.parse(await env.HEALTH.get(`sub_hits:${today}`) || "{}") : {};
          const userList = Object.entries(allUsers).map(([uuid2, u]) => ({
            uuid: uuid2,
            name: u.name,
            tier: u.tier,
            enabled: u.enabled,
            source: u.source || "env",
            expires: u.expires || null,
            created_at: u.created_at || null,
            today_hits: todayHits[uuid2] || 0
          }));
          return jsonResponse({ users: userList, total: userList.length });
        }
        if (path === "/admin/users" && request.method === "POST") {
          let body;
          try {
            body = await request.json();
          } catch {
            return jsonResponse({ error: "Invalid JSON" }, 400);
          }
          const name = body["name"];
          if (!name) return jsonResponse({ error: "name is required" }, 400);
          const newUuid = crypto.randomUUID();
          const userData = {
            name,
            tier: body["tier"] || "premium",
            enabled: true,
            expires: normalizeExpires(body["expires"]),
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          const ok = await setKvUser(env, newUuid, { ...userData, tier: userData.tier });
          if (!ok) return jsonResponse({ error: "KV not available" }, 503);
          return jsonResponse({
            uuid: newUuid,
            sub_url: `${url.origin}/sub/${newUuid}`,
            ...userData
          }, 201);
        }
        const patchMatch = path.match(/^\/admin\/users\/([0-9a-f-]+)$/i);
        if (patchMatch && request.method === "PATCH") {
          const targetUuid = patchMatch[1].toLowerCase();
          if (!isValidUUID(targetUuid)) {
            return jsonResponse({ error: "Invalid UUID" }, 400);
          }
          let body;
          try {
            body = await request.json();
          } catch {
            return jsonResponse({ error: "Invalid JSON" }, 400);
          }
          const current = await resolveUser(env, targetUuid, config.envUsers);
          if (!current) return jsonResponse({ error: "User not found" }, 404);
          const updated = {
            name: body["name"] !== void 0 ? body["name"] : current.name,
            tier: body["tier"] !== void 0 ? body["tier"] : current.tier,
            enabled: body["enabled"] !== void 0 ? body["enabled"] : current.enabled,
            expires: body["expires"] !== void 0 ? normalizeExpires(body["expires"]) : current.expires || null,
            created_at: current.created_at || (/* @__PURE__ */ new Date()).toISOString()
          };
          const ok = await setKvUser(env, targetUuid, updated);
          if (!ok) return jsonResponse({ error: "KV not available" }, 503);
          return jsonResponse({ uuid: targetUuid, ...updated, source: "kv" });
        }
        const deleteMatch = path.match(/^\/admin\/users\/([0-9a-f-]+)$/i);
        if (deleteMatch && request.method === "DELETE") {
          const targetUuid = deleteMatch[1].toLowerCase();
          if (!isValidUUID(targetUuid)) {
            return jsonResponse({ error: "Invalid UUID" }, 400);
          }
          if (targetUuid === config.adminUuid) {
            return jsonResponse({ error: "Cannot delete admin user" }, 403);
          }
          await deleteKvUser(env, targetUuid);
          return jsonResponse({ ok: true, deleted: targetUuid });
        }
        if (path === "/admin/servers" && request.method === "GET") {
          const overrides = await getAllServerOverrides(env);
          const serverList = config.servers.map((s) => {
            const ov = overrides[s.tag] || null;
            return {
              tag: s.tag,
              location: s.location,
              provider: s.provider,
              ip: ov?.ip || s.ip,
              ipv6: ov?.ipv6 !== void 0 ? ov.ipv6 : s.ipv6 || null,
              enabled: ov?.enabled !== void 0 ? ov.enabled : s.enabled,
              has_override: !!ov,
              override: ov,
              env_ip: s.ip
            };
          });
          return jsonResponse({ servers: serverList, total: serverList.length });
        }
        const serverPatchMatch = path.match(/^\/admin\/servers\/([a-z0-9-]+)$/i);
        if (serverPatchMatch && request.method === "PATCH") {
          const tag = serverPatchMatch[1].toLowerCase();
          const server = config.servers.find((s) => s.tag === tag);
          if (!server) return jsonResponse({ error: "Server not found" }, 404);
          let body;
          try {
            body = await request.json();
          } catch {
            return jsonResponse({ error: "Invalid JSON" }, 400);
          }
          const current = await getServerOverride(env, tag) || {};
          const updated = { ...current };
          if (body["ip"] !== void 0) {
            if (!isValidHostOrIp(body["ip"])) {
              return jsonResponse({ error: "ip must be a valid IPv4/IPv6 address or hostname" }, 400);
            }
            updated["ip"] = body["ip"].trim();
          }
          if (body["ipv6"] !== void 0) {
            if (!isValidHostOrIp(body["ipv6"])) {
              return jsonResponse({ error: "ipv6 must be a valid address" }, 400);
            }
            updated["ipv6"] = body["ipv6"].trim();
          }
          if (body["enabled"] !== void 0) updated["enabled"] = body["enabled"];
          updated["updated_at"] = (/* @__PURE__ */ new Date()).toISOString();
          const ok = await setServerOverride(env, tag, updated);
          if (!ok) return jsonResponse({ error: "KV not available" }, 503);
          return jsonResponse({ tag, override: updated, env_ip: server.ip });
        }
        const serverDeleteMatch = path.match(/^\/admin\/servers\/([a-z0-9-]+)$/i);
        if (serverDeleteMatch && request.method === "DELETE") {
          const tag = serverDeleteMatch[1].toLowerCase();
          const server = config.servers.find((s) => s.tag === tag);
          if (!server) return jsonResponse({ error: "Server not found" }, 404);
          await deleteServerOverride(env, tag);
          return jsonResponse({ ok: true, tag, reverted_to: server.ip });
        }
        if (path === "/admin/probes" && request.method === "GET") {
          const limitParam = parseInt(url.searchParams.get("limit") || "20", 10);
          const limit = Math.min(Math.max(limitParam, 1), 100);
          const reports = await getRecentProbeReports(env, limit);
          const summary = {
            total_reports: reports.length,
            unique_isps: [...new Set(reports.map((r) => r.isp).filter((v) => Boolean(v)))],
            unique_cities: [...new Set(reports.map((r) => r.city).filter((v) => Boolean(v)))],
            latest_report: reports[0]?.timestamp || null,
            aggregate: {}
          };
          for (const report of reports) {
            for (const result of report.results || []) {
              if (result.tag && result["test"] === "tcp_443") {
                const key = result.tag;
                if (!summary.aggregate[key]) {
                  summary.aggregate[key] = { up: 0, down: 0, total: 0 };
                }
                summary.aggregate[key].total++;
                if (result.status === "up") summary.aggregate[key].up++;
                if (result.status === "down") summary.aggregate[key].down++;
              }
            }
          }
          return jsonResponse({ summary, reports });
        }
        if (path === "/admin/probes" && request.method === "DELETE") {
          if (!env.HEALTH) return jsonResponse({ error: "KV not available" }, 503);
          const list = await env.HEALTH.list({ prefix: "probe_report:" });
          let deleted = 0;
          for (const key of list.keys) {
            await env.HEALTH.delete(key.name);
            deleted++;
          }
          return jsonResponse({ ok: true, deleted });
        }
        if (path === "/admin/clean-ips" && request.method === "GET") {
          const kvIps = await getCleanIpOverrides(env);
          return jsonResponse({
            source: kvIps ? "kv" : "default",
            ips: kvIps || CF_CLEAN_IPS,
            default_ips: CF_CLEAN_IPS,
            note: kvIps ? "Using KV override \u2014 DELETE to revert to defaults" : "Using built-in defaults \u2014 PATCH to override"
          });
        }
        if (path === "/admin/clean-ips" && request.method === "PATCH") {
          let body;
          try {
            body = await request.json();
          } catch {
            return jsonResponse({ error: "Invalid JSON" }, 400);
          }
          const ips = body["ips"];
          if (!ips || !Array.isArray(ips) || ips.length === 0) {
            return jsonResponse({ error: "ips array is required" }, 400);
          }
          const badIp = ips.find((ip) => !isValidHostOrIp(ip));
          if (badIp !== void 0) {
            return jsonResponse({ error: `invalid address in ips: ${String(badIp).slice(0, 40)}` }, 400);
          }
          const ok = await setCleanIpOverrides(env, ips);
          if (!ok) return jsonResponse({ error: "KV not available" }, 503);
          return jsonResponse({ ok: true, ips, note: "Clean IPs updated \u2014 takes effect on next subscription fetch" });
        }
        if (path === "/admin/clean-ips" && request.method === "DELETE") {
          await deleteCleanIpOverrides(env);
          return jsonResponse({ ok: true, reverted_to: CF_CLEAN_IPS });
        }
        return jsonResponse({ error: "Not found" }, 404);
      }
      if (path === "/diagnostic") {
        const country2 = (request.headers.get("CF-IPCountry") || "").toUpperCase();
        const isIran2 = country2 === "IR";
        const isp2 = isIran2 ? detectIranISP(request) : "unknown";
        const asn = request.headers.get("CF-IPRegion-ASN") || request.headers.get("cf-meta-asn") || "";
        const recommendations = {
          irancell: {
            try_first: [
              "XrayHTTP (tcp+http header obfuscation with whitelisted host)",
              "XHTTP-CDN (pure HTTP through Cloudflare \u2014 no WebSocket)",
              "ShadowTLS v3 (TLS camouflage to google.com, port 10443)"
            ],
            avoid: [
              "CDN-WS (WebSocket Upgrade header detected by DPI)",
              "Reality (TLS/443 encrypted protos blocked)",
              "Hysteria2 (QUIC/UDP blocked)",
              "gRPC-CDN (HTTP/2 gRPC detected)"
            ],
            notes: [
              "Most aggressive DPI \u2014 only HTTP-obfuscated and CDN-fronted protocols work",
              "Use V2rayNG or NekoBox for best XrayHTTP compatibility",
              "Hiddify 3.x+ should work with XHTTP-CDN and XrayHTTP configs",
              "If all configs fail, try DNS tunnel (SlipNet) \u2014 works during shutdowns"
            ]
          },
          mci: {
            try_first: [
              "XHTTP-CDN (most reliable on MCI)",
              "XrayHTTP (tcp+http with whitelisted host \u2014 confirmed working)",
              "ShadowTLS v3",
              "XHTTP via Vercel/Netlify relay (CDN diversity)"
            ],
            avoid: [
              "CDN-WS (WebSocket detected, less aggressive than Irancell)",
              "Hysteria2 (QUIC generally blocked)"
            ],
            notes: [
              "Second most aggressive DPI after Irancell",
              "Clean CF IPs tend to be more stable on MCI than Irancell",
              "Yandex DNS (77.88.8.8) is the most stable resolver for DNSTT on MCI"
            ]
          },
          rightel: {
            try_first: [
              "XHTTP-CDN",
              "XrayHTTP",
              "CDN-WS (often works on Rightel \u2014 less DPI)",
              "Reality (sometimes works \u2014 test it)"
            ],
            avoid: [],
            notes: [
              "Generally more lenient DPI than Irancell/MCI",
              "More protocols likely to work \u2014 test Reality and Hy2"
            ]
          },
          shatel: {
            try_first: [
              "XHTTP-CDN",
              "XrayHTTP",
              "CDN-WS",
              "Reality (often works on fixed-line ISPs)"
            ],
            avoid: [],
            notes: [
              "Fixed-line ISPs generally have less aggressive DPI than mobile",
              "TLS fragment settings are tuned for Shatel"
            ]
          }
        };
        const ispRec = recommendations[isp2] || {
          try_first: ["XHTTP-CDN", "XrayHTTP", "ShadowTLS v3"],
          avoid: [],
          notes: ["ISP not detected \u2014 try configs in order, report what works"]
        };
        const appRecommendation = isp2 === "irancell" ? "V2rayNG or NekoBox (best XrayHTTP support). Hiddify 3.x+ also works for XHTTP-CDN." : "Hiddify (easiest setup). V2rayNG/NekoBox for advanced users.";
        return jsonResponse({
          diagnostic: true,
          your_connection: {
            country: country2,
            is_iran: isIran2,
            isp: isp2 !== "unknown" ? isp2 : null,
            asn: asn || null
          },
          recommendations: {
            try_first: ispRec.try_first,
            avoid: ispRec.avoid,
            notes: ispRec.notes,
            recommended_app: appRecommendation
          },
          subscription_urls: {
            primary: "https://sub.example.com/sub/<your-uuid>",
            backup: "https://sub.example.net/sub/<your-uuid>",
            tip: "Add ?geo=ir to force Iran mode. Add ?client=hiddify or ?client=xray to filter."
          },
          troubleshooting: {
            all_configs_fail: [
              "1. Try backup subscription URL (sub.example.net)",
              "2. Switch to V2rayNG/NekoBox and test XrayHTTP configs",
              "3. Try clean CF IP configs (XHTTP-CDN-CF1, CF2, etc.)",
              "4. If internet is completely down, use DNS tunnel (SlipNet app)"
            ],
            slow_connection: [
              "1. Try a different server (Finland, Dammam, London)",
              "2. Try XHTTP-CDN with clean CF IP \u2014 often faster",
              "3. Check if fragment settings match your ISP (auto-detected in subscription)"
            ],
            frequent_disconnects: [
              "1. Enable MUX padding in your client (auto-enabled for Iran mode)",
              "2. Try ShadowTLS v3 \u2014 most stable for long sessions",
              "3. Switch between servers \u2014 some routes are more stable"
            ]
          },
          dns_tunnel_fallback: {
            note: "DNS tunnel works even during complete internet shutdowns",
            app: "SlipNet (Android) \u2014 github.com/nickoala/SlipNet/releases",
            resolvers: isIran2 ? {
              mci: ["77.88.8.8:53", "208.67.222.222:53"],
              irancell: ["94.183.126.175:53", "102.22.254.232:53"],
              other: ["5.160.233.150:53", "164.138.206.100:53"]
            } : void 0
          }
        });
      }
      if (path === "/probe" && request.method === "GET") {
        const probeGate = await adminGate(
          request,
          url,
          env,
          config.adminUuid,
          403,
          "Forbidden \u2014 admin credential required"
        );
        if (probeGate) return probeGate;
        await applyServerOverrides(env, config.servers);
        if (!env.PROBE_TOKEN) {
          return jsonResponse({
            error: "PROBE_TOKEN is not configured. Set it before generating probe scripts."
          }, 503);
        }
        const reportUrl = `${url.origin}/probe/report?key=${env.PROBE_TOKEN}`;
        const script = generateProbeScript(config, reportUrl);
        return new Response(script, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": 'inline; filename="vpn-probe.sh"',
            ...SECURITY_HEADERS
          }
        });
      }
      if (path === "/probe/report" && request.method === "POST") {
        const reportKey = url.searchParams.get("key");
        const probeTokenOk = Boolean(env.PROBE_TOKEN) && Boolean(reportKey) && await timingSafeEqual(reportKey, env.PROBE_TOKEN);
        if (!probeTokenOk && !await isAdminRequest(request, url, env.ADMIN_TOKEN, config.adminUuid)) {
          return jsonResponse({ error: "Forbidden" }, 403);
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        body["cf_country"] = request.headers.get("CF-IPCountry") || "unknown";
        body["cf_ray"] = request.headers.get("CF-Ray") || null;
        const probeCf = request.cf;
        body["cf_asn"] = probeCf?.asn !== void 0 && probeCf?.asn !== null ? String(probeCf.asn) : null;
        body["reported_at"] = (/* @__PURE__ */ new Date()).toISOString();
        const stored = await storeProbeReport(env, body);
        if (!stored) {
          return jsonResponse({ error: "KV not available" }, 503);
        }
        const tgToken = env.TELEGRAM_BOT_TOKEN;
        const tgChat = env.TELEGRAM_CHAT_ID;
        if (tgToken && tgChat) {
          const up = body["up"] || 0;
          const down = body["down"] || 0;
          const msg = `\u{1F4E1} Probe from ${body["country"] || "??"} (${body["isp"] || "unknown"})
City: ${body["city"] || "?"}
\u2705 ${up} up | \u274C ${down} down
ASN: ${body["cf_asn"] || "?"}`;
          fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: tgChat,
              text: msg,
              parse_mode: "Markdown"
            })
          }).catch(() => {
          });
        }
        return jsonResponse({ ok: true, stored: true, timestamp: body["reported_at"] });
      }
      if (path === "/stats") {
        const statsGate = await adminGate(request, url, env, config.adminUuid);
        if (statsGate) return statsGate;
        const healthData = await getHealthData(env);
        const allUsers = await resolveAllUsers(env, config.envUsers);
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
        const todayHits = env.HEALTH ? JSON.parse(await env.HEALTH.get(`sub_hits:${today}`) || "{}") : {};
        const yesterdayHits = env.HEALTH ? JSON.parse(await env.HEALTH.get(`sub_hits:${yesterday}`) || "{}") : {};
        return jsonResponse({
          servers: config.servers.map((s) => ({
            tag: s.tag,
            location: s.location,
            enabled: s.enabled,
            health: healthData[s.tag] || { status: "unknown" }
          })),
          users: Object.entries(allUsers).map(([uuid2, u]) => ({
            name: u.name,
            tier: u.tier,
            enabled: u.enabled,
            source: u.source || "env",
            uuid_prefix: uuid2.substring(0, 8) + "..."
          })),
          // Truncate here too. The user list above is careful to expose only a
          // UUID prefix; returning the raw hit maps undid that, since they are
          // keyed by full subscription UUID.
          sub_requests: {
            today: truncateHitKeys(todayHits),
            yesterday: truncateHitKeys(yesterdayHits)
          },
          total_servers: config.servers.filter((s) => s.enabled).length,
          total_users: Object.values(allUsers).filter((u) => u.enabled).length,
          worker_version: "5.11.0",
          // x-release-please-version
          checked_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      const mtprotoMatch = path.match(/^\/mtproto\/([0-9a-f-]+)$/i);
      if (mtprotoMatch) {
        const mtUuid = mtprotoMatch[1].toLowerCase();
        if (!isValidUUID(mtUuid)) return new Response("Unauthorized", { status: 401 });
        const mtUser = await resolveUser(env, mtUuid, config.envUsers);
        if (!mtUser || !mtUser.enabled) return new Response("Unauthorized", { status: 401 });
        if (mtUser.expires && isExpired(mtUser.expires)) {
          return new Response("Expired", { status: 403 });
        }
        await applyServerOverrides(env, config.servers);
        const mtCountry = (request.headers.get("CF-IPCountry") || "").toUpperCase();
        const mtServers = getServersForUser(mtUser, config.servers, config.freeServerLimit, mtCountry);
        const links = mtServers.map((s) => generateMTProtoLink(s)).filter((l) => Boolean(l));
        const format2 = url.searchParams.get("format");
        if (format2 === "json") {
          return jsonResponse({ mtproto: links, user: mtUser.name });
        }
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Telegram Proxy</title>
<style>body{font-family:system-ui;max-width:600px;margin:2em auto;padding:0 1em;background:#1a1a2e;color:#eee}
a{display:block;margin:1em 0;padding:1em;background:#16213e;border-radius:8px;color:#0088cc;text-decoration:none;font-size:1.1em}
a:hover{background:#1a3a5c}h1{color:#0088cc}</style></head><body>
<h1>Telegram Proxy</h1>
<p>Tap a link to add it to your Telegram app:</p>
${links.map((l, i) => `<a href="${escapeHtml(l)}">${escapeHtml(mtServers[i]?.location || "Server " + (i + 1))} (${escapeHtml(mtServers[i]?.tag || "")})</a>`).join("\n")}
<p style="color:#888;margin-top:2em">Tip: In Telegram \u2192 Settings \u2192 Data and Storage \u2192 Proxy \u2192 Add Proxy</p>
</body></html>`;
        return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", ...SECURITY_HEADERS } });
      }
      const subMatch = path.match(/^\/sub\/([0-9a-f-]+)$/i);
      if (!subMatch) {
        return new Response("Not Found", { status: 404 });
      }
      const uuid = subMatch[1].toLowerCase();
      const subClientId = clientIdFor(request);
      if (await isAuthThrottled(env, subClientId)) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: { "Retry-After": String(AUTH_THROTTLE.windowSeconds), ...SECURITY_HEADERS }
        });
      }
      if (!isValidUUID(uuid)) {
        await recordAuthFailure(env, subClientId);
        return new Response("Unauthorized", { status: 401 });
      }
      const user = await resolveUser(env, uuid, config.envUsers);
      if (!user || !user.enabled) {
        await recordAuthFailure(env, subClientId);
        return new Response("Unauthorized", { status: 401 });
      }
      if (user.expires && isExpired(user.expires)) {
        return new Response("Subscription expired", { status: 403 });
      }
      const trackPromise = trackSubRequest(env, uuid);
      await applyServerOverrides(env, config.servers);
      const format = url.searchParams.get("format") || "base64";
      const country = (request.headers.get("CF-IPCountry") || "").toUpperCase();
      const isIran = country === "IR";
      const geoParam = (url.searchParams.get("geo") || "").toLowerCase();
      const cdnOnly = geoParam === "ir" || isIran && geoParam !== "global";
      const useFragment = cdnOnly;
      const isp = isIran ? detectIranISP(request) : "unknown";
      const ispFragment = useFragment ? getISPFragment(isp) : null;
      const modeParam = (url.searchParams.get("mode") || "").toLowerCase();
      let isShutdownMode = modeParam === "shutdown";
      if (!isShutdownMode && isIran && modeParam !== "normal") {
        const recentProbes = await getRecentProbeReports(env, 5);
        const irProbes = recentProbes.filter(
          (r) => r.country === "IR" && r.timestamp && Date.now() - new Date(r.timestamp).getTime() < 6 * 60 * 60 * 1e3
          // last 6 hours
        );
        if (irProbes.length >= 2) {
          let totalTcp = 0, downTcp = 0;
          for (const probe of irProbes) {
            for (const result of probe.results || []) {
              const test = result["test"];
              if (test === "tcp_443") {
                totalTcp++;
                if (result.status === "down") downTcp++;
              }
            }
          }
          if (totalTcp >= 4 && downTcp / totalTcp > 0.75) {
            isShutdownMode = true;
          }
        }
      }
      const userServers = getServersForUser(user, config.servers, config.freeServerLimit, country);
      const useMux = cdnOnly;
      const allLines = [];
      const effectiveCdnOnly = cdnOnly || user.tier === "limited";
      const cdnOpts = {
        fragment: useFragment,
        fragmentSettings: ispFragment,
        mux: useMux
      };
      const cleanIps = await getCleanIpOverrides(env) || void 0;
      for (const server of userServers) {
        if (server.is_relay) {
          allLines.push(...generateRelayServerConfigs(server, uuid));
          continue;
        }
        const serverCdnOnly = effectiveCdnOnly || server.geo_restrict && server.geo_restrict.length > 0 || server.geo_cdn_only && server.geo_cdn_only.includes(country);
        if (isShutdownMode) {
          const xdnsUri2 = generateFinalmaskXdnsURI(server, uuid);
          if (xdnsUri2) allLines.push(xdnsUri2);
          const xicmpUri2 = generateFinalmaskXicmpURI(server, uuid);
          if (xicmpUri2) allLines.push(xicmpUri2);
          const wechatUri2 = generateFinalmaskWechatURI(server, uuid);
          if (wechatUri2) allLines.push(wechatUri2);
          const dtlsUri2 = generateFinalmaskDtlsURI(server, uuid);
          if (dtlsUri2) allLines.push(dtlsUri2);
          const srtpUri2 = generateFinalmaskSrtpURI(server, uuid);
          if (srtpUri2) allLines.push(srtpUri2);
          const httpObfsUri2 = generateHttpObfsURI(server, uuid);
          if (httpObfsUri2) allLines.push(httpObfsUri2);
          allLines.push(...generateHttpObfsMultiHostURIs(server, uuid, isp !== "unknown" ? isp : void 0));
          const ss2022Uri = generateSs2022URI(server, uuid);
          if (ss2022Uri) allLines.push(ss2022Uri);
          continue;
        }
        const xhttpUri = generateXhttpCdnURI(server, uuid, cdnOpts);
        if (xhttpUri) allLines.push(xhttpUri);
        allLines.push(...generateXhttpCdnCleanIPURIs(server, uuid, cdnOpts, cleanIps));
        allLines.push(...generateRelayXhttpURIs(server, uuid, config.vercelRelays, "Vercel", cdnOpts));
        allLines.push(...generateRelayXhttpURIs(server, uuid, config.netlifyRelays, "Netlify", cdnOpts));
        const grpcUri = generateGrpcCdnURI(server, uuid, cdnOpts);
        if (grpcUri) allLines.push(grpcUri);
        allLines.push(...generateGrpcCdnCleanIPURIs(server, uuid, cdnOpts, cleanIps));
        const httpObfsUri = generateHttpObfsURI(server, uuid);
        if (httpObfsUri) allLines.push(httpObfsUri);
        allLines.push(...generateHttpObfsMultiHostURIs(server, uuid, isp !== "unknown" ? isp : void 0));
        const xdnsUri = generateFinalmaskXdnsURI(server, uuid);
        if (xdnsUri) allLines.push(xdnsUri);
        const xicmpUri = generateFinalmaskXicmpURI(server, uuid);
        if (xicmpUri) allLines.push(xicmpUri);
        const wechatUri = generateFinalmaskWechatURI(server, uuid);
        if (wechatUri) allLines.push(wechatUri);
        const dtlsUri = generateFinalmaskDtlsURI(server, uuid);
        if (dtlsUri) allLines.push(dtlsUri);
        const srtpUri = generateFinalmaskSrtpURI(server, uuid);
        if (srtpUri) allLines.push(srtpUri);
        const shadowtlsUri = generateShadowTLSURI(server, uuid);
        if (shadowtlsUri) allLines.push(shadowtlsUri);
        if (!serverCdnOnly) {
          if (server.reality_pubkey) {
            allLines.push(generateRealityURI(server, uuid));
            allLines.push(...generateRealityAltSNIURIs(server, uuid));
          }
          if (server.hy2_port) {
            allLines.push(generateHy2URI(server, uuid));
          }
          const hy2HopUri = generateHy2HopURI(server, uuid);
          if (hy2HopUri) allLines.push(hy2HopUri);
        }
        const cdnUri = generateCdnWsURI(server, uuid, cdnOpts);
        if (cdnUri) allLines.push(cdnUri);
        allLines.push(...generateCdnWsCleanIPURIs(server, uuid, cdnOpts, cleanIps));
        if (!serverCdnOnly) {
          const naiveUri = generateNaiveURI(server, uuid);
          if (naiveUri) allLines.push(naiveUri);
          const cloakUri = generateCloakSs2022URI(server, uuid);
          if (cloakUri) allLines.push(cloakUri);
          const awgUri = generateAmneziaWGURI(server, uuid);
          if (awgUri) allLines.push(awgUri);
          const relayReality = generateRelayRealityURI(server, uuid);
          if (relayReality) allLines.push(relayReality);
          const relayHy2 = generateRelayHy2URI(server, uuid);
          if (relayHy2) allLines.push(relayHy2);
          const relaySs = generateRelaySs2022URI(server, uuid);
          if (relaySs) allLines.push(relaySs);
        }
      }
      const ispFiltered = cdnOnly && isp !== "unknown" ? filterByISP(allLines, isp) : allLines;
      const client = detectClient(request, url.searchParams);
      const filteredLines = client === "hiddify" ? filterForSingBox(ispFiltered) : ispFiltered;
      const sortedLines = cdnOnly && isp !== "unknown" ? sortConfigsByISP(filteredLines, isp) : filteredLines;
      const mtprotoLinks = [];
      for (const server of userServers) {
        const link = generateMTProtoLink(server);
        if (link) mtprotoLinks.push(link);
      }
      if (format === "json") {
        await trackPromise;
        const dnsttServers = userServers.filter((s) => s.has_dns_tunnel).map((s) => ({ tag: s.tag, location: s.location }));
        const dnsttInfo = dnsttServers.length > 0 ? {
          note: "DNS tunnel \u2014 most censorship-resistant. ONLY method that works during complete internet shutdowns.",
          warning: isShutdownMode ? "SHUTDOWN MODE: Use DNS tunnel (SlipNet/DNSTT) as primary connection method." : void 0,
          servers: dnsttServers,
          setup_url: "https://sub.example.com/diagnostic",
          clients: {
            android: "SlipNet \u2014 https://github.com/nickoala/SlipNet/releases",
            ios: "V2Box (supports DNSTT) or HTTP Injector",
            desktop: "dnstc \u2014 https://github.com/nickoala/dnstc/releases"
          },
          dns_resolvers: {
            note: "Use these ISP DNS resolvers with DNSTT/SlipNet. Try multiple \u2014 each city/neighborhood may differ.",
            mci: ISP_DNS_RESOLVERS["mci"].map((ip) => `${ip}:53`),
            irancell: ISP_DNS_RESOLVERS["irancell"].map((ip) => `${ip}:53`),
            other: ISP_DNS_RESOLVERS["other"].map((ip) => `${ip}:53`)
          },
          tools: {
            range_scout: "https://github.com/iampedii/range-scout \u2014 Find working DNS resolvers for your ISP",
            vaydns: "https://github.com/net2share/vaydns \u2014 DNSTT fork that works on more resolvers",
            chinvat_mx: "https://github.com/arielesfahani/chinvat-mx \u2014 DNS multiplexer for DNSTT stability"
          }
        } : void 0;
        return jsonResponse({
          configs: sortedLines,
          mtproto: isShutdownMode ? [] : mtprotoLinks,
          server_count: userServers.length,
          user: user.name,
          tier: user.tier,
          mode: isShutdownMode ? "shutdown" : effectiveCdnOnly ? "iran" : "global",
          auto_shutdown: isShutdownMode && modeParam !== "shutdown" ? true : void 0,
          geo: { country, cdn_only: effectiveCdnOnly, fragment: useFragment, isp: isp !== "unknown" ? isp : void 0, mux: useMux },
          client: client !== "auto" ? client : void 0,
          backup_sub: "https://sub.example.net",
          dnstt: dnsttInfo
        });
      }
      if (format === "singbox" || format === "sing-box") {
        await trackPromise;
        const singboxConfig = buildSingBoxConfig(sortedLines);
        return new Response(JSON.stringify(singboxConfig, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": 'inline; filename="singbox-config.json"',
            "Profile-Title": "base64:" + btoa("VPN Smart Sub"),
            "Profile-Update-Interval": "4",
            ...SECURITY_HEADERS
          }
        });
      }
      if (format === "text") {
        await trackPromise;
        const plain = sortedLines.join("\n");
        return new Response(plain, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...SECURITY_HEADERS
          }
        });
      }
      const combined = sortedLines.join("\n");
      const base64 = btoa(combined);
      await trackPromise;
      return new Response(base64, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": "inline",
          "Profile-Title": "base64:" + btoa("VPN Smart Sub"),
          "Profile-Update-Interval": "4",
          "Subscription-Userinfo": `upload=0; download=0; total=${50 * 1073741824}; expire=0`,
          "Support-URL": "https://sub.example.com/health",
          ...SECURITY_HEADERS
        }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Internal Server Error" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...SECURITY_HEADERS
          }
        }
      );
    }
  }
};
export {
  ALT_REALITY_SNIS,
  ASN_TO_ISP,
  CF_CLEAN_IPS,
  FINALMASK,
  FRAGMENT,
  ISP_DNS_RESOLVERS,
  ISP_FRAGMENTS,
  MUX,
  SALAMANDER_DEFAULTS,
  SHADOWTLS_DEFAULTS,
  WHITELISTED_HOSTS,
  applyServerOverrides,
  buildConfig,
  index_default as default,
  deleteKvUser,
  deleteServerOverride,
  detectIranISP,
  generateAmneziaWGURI,
  generateAnyTlsURI,
  generateCdnWsCleanIPURIs,
  generateCdnWsURI,
  generateCloakSs2022URI,
  generateEdtunnelCleanIPURIs,
  generateEdtunnelURIs,
  generateFinalmaskDtlsURI,
  generateFinalmaskSrtpURI,
  generateFinalmaskWechatURI,
  generateFinalmaskXdnsURI,
  generateFinalmaskXicmpURI,
  generateGrpcCdnCleanIPURIs,
  generateGrpcCdnURI,
  generateHttpObfsMultiHostURIs,
  generateHttpObfsURI,
  generateHy2HopURI,
  generateHy2URI,
  generateIPv6Hy2URI,
  generateIPv6RealityURI,
  generateMTProtoLink,
  generateNaiveURI,
  generateProbeScript,
  generateRealityAltSNIURIs,
  generateRealityURI,
  generateRelayCdnWsURIs,
  generateRelayHy2URI,
  generateRelayRealityURI,
  generateRelayServerConfigs,
  generateRelaySs2022URI,
  generateRelayXhttpURIs,
  generateShadowTLSURI,
  generateSs2022URI,
  generateXhttpCdnCleanIPURIs,
  generateXhttpCdnURI,
  getAllKvUsers,
  getAllServerOverrides,
  getISPFragment,
  getRecentProbeReports,
  getServerOverride,
  getServersForUser,
  isValidUUID,
  jsonResponse,
  resolveAllUsers,
  resolveUser,
  setKvUser,
  setServerOverride,
  sortConfigsByISP,
  storeProbeReport
};
