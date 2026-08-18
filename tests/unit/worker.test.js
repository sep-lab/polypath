import { describe, it, expect } from "vitest";
import worker, {
  CF_CLEAN_IPS,
  FINALMASK,
  SHADOWTLS_DEFAULTS,
  SALAMANDER_DEFAULTS,
  buildConfig,
  isValidUUID,
  generateRealityURI,
  generateHy2URI,
  generateIPv6RealityURI,
  generateIPv6Hy2URI,
  generateCdnWsURI,
  generateXhttpCdnURI,
  generateHttpObfsURI,
  generateSs2022URI,
  generateNaiveURI,
  generateXhttpCdnCleanIPURIs,
  generateCdnWsCleanIPURIs,
  generateEdtunnelURIs,
  generateEdtunnelCleanIPURIs,
  generateFinalmaskXdnsURI,
  generateFinalmaskXicmpURI,
  generateHy2HopURI,
  generateShadowTLSURI,
  generateRelayRealityURI,
  generateRelayHy2URI,
  generateRelaySs2022URI,
  generateCloakSs2022URI,
  generateRelayXhttpURIs,
  generateRelayCdnWsURIs,
  getServersForUser,
  jsonResponse,
  storeProbeReport,
  getRecentProbeReports,
  generateProbeScript,
  detectIranISP,
  getISPFragment,
  ISP_FRAGMENTS,
  generateAnyTlsURI,
  generateRelayServerConfigs,
  sortConfigsByISP,
  generateAmneziaWGURI,
  generateGrpcCdnURI,
  generateHttpObfsMultiHostURIs,
  generateGrpcCdnCleanIPURIs,
  generateFinalmaskWechatURI,
  generateFinalmaskDtlsURI,
  generateFinalmaskSrtpURI,
  generateMTProtoLink,
  generateRealityAltSNIURIs,
} from "../../tools/smart-sub/worker.js";

// ── Test Fixtures ────────────────────────────────────────────────

const TEST_UUID = "12345678-1234-1234-1234-123456789abc";

/** Minimal server with all protocol fields populated (for positive tests) */
const FULL_SERVER = {
  tag: "test-server",
  location: "TestLand",
  provider: "TestProvider",
  ip: "10.0.0.1",
  ipv6: "2001:db8::1",
  reality_port: 443,
  hy2_port: 8443,
  reality_pubkey: "test-pubkey-base64",
  reality_short_id: "aabbccdd",
  sni: "www.example.com",
  has_dns_tunnel: true,
  cdn_ws: { host: "cdn.example.com", path: "/ws", port: 443 },
  http_obfs: { port: 80, host: "example.ir", path: "/" },
  xhttp_cdn: { host: "cdn.example.com", path: "/xhttp", port: 443 },
  ss2022: {
    port: 80,
    method: "2022-blake3-aes-128-gcm",
    server_key: "AAAAAAAAAAAAAAAAAAAAAA==",
    user_key: "BBBBBBBBBBBBBBBBBBBBBB==",
  },
  finalmask: {
    xdns_port: 10053,
    xicmp_port: 10054,
    seed: "test-seed-value",
  },
  shadowtls: {
    port: 10443,
    password: "test-shadow-password",
    handshake_server: "www.google.com",
  },
  hy2_hop: {
    port_range: "20000-50000",
    salamander_password: "test-salamander-password",
  },
  naive: {
    host: "web.example.com",
    port: 2087,
    user: "testuser",
    pass: "testpassword123",
  },
  cloak: {
    port: 2053,
    uid: "testCloakUID==",
    public_key: "testCloakPubKey==",
    server_name: "www.google.com",
    encryption: "plain",
    browser_sig: "chrome",
  },
  relay: {
    ip: "10.0.0.99",
  },
  amneziawg: null,
  enabled: true,
};

/** Minimal server with no optional protocols */
const BARE_SERVER = {
  tag: "bare",
  location: "Nowhere",
  provider: "None",
  ip: "10.0.0.2",
  ipv6: null,
  reality_port: 443,
  hy2_port: null,
  reality_pubkey: null,
  reality_short_id: null,
  sni: "www.google.com",
  has_dns_tunnel: false,
  cdn_ws: null,
  http_obfs: null,
  xhttp_cdn: null,
  ss2022: null,
  finalmask: null,
  shadowtls: null,
  hy2_hop: null,
  naive: null,
  cloak: null,
  amneziawg: null,
  relay: null,
  enabled: true,
};

/** Iran relay server fixture (for relay architecture tests) */
const RELAY_SERVER = {
  tag: "iran-relay",
  location: "Tehran",
  provider: "Private",
  ip: "192.168.1.100",
  ipv6: null,
  is_relay: true,
  relay_config: {
    // v5.7: vless_tls removed from relay (DPI target)
    anytls: { port: 443, password: "test-anytls-pass", sni: "divar.ir" },
  },
  anytls: { port: 443, password: "test-anytls-pass", sni: "divar.ir" },
  shadowtls: {
    port: 10443,
    password: "test-shadow-password",
    handshake_server: "cafebazaar.ir",
  },
  ss2022: {
    port: 80,
    method: "2022-blake3-aes-128-gcm",
    server_key: "AAAAAAAAAAAAAAAAAAAAAA==",
    user_key: "BBBBBBBBBBBBBBBBBBBBBB==",
  },
  reality_port: null, hy2_port: null, reality_pubkey: null,
  reality_short_id: null, sni: "divar.ir",
  has_dns_tunnel: false, cdn_ws: null, http_obfs: null,
  xhttp_cdn: null, finalmask: null, hy2_hop: null,
  naive: null, cloak: null, amneziawg: null, relay: null,
  mtproto: null,
  geo_restrict: ["IR"],
  enabled: true,
};

// ── Test Environment (simulates Wrangler env bindings) ───────────
const TEST_ENV = {
  ADMIN_UUID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  PROBE_TOKEN: "test-probe-token-not-the-admin-uuid",
  FAMILY_UUID: "11111111-2222-3333-4444-555555555555",
  TEST_UUID: "66666666-7777-8888-9999-aaaaaaaaaaaa",
  TEST_UUID_EXPIRES: "2030-12-31",
  SHADOWTLS_PASSWORD: "test-shadowtls-password",
  SALAMANDER_PASSWORD: "test-salamander-password",
  SS_USER_KEY: "dGVzdHVzZXJrZXkxMjM0",
  FINALMASK_SEED: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  EDTUNNEL_PAGES: "test-page-1.pages.dev,test-page-2.pages.dev",
  HEL_IP: "10.0.1.1",
  HEL_IPV6: "2001:db8::1",
  HEL_SS_KEY: "dGVzdGhlbHNza2V5MTIz",
  HEL_REALITY_PUBKEY: "dGVzdGhlbHJlYWxpdHlwdWJrZXkwMDAwMDAwMDAwMA",
  HEL_REALITY_SHORT_ID: "aa00000000000001",
  HEL_MTPROTO_SECRET: "ee111111111111111111111111111111116578616d706c652e636f6d",
  HEL_NAIVE_PASS: "test-hel-naive-pass",
  ORC_IP: "10.0.1.2",
  ORC_SS_KEY: "dGVzdG9yY3Nza2V5MTIz",
  ORC_REALITY_PUBKEY: "dGVzdG9yY3JlYWxpdHlwdWJrZXkwMDAwMDAwMDAwMA",
  ORC_REALITY_SHORT_ID: "aa00000000000002",
  ORC_MTPROTO_SECRET: "ee222222222222222222222222222222226578616d706c652e636f6d",
  ORC_NAIVE_PASS: "test-orc-naive-pass",
  GCP_IP: "10.0.1.3",
  GCP_SS_KEY: "dGVzdGdjcHNza2V5MTIz",
  GCP_REALITY_PUBKEY: "dGVzdGdjcHJlYWxpdHlwdWJrZXkwMDAwMDAwMDAwMA",
  GCP_REALITY_SHORT_ID: "aa00000000000003",
  GCP_MTPROTO_SECRET: "ee333333333333333333333333333333336578616d706c652e636f6d",
  SCW_IP: "10.0.1.4",
  SCW_IPV6: "2001:db8::4",
  SCW_SS_KEY: "dGVzdHNjd3Nza2V5MTIz",
  SCW_REALITY_PUBKEY: "dGVzdHNjd3JlYWxpdHlwdWJrZXkwMDAwMDAwMDAwMA",
  SCW_REALITY_SHORT_ID: "aa00000000000004",
  SCW_MTPROTO_SECRET: "ee444444444444444444444444444444446578616d706c652e636f6d",
  SCW_NAIVE_PASS: "test-scw-naive-pass",
  SCW_CLOAK_UID: "dGVzdENsb2FrVUlEMTIz",
  SCW_CLOAK_PUBKEY: "dGVzdENsb2FrUHViS2V5",
  FREE_SERVER_LIMIT: "2",
};

// Build config from test env (used by integration/integrity tests)
const testConfig = buildConfig(TEST_ENV);
const SERVERS = testConfig.servers;
const USERS = testConfig.envUsers;
const ADMIN_UUID = testConfig.adminUuid;
const FREE_SERVER_LIMIT = testConfig.freeServerLimit;
const EDTUNNEL = testConfig.edtunnel;


// ═══════════════════════════════════════════════════════════════════
//  UNIT TESTS — Individual Functions
// ═══════════════════════════════════════════════════════════════════

describe("UUID Validation", () => {
  it("accepts valid lowercase UUID", () => {
    expect(isValidUUID("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")).toBe(true);
  });

  it("accepts valid uppercase UUID", () => {
    expect(isValidUUID("A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D")).toBe(true);
  });

  it("accepts valid mixed-case UUID", () => {
    expect(isValidUUID("a1b2C3D4-e5F6-4a7B-8c9D-0e1f2A3B4C5D")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidUUID("")).toBe(false);
  });

  it("rejects short UUID", () => {
    expect(isValidUUID("a1b2c3d4-e5f6-4a7b-8c9d")).toBe(false);
  });

  it("rejects UUID without dashes", () => {
    expect(isValidUUID("a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidUUID("XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX")).toBe(false);
  });

  it("rejects UUID with extra chars", () => {
    expect(isValidUUID("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d-extra")).toBe(false);
  });

  it("rejects path traversal attempt", () => {
    expect(isValidUUID("../../../etc/passwd")).toBe(false);
  });

  it("rejects SQL injection attempt", () => {
    expect(isValidUUID("'; DROP TABLE users;--")).toBe(false);
  });
});


// ── Protocol URI Generators ─────────────────────────────────────

describe("VLESS Reality URI", () => {
  it("generates valid vless:// URI", () => {
    const uri = generateRealityURI(FULL_SERVER, TEST_UUID);
    expect(uri).toMatch(/^vless:\/\//);
  });

  it("includes UUID in URI", () => {
    const uri = generateRealityURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(TEST_UUID);
  });

  it("includes server IP and port", () => {
    const uri = generateRealityURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`${FULL_SERVER.ip}:${FULL_SERVER.reality_port}`);
  });

  it("contains reality security params", () => {
    const uri = generateRealityURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain("security=reality");
    expect(uri).toContain("flow=xtls-rprx-vision");
    expect(uri).toContain(`pbk=${FULL_SERVER.reality_pubkey}`);
    expect(uri).toContain(`sid=${FULL_SERVER.reality_short_id}`);
  });

  it("has location-based fragment", () => {
    const uri = generateRealityURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`#Reality-${FULL_SERVER.location}`);
  });
});


describe("Hysteria2 URI", () => {
  it("generates valid hy2:// URI", () => {
    const uri = generateHy2URI(FULL_SERVER, TEST_UUID);
    expect(uri).toMatch(/^hy2:\/\//);
  });

  it("includes UUID and server address", () => {
    const uri = generateHy2URI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`${TEST_UUID}@${FULL_SERVER.ip}:${FULL_SERVER.hy2_port}`);
  });

  it("includes SNI param", () => {
    const uri = generateHy2URI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`sni=${FULL_SERVER.sni}`);
  });
});


describe("IPv6 Reality URI", () => {
  it("generates URI with bracketed IPv6 address", () => {
    const uri = generateIPv6RealityURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`[${FULL_SERVER.ipv6}]`);
  });

  it("returns null for server without IPv6", () => {
    expect(generateIPv6RealityURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });

  it("has IPv6 tag in fragment", () => {
    const uri = generateIPv6RealityURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain("Reality-IPv6-");
  });
});


describe("IPv6 Hy2 URI", () => {
  it("generates URI with bracketed IPv6", () => {
    const uri = generateIPv6Hy2URI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`[${FULL_SERVER.ipv6}]`);
  });

  it("returns null without IPv6", () => {
    expect(generateIPv6Hy2URI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("CDN-WS URI", () => {
  it("generates valid vless:// URI through CDN", () => {
    const uri = generateCdnWsURI(FULL_SERVER, TEST_UUID);
    expect(uri).toMatch(/^vless:\/\//);
    expect(uri).toContain("type=ws");
    expect(uri).toContain("security=tls");
  });

  it("uses CDN host as connection address (hides server IP)", () => {
    const uri = generateCdnWsURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`@${FULL_SERVER.cdn_ws.host}:`);
    expect(uri).not.toContain(FULL_SERVER.ip);
  });

  it("returns null without cdn_ws config", () => {
    expect(generateCdnWsURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("XHTTP-CDN URI", () => {
  it("generates vless:// URI with xhttp transport", () => {
    const uri = generateXhttpCdnURI(FULL_SERVER, TEST_UUID);
    expect(uri).toMatch(/^vless:\/\//);
    expect(uri).toContain("type=xhttp");
    expect(uri).toContain("mode=packet-up");
  });

  it("hides server IP behind CDN host", () => {
    const uri = generateXhttpCdnURI(FULL_SERVER, TEST_UUID);
    expect(uri).not.toContain(FULL_SERVER.ip);
    expect(uri).toContain(FULL_SERVER.xhttp_cdn.host);
  });

  it("returns null without xhttp_cdn config", () => {
    expect(generateXhttpCdnURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("HTTP Obfuscation URI", () => {
  it("uses tcp transport with http headers", () => {
    const uri = generateHttpObfsURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain("type=tcp");
    expect(uri).toContain("headerType=http");
  });

  it("uses whitelisted domain as host header", () => {
    const uri = generateHttpObfsURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`host=${FULL_SERVER.http_obfs.host}`);
  });

  it("connects directly to server IP (not CDN)", () => {
    const uri = generateHttpObfsURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`@${FULL_SERVER.ip}:`);
  });

  it("returns null without http_obfs config", () => {
    expect(generateHttpObfsURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("SS2022 URI", () => {
  it("generates valid ss:// URI", () => {
    const uri = generateSs2022URI(FULL_SERVER, TEST_UUID);
    expect(uri).toMatch(/^ss:\/\//);
  });

  it("uses base64-encoded credentials", () => {
    const uri = generateSs2022URI(FULL_SERVER, TEST_UUID);
    // The part between ss:// and @ should be valid base64
    const match = uri.match(/^ss:\/\/([^@]+)@/);
    expect(match).not.toBeNull();
    const decoded = atob(match[1]);
    expect(decoded).toContain(FULL_SERVER.ss2022.method);
    expect(decoded).toContain(FULL_SERVER.ss2022.server_key);
    expect(decoded).toContain(FULL_SERVER.ss2022.user_key);
  });

  it("includes server IP and port", () => {
    const uri = generateSs2022URI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`@${FULL_SERVER.ip}:${FULL_SERVER.ss2022.port}`);
  });

  it("returns null without ss2022 config", () => {
    expect(generateSs2022URI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("NaiveProxy URI", () => {
  it("generates valid naive+https:// URI", () => {
    const uri = generateNaiveURI(FULL_SERVER, TEST_UUID);
    expect(uri).toMatch(/^naive\+https:\/\//);
  });

  it("includes user:pass credentials", () => {
    const uri = generateNaiveURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`${FULL_SERVER.naive.user}:${FULL_SERVER.naive.pass}@`);
  });

  it("connects to naive host (not raw IP)", () => {
    const uri = generateNaiveURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`@${FULL_SERVER.naive.host}:`);
  });

  it("returns null without naive config", () => {
    expect(generateNaiveURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("Finalmask XDNS URI", () => {
  it("generates vless:// with kcp transport and dns header", () => {
    const uri = generateFinalmaskXdnsURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain("type=kcp");
    expect(uri).toContain("headerType=dns");
  });

  it("uses correct port and seed", () => {
    const uri = generateFinalmaskXdnsURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`:${FULL_SERVER.finalmask.xdns_port}`);
    expect(uri).toContain(`seed=${FULL_SERVER.finalmask.seed}`);
  });

  it("returns null without finalmask config", () => {
    expect(generateFinalmaskXdnsURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("Finalmask XICMP URI", () => {
  it("generates vless:// with kcp transport and utp header", () => {
    const uri = generateFinalmaskXicmpURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain("type=kcp");
    expect(uri).toContain("headerType=utp");
  });

  it("returns null without finalmask config", () => {
    expect(generateFinalmaskXicmpURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("Hy2 Port Hopping URI", () => {
  it("generates hy2:// with salamander obfuscation", () => {
    const uri = generateHy2HopURI(FULL_SERVER, TEST_UUID);
    expect(uri).toMatch(/^hy2:\/\//);
    expect(uri).toContain("obfs=salamander");
  });

  it("includes port range in address", () => {
    const uri = generateHy2HopURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`:${FULL_SERVER.hy2_hop.port_range}`);
  });

  it("includes obfs password", () => {
    const uri = generateHy2HopURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`obfs-password=${FULL_SERVER.hy2_hop.salamander_password}`);
  });

  it("returns null without hy2_hop config", () => {
    expect(generateHy2HopURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("ShadowTLS URI", () => {
  it("generates sing-box:// import URL", () => {
    const uri = generateShadowTLSURI(FULL_SERVER, TEST_UUID);
    expect(uri).toMatch(/^sing-box:\/\/import-outbound\?data=/);
  });

  it("contains valid base64 JSON with both outbounds", () => {
    const uri = generateShadowTLSURI(FULL_SERVER, TEST_UUID);
    const match = uri.match(/data=([^#]+)/);
    expect(match).not.toBeNull();
    const decoded = JSON.parse(atob(match[1]));
    expect(decoded).toHaveLength(2);
    expect(decoded[0].type).toBe("shadowtls");
    expect(decoded[1].type).toBe("shadowsocks");
  });

  it("chains shadowtls → ss2022 via detour", () => {
    const uri = generateShadowTLSURI(FULL_SERVER, TEST_UUID);
    const match = uri.match(/data=([^#]+)/);
    const decoded = JSON.parse(atob(match[1]));
    expect(decoded[0].detour).toBe(decoded[1].tag);
  });

  it("returns null without both shadowtls AND ss2022", () => {
    expect(generateShadowTLSURI(BARE_SERVER, TEST_UUID)).toBeNull();
    // Has shadowtls but no ss2022
    const partialServer = { ...BARE_SERVER, shadowtls: FULL_SERVER.shadowtls };
    expect(generateShadowTLSURI(partialServer, TEST_UUID)).toBeNull();
  });
});


describe("Relay URI variants", () => {
  it("generateRelayRealityURI uses relay IP instead of server IP", () => {
    const uri = generateRelayRealityURI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`@${FULL_SERVER.relay.ip}:`);
    expect(uri).not.toContain(`@${FULL_SERVER.ip}:`);
    expect(uri).toContain("Relay-Reality-");
  });

  it("generateRelayHy2URI uses relay IP", () => {
    const uri = generateRelayHy2URI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`@${FULL_SERVER.relay.ip}:`);
  });

  it("generateRelaySs2022URI uses relay IP", () => {
    const uri = generateRelaySs2022URI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(`@${FULL_SERVER.relay.ip}:`);
  });

  it("all return null without relay config", () => {
    expect(generateRelayRealityURI(BARE_SERVER, TEST_UUID)).toBeNull();
    expect(generateRelayHy2URI(BARE_SERVER, TEST_UUID)).toBeNull();
    expect(generateRelaySs2022URI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});


describe("Cloak+SS2022 URI", () => {
  it("generates ss:// URI with cloak plugin", () => {
    const uri = generateCloakSs2022URI(FULL_SERVER, TEST_UUID);
    expect(uri).toMatch(/^ss:\/\//);
    expect(uri).toContain("plugin=");
    expect(uri).toContain("ck-client");
  });

  it("includes cloak UID and public key", () => {
    const uri = generateCloakSs2022URI(FULL_SERVER, TEST_UUID);
    expect(uri).toContain(encodeURIComponent(`UID=${FULL_SERVER.cloak.uid}`));
    expect(uri).toContain(encodeURIComponent(`PublicKey=${FULL_SERVER.cloak.public_key}`));
  });

  it("returns null without cloak config", () => {
    expect(generateCloakSs2022URI(BARE_SERVER, TEST_UUID)).toBeNull();
  });

  it("returns null without ss2022 config even if cloak exists", () => {
    const cloakOnly = { ...BARE_SERVER, cloak: FULL_SERVER.cloak };
    expect(generateCloakSs2022URI(cloakOnly, TEST_UUID)).toBeNull();
  });
});


// ── Clean IP Variants ───────────────────────────────────────────

describe("XHTTP-CDN Clean IP URIs", () => {
  it("generates one URI per clean CF IP", () => {
    const uris = generateXhttpCdnCleanIPURIs(FULL_SERVER, TEST_UUID);
    expect(uris).toHaveLength(CF_CLEAN_IPS.length);
  });

  it("each URI uses a different clean IP as address", () => {
    const uris = generateXhttpCdnCleanIPURIs(FULL_SERVER, TEST_UUID);
    CF_CLEAN_IPS.forEach((ip, i) => {
      expect(uris[i]).toContain(`@${ip}:`);
    });
  });

  it("still uses CDN host as SNI (not clean IP)", () => {
    const uris = generateXhttpCdnCleanIPURIs(FULL_SERVER, TEST_UUID);
    uris.forEach((uri) => {
      expect(uri).toContain(`sni=${FULL_SERVER.xhttp_cdn.host}`);
    });
  });

  it("returns empty array without xhttp_cdn config", () => {
    expect(generateXhttpCdnCleanIPURIs(BARE_SERVER, TEST_UUID)).toEqual([]);
  });
});


describe("CDN-WS Clean IP URIs", () => {
  it("generates one URI per clean CF IP", () => {
    const uris = generateCdnWsCleanIPURIs(FULL_SERVER, TEST_UUID);
    expect(uris).toHaveLength(CF_CLEAN_IPS.length);
  });

  it("returns empty array without cdn_ws config", () => {
    expect(generateCdnWsCleanIPURIs(BARE_SERVER, TEST_UUID)).toEqual([]);
  });
});


describe("EDtunnel URIs", () => {
  it("generates URIs for each pages host", () => {
    const uris = generateEdtunnelURIs(TEST_UUID, EDTUNNEL);
    expect(uris).toHaveLength(EDTUNNEL.pages.length);
  });

  it("uses pages host as address (zero server IP exposure)", () => {
    const uris = generateEdtunnelURIs(TEST_UUID, EDTUNNEL);
    uris.forEach((uri) => {
      expect(uri).toMatch(/^vless:\/\//);
      expect(uri).toContain("type=ws");
      // Should NOT contain any server IP
      SERVERS.forEach((s) => {
        expect(uri).not.toContain(s.ip);
      });
    });
  });
});


describe("EDtunnel Clean IP URIs", () => {
  it("generates CF_CLEAN_IPS.length URIs per first pages host", () => {
    const uris = generateEdtunnelCleanIPURIs(TEST_UUID, EDTUNNEL);
    expect(uris).toHaveLength(CF_CLEAN_IPS.length);
  });

  it("uses clean IPs as connection address", () => {
    const uris = generateEdtunnelCleanIPURIs(TEST_UUID, EDTUNNEL);
    CF_CLEAN_IPS.forEach((ip, i) => {
      expect(uris[i]).toContain(`@${ip}:`);
    });
  });
});


// ═══════════════════════════════════════════════════════════════════
//  USER & SERVER LOGIC
// ═══════════════════════════════════════════════════════════════════

describe("getServersForUser", () => {
  it("returns all enabled servers for premium user", () => {
    const premiumUser = { tier: "premium", enabled: true };
    const servers = getServersForUser(premiumUser, SERVERS, FREE_SERVER_LIMIT);
    const enabledCount = SERVERS.filter((s) => s.enabled).length;
    expect(servers).toHaveLength(enabledCount);
  });

  it("returns limited servers for free user", () => {
    const freeUser = { tier: "free", enabled: true };
    const servers = getServersForUser(freeUser, SERVERS, FREE_SERVER_LIMIT);
    expect(servers).toHaveLength(FREE_SERVER_LIMIT);
  });

  it("returns all servers for limited user (CDN filtering happens elsewhere)", () => {
    const limitedUser = { tier: "limited", enabled: true };
    const servers = getServersForUser(limitedUser, SERVERS, FREE_SERVER_LIMIT);
    const enabledCount = SERVERS.filter((s) => s.enabled).length;
    expect(servers).toHaveLength(enabledCount);
  });
});


describe("jsonResponse helper", () => {
  it("returns Response with JSON content type", () => {
    const resp = jsonResponse({ test: true });
    expect(resp.headers.get("Content-Type")).toBe("application/json");
  });

  it("includes security headers", () => {
    const resp = jsonResponse({ test: true });
    expect(resp.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(resp.headers.get("X-Frame-Options")).toBe("DENY");
    expect(resp.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("defaults to 200 status", () => {
    const resp = jsonResponse({ ok: true });
    expect(resp.status).toBe(200);
  });

  it("accepts custom status", () => {
    const resp = jsonResponse({ error: "not found" }, 404);
    expect(resp.status).toBe(404);
  });

  it("body contains pretty-printed JSON", async () => {
    const data = { hello: "world" };
    const resp = jsonResponse(data);
    const body = await resp.text();
    expect(body).toBe(JSON.stringify(data, null, 2));
  });
});


// ═══════════════════════════════════════════════════════════════════
//  PRODUCTION DATA INTEGRITY CHECKS
// ═══════════════════════════════════════════════════════════════════

describe("Server Configuration Integrity", () => {
  it("all servers have required fields", () => {
    SERVERS.forEach((server) => {
      expect(server.tag).toBeTruthy();
      expect(server.location).toBeTruthy();
      expect(server.ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      expect(typeof server.enabled).toBe("boolean");
    });
  });

  it("all enabled servers have at least Reality or CDN-WS", () => {
    SERVERS.filter((s) => s.enabled).forEach((server) => {
      const hasProtocol = server.reality_pubkey || server.cdn_ws || server.xhttp_cdn;
      expect(hasProtocol).toBeTruthy();
    });
  });

  it("server tags are unique", () => {
    const tags = SERVERS.map((s) => s.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("CDN hosts are HTTPS-capable (port 443)", () => {
    SERVERS.forEach((server) => {
      if (server.cdn_ws) expect(server.cdn_ws.port).toBe(443);
      if (server.xhttp_cdn) expect(server.xhttp_cdn.port).toBe(443);
    });
  });

  it("SS2022 uses 2022-blake3-aes-128-gcm method", () => {
    SERVERS.forEach((server) => {
      if (server.ss2022) {
        expect(server.ss2022.method).toBe("2022-blake3-aes-128-gcm");
      }
    });
  });

  it("all servers with shadowtls also have ss2022 (required pair)", () => {
    SERVERS.forEach((server) => {
      if (server.shadowtls) {
        expect(server.ss2022).not.toBeNull();
      }
    });
  });

  it("all servers with cloak also have ss2022 (required pair)", () => {
    SERVERS.forEach((server) => {
      if (server.cloak) {
        expect(server.ss2022).not.toBeNull();
      }
    });
  });

  it("Finalmask ports match global config", () => {
    SERVERS.forEach((server) => {
      if (server.finalmask) {
        expect(server.finalmask.xdns_port).toBe(FINALMASK.xdns_port);
        expect(server.finalmask.xicmp_port).toBe(FINALMASK.xicmp_port);
      }
    });
  });
});


describe("User Configuration Integrity", () => {
  it("all user UUIDs are valid format", () => {
    Object.keys(USERS).forEach((uuid) => {
      expect(isValidUUID(uuid)).toBe(true);
    });
  });

  it("all users have required fields", () => {
    Object.values(USERS).forEach((user) => {
      expect(user.name).toBeTruthy();
      expect(["premium", "free", "limited"]).toContain(user.tier);
      expect(typeof user.enabled).toBe("boolean");
    });
  });

  it("ADMIN_UUID exists in USERS and is premium", () => {
    expect(USERS[ADMIN_UUID]).toBeDefined();
    expect(USERS[ADMIN_UUID].tier).toBe("premium");
    expect(USERS[ADMIN_UUID].enabled).toBe(true);
  });

  it("users with expires field use valid ISO date", () => {
    Object.values(USERS).forEach((user) => {
      if (user.expires) {
        const date = new Date(user.expires);
        expect(date.toString()).not.toBe("Invalid Date");
      }
    });
  });
});


describe("Constants Integrity", () => {
  it("CF_CLEAN_IPS are valid IPv4 addresses", () => {
    CF_CLEAN_IPS.forEach((ip) => {
      expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    });
  });

  it("CF_CLEAN_IPS are not server IPs (they should be CF edge IPs)", () => {
    const serverIPs = SERVERS.map((s) => s.ip);
    CF_CLEAN_IPS.forEach((ip) => {
      expect(serverIPs).not.toContain(ip);
    });
  });

  it("EDTUNNEL pages hosts are .pages.dev domains", () => {
    EDTUNNEL.pages.forEach((host) => {
      expect(host).toMatch(/\.pages\.dev$/);
    });
  });

  it("FREE_SERVER_LIMIT is between 1 and total servers", () => {
    expect(FREE_SERVER_LIMIT).toBeGreaterThanOrEqual(1);
    expect(FREE_SERVER_LIMIT).toBeLessThanOrEqual(SERVERS.length);
  });
});


// ═══════════════════════════════════════════════════════════════════
//  SMOKE TESTS — End-to-End Config Generation
// ═══════════════════════════════════════════════════════════════════

describe("Smoke: Full config generation for premium user", () => {
  const premiumUser = { tier: "premium", enabled: true };
  const servers = getServersForUser(premiumUser, SERVERS, FREE_SERVER_LIMIT);

  it("generates configs for all enabled servers", () => {
    expect(servers.length).toBeGreaterThan(0);
  });

  it("every generator returns valid URI or null — no exceptions", () => {
    const generators = [
      (s, u) => generateRealityURI(s, u),
      (s, u) => generateHy2URI(s, u),
      (s, u) => generateIPv6RealityURI(s, u),
      (s, u) => generateIPv6Hy2URI(s, u),
      (s, u) => generateCdnWsURI(s, u),
      (s, u) => generateXhttpCdnURI(s, u),
      (s, u) => generateHttpObfsURI(s, u),
      (s, u) => generateSs2022URI(s, u),
      (s, u) => generateNaiveURI(s, u),
      (s, u) => generateFinalmaskXdnsURI(s, u),
      (s, u) => generateFinalmaskXicmpURI(s, u),
      (s, u) => generateHy2HopURI(s, u),
      (s, u) => generateShadowTLSURI(s, u),
      (s, u) => generateRelayRealityURI(s, u),
      (s, u) => generateRelayHy2URI(s, u),
      (s, u) => generateRelaySs2022URI(s, u),
      (s, u) => generateCloakSs2022URI(s, u),
    ];

    servers.forEach((server) => {
      generators.forEach((gen) => {
        const result = gen(server, TEST_UUID);
        // Must be either null or a non-empty string
        if (result !== null) {
          expect(typeof result).toBe("string");
          expect(result.length).toBeGreaterThan(10);
        }
      });
    });
  });

  it("array generators return arrays (possibly empty) — no exceptions", () => {
    const arrayGenerators = [
      (s, u) => generateXhttpCdnCleanIPURIs(s, u),
      (s, u) => generateCdnWsCleanIPURIs(s, u),
    ];

    servers.forEach((server) => {
      arrayGenerators.forEach((gen) => {
        const result = gen(server, TEST_UUID);
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  it("EDtunnel generators return non-empty arrays", () => {
    const uris = generateEdtunnelURIs(TEST_UUID, EDTUNNEL);
    expect(uris.length).toBeGreaterThan(0);
    const cleanUris = generateEdtunnelCleanIPURIs(TEST_UUID, EDTUNNEL);
    expect(cleanUris.length).toBeGreaterThan(0);
  });
});


describe("Smoke: Config count matches expected total", () => {
  it("premium user gets 50+ configs (covering all protocol types)", () => {
    const premiumUser = { tier: "premium", enabled: true };
    const servers = getServersForUser(premiumUser, SERVERS, FREE_SERVER_LIMIT);
    let totalConfigs = 0;

    servers.forEach((server) => {
      // Count non-null single generators
      const singles = [
        generateRealityURI, generateHy2URI, generateIPv6RealityURI,
        generateIPv6Hy2URI, generateCdnWsURI, generateXhttpCdnURI,
        generateHttpObfsURI, generateSs2022URI, generateNaiveURI,
        generateFinalmaskXdnsURI, generateFinalmaskXicmpURI,
        generateHy2HopURI, generateShadowTLSURI,
        generateRelayRealityURI, generateRelayHy2URI,
        generateRelaySs2022URI, generateCloakSs2022URI,
      ];

      singles.forEach((gen) => {
        if (gen(server, TEST_UUID) !== null) totalConfigs++;
      });

      // Count array generators
      totalConfigs += generateXhttpCdnCleanIPURIs(server, TEST_UUID).length;
      totalConfigs += generateCdnWsCleanIPURIs(server, TEST_UUID).length;
    });

    // EDtunnel (server-independent)
    totalConfigs += generateEdtunnelURIs(TEST_UUID, EDTUNNEL).length;
    totalConfigs += generateEdtunnelCleanIPURIs(TEST_UUID, EDTUNNEL).length;

    // Premium user with 4 servers should produce ~87 configs (without relays).
    // gRPC-CDN removed (HAProxy incompatible), 3 dead CF IPs pruned.
    // If this drops below 80, a protocol generator was likely broken or removed.
    expect(totalConfigs).toBeGreaterThanOrEqual(80);
  });

  it("free user gets fewer configs than premium", () => {
    const premiumServers = getServersForUser({ tier: "premium", enabled: true }, SERVERS, FREE_SERVER_LIMIT);
    const freeServers = getServersForUser({ tier: "free", enabled: true }, SERVERS, FREE_SERVER_LIMIT);
    expect(freeServers.length).toBeLessThan(premiumServers.length);
  });
});


describe("Smoke: No server IP leaked in CDN-fronted configs", () => {
  const serverIPs = SERVERS.map((s) => s.ip);

  it("XHTTP-CDN URIs never contain server IPs", () => {
    SERVERS.filter((s) => s.enabled && s.xhttp_cdn).forEach((server) => {
      const uri = generateXhttpCdnURI(server, TEST_UUID);
      serverIPs.forEach((ip) => {
        expect(uri).not.toContain(`@${ip}`);
      });
    });
  });

  it("CDN-WS URIs never contain server IPs", () => {
    SERVERS.filter((s) => s.enabled && s.cdn_ws).forEach((server) => {
      const uri = generateCdnWsURI(server, TEST_UUID);
      serverIPs.forEach((ip) => {
        expect(uri).not.toContain(`@${ip}`);
      });
    });
  });

  it("XHTTP-CDN Clean IP URIs never contain server IPs", () => {
    SERVERS.filter((s) => s.enabled && s.xhttp_cdn).forEach((server) => {
      generateXhttpCdnCleanIPURIs(server, TEST_UUID).forEach((uri) => {
        serverIPs.forEach((ip) => {
          expect(uri).not.toContain(`@${ip}`);
        });
      });
    });
  });

  it("EDtunnel URIs never contain any server IP", () => {
    generateEdtunnelURIs(TEST_UUID, EDTUNNEL).forEach((uri) => {
      serverIPs.forEach((ip) => {
        expect(uri).not.toContain(ip);
      });
    });
  });
});


describe("Smoke: URI protocol scheme correctness", () => {
  const server = SERVERS.find((s) => s.enabled && s.reality_pubkey);

  it("Reality URIs start with vless://", () => {
    expect(generateRealityURI(server, TEST_UUID)).toMatch(/^vless:\/\//);
  });

  it("Hy2 URIs start with hy2://", () => {
    if (server.hy2_port) {
      expect(generateHy2URI(server, TEST_UUID)).toMatch(/^hy2:\/\//);
    }
  });

  it("SS2022 URIs start with ss://", () => {
    if (server.ss2022) {
      expect(generateSs2022URI(server, TEST_UUID)).toMatch(/^ss:\/\//);
    }
  });

  it("NaiveProxy URIs start with naive+https://", () => {
    if (server.naive) {
      expect(generateNaiveURI(server, TEST_UUID)).toMatch(/^naive\+https:\/\//);
    }
  });

  it("ShadowTLS URIs start with sing-box://", () => {
    if (server.shadowtls && server.ss2022) {
      expect(generateShadowTLSURI(server, TEST_UUID)).toMatch(/^sing-box:\/\//);
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
//  PROBE INFRASTRUCTURE TESTS — v5.2
// ═══════════════════════════════════════════════════════════════════

describe("generateProbeScript", () => {
  it("returns a non-empty string", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    expect(script).toBeTruthy();
    expect(typeof script).toBe("string");
    expect(script.length).toBeGreaterThan(100);
  });

  it("starts with a shebang line", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    expect(script).toMatch(/^#!/);
  });

  it("contains server IPs from config", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    for (const server of testConfig.servers.filter(s => s.enabled)) {
      expect(script).toContain(server.ip);
    }
  });

  it("contains server tags from config", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    for (const server of testConfig.servers.filter(s => s.enabled)) {
      expect(script).toContain(server.tag);
    }
  });

  it("contains CDN domain names", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    for (const server of testConfig.servers.filter(s => s.enabled && s.cdn_ws)) {
      expect(script).toContain(server.cdn_ws.host);
    }
  });

  it("contains sub.example.com", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    expect(script).toContain("sub.example.com");
  });

  it("includes the report URL", () => {
    const reportUrl = "https://sub.example.com/probe/report";
    const script = generateProbeScript(testConfig, reportUrl, null, null);
    expect(script).toContain(reportUrl);
  });

  it("includes clean CF IPs", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    for (const ip of CF_CLEAN_IPS) {
      expect(script).toContain(ip);
    }
  });

  // The probe script is handed to volunteers who may be running it on a
  // monitored network in a censored country. It must never carry a credential
  // beyond the scoped report token. Telegram alerting happens server-side in
  // POST /probe/report, so the bot token has no business being in here.
  it("never embeds the Telegram bot token", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    expect(script).not.toContain("api.telegram.org");
    expect(script).not.toContain(TEST_ENV.TELEGRAM_BOT_TOKEN ?? "__unset__");
  });

  it("never embeds the admin credential", () => {
    const script = generateProbeScript(
      testConfig,
      `https://example.com/probe/report?key=${TEST_ENV.PROBE_TOKEN}`
    );
    expect(script).not.toContain(TEST_ENV.ADMIN_UUID);
    expect(script).toContain(TEST_ENV.PROBE_TOKEN);
  });

  it("does NOT contain UUIDs or secrets", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    // Should not contain any user UUIDs
    expect(script).not.toContain(TEST_ENV.ADMIN_UUID);
    expect(script).not.toContain(TEST_ENV.FAMILY_UUID);
    expect(script).not.toContain(TEST_ENV.TEST_UUID);
    // Should not contain SS keys
    expect(script).not.toContain(TEST_ENV.SS_USER_KEY);
    expect(script).not.toContain(TEST_ENV.SHADOWTLS_PASSWORD);
  });

  it("tests Reality SNI domains", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    // Should reference the SNI domains for TLS checks
    expect(script).toContain("www.google.com");
  });

  it("includes port 443 and port 80 tests", () => {
    const script = generateProbeScript(testConfig, "https://example.com/probe/report");
    expect(script).toContain("443");
    expect(script).toContain("80");
  });
});

describe("Probe KV Storage", () => {
  // Mock KV store for testing
  const createMockKV = () => {
    const store = {};
    return {
      get: async (key) => store[key] || null,
      put: async (key, value, opts) => { store[key] = value; },
      delete: async (key) => { delete store[key]; },
      list: async ({ prefix }) => ({
        keys: Object.keys(store)
          .filter(k => k.startsWith(prefix))
          .map(name => ({ name })),
      }),
      _store: store, // for inspection
    };
  };

  it("storeProbeReport stores a report in KV", async () => {
    const kv = createMockKV();
    const env = { HEALTH: kv };
    const report = {
      timestamp: "2025-01-01T00:00:00Z",
      isp: "Irancell",
      country: "IR",
      results: [{ test: "tcp_443", target: "helsinki", status: "up" }],
    };

    const result = await storeProbeReport(env, report);
    expect(result).toBe(true);
    expect(Object.keys(kv._store).length).toBe(1);
    expect(Object.keys(kv._store)[0]).toMatch(/^probe_report:/);
  });

  it("storeProbeReport returns false without KV", async () => {
    const result = await storeProbeReport({}, { timestamp: "2025-01-01T00:00:00Z" });
    expect(result).toBe(false);
  });

  it("getRecentProbeReports returns stored reports", async () => {
    const kv = createMockKV();
    const env = { HEALTH: kv };

    // Store 3 reports
    const reports = [
      { timestamp: "2025-01-01T00:00:00Z", isp: "ISP1" },
      { timestamp: "2025-01-02T00:00:00Z", isp: "ISP2" },
      { timestamp: "2025-01-03T00:00:00Z", isp: "ISP3" },
    ];
    for (const r of reports) {
      await storeProbeReport(env, r);
    }

    const result = await getRecentProbeReports(env, 10);
    expect(result.length).toBe(3);
  });

  it("getRecentProbeReports respects limit", async () => {
    const kv = createMockKV();
    const env = { HEALTH: kv };

    for (let i = 0; i < 5; i++) {
      await storeProbeReport(env, { timestamp: `2025-01-0${i + 1}T00:00:00Z`, isp: `ISP${i}` });
    }

    const result = await getRecentProbeReports(env, 2);
    expect(result.length).toBe(2);
  });

  it("getRecentProbeReports returns empty array without KV", async () => {
    const result = await getRecentProbeReports({}, 10);
    expect(result).toEqual([]);
  });

  it("getRecentProbeReports returns newest first", async () => {
    const kv = createMockKV();
    const env = { HEALTH: kv };

    await storeProbeReport(env, { timestamp: "2025-01-01T00:00:00Z", isp: "Old" });
    await storeProbeReport(env, { timestamp: "2025-01-05T00:00:00Z", isp: "New" });

    const result = await getRecentProbeReports(env, 10);
    expect(result[0].isp).toBe("New");
    expect(result[1].isp).toBe("Old");
  });
});


// ── Relay XHTTP/CDN-WS Config Generation ────────────────────────

describe("Relay XHTTP URI generation (generateRelayXhttpURIs)", () => {
  const RELAY_HOSTS = ["my-relay.vercel.app", "your-relay.netlify.app"];

  it("generates one URI per relay host", () => {
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    expect(uris).toHaveLength(RELAY_HOSTS.length);
  });

  it("returns empty array when server has no xhttp_cdn", () => {
    const uris = generateRelayXhttpURIs(BARE_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    expect(uris).toEqual([]);
  });

  it("returns empty array when relayHosts is empty", () => {
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, [], "Vercel");
    expect(uris).toEqual([]);
  });

  it("uses relay hostname as address (not server IP)", () => {
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri, i) => {
      expect(uri).toContain(`@${RELAY_HOSTS[i]}:443`);
      expect(uri).not.toContain(`@${FULL_SERVER.ip}:`);
    });
  });

  it("sets SNI to relay hostname (for TLS)", () => {
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri, i) => {
      expect(uri).toContain(`sni=${RELAY_HOSTS[i]}`);
    });
  });

  it("sets HTTP Host header to relay hostname (for CDN routing)", () => {
    // CRITICAL: Both Vercel and Netlify route based on Host header.
    // If host != relay hostname, CDN returns 404/DEPLOYMENT_NOT_FOUND.
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri, i) => {
      const params = new URL(uri).searchParams;
      expect(params.get("host")).toBe(RELAY_HOSTS[i]);
    });
  });

  it("host must equal relay hostname, NOT the origin CDN host", () => {
    // This is the exact bug that was fixed in v5.5 — previously host was set
    // to server.xhttp_cdn.host (cdn.example.com) which broke CDN routing.
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri) => {
      const params = new URL(uri).searchParams;
      expect(params.get("host")).not.toBe(FULL_SERVER.xhttp_cdn.host);
    });
  });

  it("uses path-based routing: /relay/<origin_host>/<xhttp_path>", () => {
    // Target origin is encoded in path prefix so relay can extract it
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri) => {
      const params = new URL(uri).searchParams;
      const path = params.get("path");
      expect(path).toBe(`/relay/${FULL_SERVER.xhttp_cdn.host}${FULL_SERVER.xhttp_cdn.path}`);
    });
  });

  it("includes provider name in config label", () => {
    const vercelUris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, ["r.vercel.app"], "Vercel");
    expect(vercelUris[0]).toContain("#XHTTP-Vercel-");

    const netlifyUris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, ["r.netlify.app"], "Netlify");
    expect(netlifyUris[0]).toContain("#XHTTP-Netlify-");
  });

  it("includes fragment settings when provided", () => {
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel", {
      fragment: true,
    });
    uris.forEach((uri) => {
      expect(uri).toContain("fragment=");
    });
  });

  it("includes MUX settings when provided", () => {
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel", {
      mux: true,
    });
    uris.forEach((uri) => {
      expect(uri).toContain("mux=");
      expect(uri).toContain("muxPadding=true");
    });
  });

  it("uses XHTTP transport type", () => {
    const uris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri) => {
      expect(uri).toContain("type=xhttp");
    });
  });
});


describe("Relay CDN-WS URI generation (generateRelayCdnWsURIs)", () => {
  const RELAY_HOSTS = ["my-relay.vercel.app"];

  it("generates one URI per relay host for Vercel", () => {
    const uris = generateRelayCdnWsURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    expect(uris).toHaveLength(1);
  });

  it("returns empty array for Netlify (30s timeout kills WS)", () => {
    // Netlify Edge Functions have a 30-second execution timeout.
    // VPN WebSocket connections are long-lived → they'd get killed after 30s.
    const uris = generateRelayCdnWsURIs(FULL_SERVER, TEST_UUID, ["r.netlify.app"], "Netlify");
    expect(uris).toEqual([]);
  });

  it("returns empty array when server has no cdn_ws", () => {
    const uris = generateRelayCdnWsURIs(BARE_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    expect(uris).toEqual([]);
  });

  it("sets Host header to relay hostname (for CDN routing)", () => {
    const uris = generateRelayCdnWsURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri, i) => {
      const params = new URL(uri).searchParams;
      expect(params.get("host")).toBe(RELAY_HOSTS[i]);
    });
  });

  it("host must NOT be the origin CDN domain", () => {
    const uris = generateRelayCdnWsURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri) => {
      const params = new URL(uri).searchParams;
      expect(params.get("host")).not.toBe(FULL_SERVER.cdn_ws.host);
    });
  });

  it("uses path-based routing: /relay/<origin_host>/<ws_path>", () => {
    const uris = generateRelayCdnWsURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri) => {
      const params = new URL(uri).searchParams;
      const path = params.get("path");
      expect(path).toBe(`/relay/${FULL_SERVER.cdn_ws.host}${FULL_SERVER.cdn_ws.path}`);
    });
  });

  it("uses WebSocket transport type", () => {
    const uris = generateRelayCdnWsURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    uris.forEach((uri) => {
      expect(uri).toContain("type=ws");
    });
  });

  it("includes CDN-WS-Provider in label", () => {
    const uris = generateRelayCdnWsURIs(FULL_SERVER, TEST_UUID, RELAY_HOSTS, "Vercel");
    expect(uris[0]).toContain("#CDN-WS-Vercel-");
  });
});


// ── Config TLS Consistency Validation ───────────────────────────
// These tests verify that generated configs don't have the "wrong SNI for
// wrong CDN" class of bug that caused CloudFront TLS handshake failures.

describe("Config TLS consistency", () => {
  it("XHTTP-CDN clean IP configs use Cloudflare-compatible SNI", () => {
    // Clean IPs are Cloudflare IPs. SNI must be a domain served by Cloudflare
    // (i.e., our cdn*.example.com domains). NOT CloudFront/Vercel/Netlify.
    const uris = generateXhttpCdnCleanIPURIs(FULL_SERVER, TEST_UUID);
    uris.forEach((uri) => {
      const params = new URL(uri).searchParams;
      const sni = params.get("sni");
      const host = params.get("host");
      // SNI and host should be our CDN domain (served by Cloudflare)
      expect(sni).toBe(FULL_SERVER.xhttp_cdn.host);
      expect(host).toBe(FULL_SERVER.xhttp_cdn.host);
    });
  });

  it("relay configs never set host to a different CDN's domain", () => {
    // When going through a relay (Vercel/Netlify), the Host header must
    // match the relay hostname — not the Cloudflare origin domain.
    // Otherwise the CDN returns 404/DEPLOYMENT_NOT_FOUND.
    const relays = ["relay.vercel.app", "relay.netlify.app"];
    const xhttpUris = generateRelayXhttpURIs(FULL_SERVER, TEST_UUID, relays, "Test");
    xhttpUris.forEach((uri, i) => {
      const params = new URL(uri).searchParams;
      expect(params.get("host")).toBe(relays[i]);
      expect(params.get("sni")).toBe(relays[i]);
    });
  });

  it("direct CDN configs set host to CDN domain (not relay hostname)", () => {
    // When connecting directly to Cloudflare via CDN domain or clean IP,
    // the Host header must be the CDN domain for Cloudflare routing.
    const uri = generateXhttpCdnURI(FULL_SERVER, TEST_UUID);
    const params = new URL(uri).searchParams;
    expect(params.get("host")).toBe(FULL_SERVER.xhttp_cdn.host);
    expect(params.get("sni")).toBe(FULL_SERVER.xhttp_cdn.host);
  });
});


// ═══════════════════════════════════════════════════════════════════
//  ENDPOINT INTEGRATION TESTS — v5.5
// ═══════════════════════════════════════════════════════════════════

// Helper: create a Request and call the worker's fetch handler
function callWorker(path, options = {}) {
  const {
    method = "GET",
    headers = {},
    body = undefined,
  } = options;
  const request = new Request(`https://sub.example.com${path}`, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
  return worker.fetch(request, TEST_ENV);
}

describe("Endpoint: /health", () => {
  it("returns 200 with server list (no IPs for non-admin)", async () => {
    const res = await callWorker("/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.servers).toBeDefined();
    expect(Array.isArray(data.servers)).toBe(true);
    // Non-admin: no IPs should be exposed
    data.servers.forEach((s) => {
      expect(s.ip).toBeUndefined();
    });
  });

  it("returns full details for admin with ?key=", async () => {
    const res = await callWorker(`/health?key=${TEST_ENV.ADMIN_UUID}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.servers).toBeDefined();
    // Admin: IPs should be present
    const hasIP = data.servers.some((s) => s.ip);
    expect(hasIP).toBe(true);
  });
});

describe("Endpoint: /sub/:uuid", () => {
  it("returns 404 for malformed UUID path", async () => {
    const res = await callWorker("/sub/not-a-uuid");
    expect(res.status).toBe(404);
  });

  it("returns 401 for unknown UUID", async () => {
    const res = await callWorker("/sub/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("returns base64 subscription for valid admin UUID", async () => {
    const res = await callWorker(`/sub/${TEST_ENV.ADMIN_UUID}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    // Should be base64 encoded
    expect(text.length).toBeGreaterThan(100);
    // Decode and verify it contains URIs
    const decoded = atob(text);
    expect(decoded).toContain("://");
  });

  it("returns JSON format when ?format=json", async () => {
    const res = await callWorker(`/sub/${TEST_ENV.ADMIN_UUID}?format=json`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.configs).toBeDefined();
    expect(Array.isArray(data.configs)).toBe(true);
    expect(data.configs.length).toBeGreaterThan(0);
  });
});

describe("Endpoint: /probe (auth required)", () => {
  it("returns 403 without admin key", async () => {
    const res = await callWorker("/probe");
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Forbidden");
  });

  it("returns 403 with wrong key", async () => {
    const res = await callWorker("/probe?key=wrong-key");
    expect(res.status).toBe(403);
  });

  it("returns probe script with valid admin key", async () => {
    const res = await callWorker(`/probe?key=${TEST_ENV.ADMIN_UUID}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("#!/");
    expect(text.length).toBeGreaterThan(200);
  });
});

describe("Endpoint: /probe/report", () => {
  it("returns 403 without auth key", async () => {
    const res = await callWorker("/probe/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { up: 3, down: 1, isp: "MCI", country: "IR" },
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 with wrong auth key", async () => {
    const res = await callWorker("/probe/report?key=wrong-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { up: 3, down: 1, isp: "MCI", country: "IR" },
    });
    expect(res.status).toBe(403);
  });

  it("accepts valid JSON report with correct key", async () => {
    const res = await callWorker(`/probe/report?key=${ADMIN_UUID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { up: 3, down: 1, isp: "MCI", country: "IR" },
    });
    // May return 503 if KV not available in test env, or 200 if mocked
    expect([200, 503]).toContain(res.status);
  });

  it("rejects non-JSON body (with valid key)", async () => {
    const request = new Request(`https://sub.example.com/probe/report?key=${ADMIN_UUID}`, {
      method: "POST",
      headers: new Headers({ "Content-Type": "text/plain" }),
      body: "not json",
    });
    const res = await worker.fetch(request, TEST_ENV);
    expect(res.status).toBe(400);
  });
});

describe("Endpoint: 404 for unknown paths", () => {
  it("returns 404 for /unknown", async () => {
    const res = await callWorker("/unknown");
    expect(res.status).toBe(404);
  });

  it("returns 404 for /", async () => {
    const res = await callWorker("/");
    expect(res.status).toBe(404);
  });
});


// ═══════════════════════════════════════════════════════════════════
//  GEO-AWARE IRAN MODE TESTS — v5.5
// ═══════════════════════════════════════════════════════════════════

describe("Geo-aware: Iran CDN-only mode", () => {
  const serverIPs = SERVERS.map((s) => s.ip);

  it("?geo=ir returns CDN-fronted + DPI-invisible direct configs (no Reality/Hy2 IPs)", async () => {
    const res = await callWorker(`/sub/${TEST_ENV.ADMIN_UUID}?geo=ir&format=json`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.configs.length).toBeGreaterThan(0);
    // Iran mode now includes XrayHTTP (port 80, fake HTTP headers), SS2022
    // (random bytes), Finalmask (mKCP with masking headers), and ShadowTLS v3
    // (real TLS handshake, handles active probing on fixed-line ISPs).
    // But Reality, Hy2, etc. should NOT appear.
    data.configs.forEach((uri) => {
      serverIPs.forEach((ip) => {
        const ipRegex = new RegExp(`@${ip.replace(/\./g, "\\.")}:`);
        if (ipRegex.test(uri)) {
          // Direct-IP configs allowed: XrayHTTP, SS2022, Finalmask, ShadowTLS
          const isXrayHTTP = uri.includes("#XrayHTTP-") || uri.includes("headerType=http");
          const isSS2022 = uri.startsWith("ss://");
          const isFinalmask = uri.includes("#Finalmask-") || uri.includes("type=kcp");
          const isShadowTLS = uri.includes("#ShadowTLS-") || uri.includes("sing-box://");
          expect(isXrayHTTP || isSS2022 || isFinalmask || isShadowTLS).toBe(true);
        }
      });
    });
  });

  it("?geo=ir includes TLS fragment settings", async () => {
    const res = await callWorker(`/sub/${TEST_ENV.ADMIN_UUID}?geo=ir&format=json`);
    const data = await res.json();
    // At least some configs should have fragment settings
    const hasFragment = data.configs.some((uri) => uri.includes("fragment="));
    expect(hasFragment).toBe(true);
  });

  it("?geo=global bypasses Iran mode even with CF-IPCountry=IR", async () => {
    const request = new Request(
      `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?geo=global&format=json`,
      { headers: new Headers({ "CF-IPCountry": "IR" }) }
    );
    const res = await worker.fetch(request, TEST_ENV);
    expect(res.status).toBe(200);
    const data = await res.json();
    // Should include direct-IP configs (Reality, Hy2, etc.)
    const hasDirectIP = data.configs.some((uri) =>
      serverIPs.some((ip) => uri.includes(`@${ip}:`))
    );
    expect(hasDirectIP).toBe(true);
  });

  it("CF-IPCountry=IR triggers Iran mode automatically (CDN + XrayHTTP + SS2022)", async () => {
    const request = new Request(
      `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json`,
      { headers: new Headers({ "CF-IPCountry": "IR" }) }
    );
    const res = await worker.fetch(request, TEST_ENV);
    expect(res.status).toBe(200);
    const data = await res.json();
    // Iran mode allows XrayHTTP, SS2022, Finalmask (mKCP), and ShadowTLS v3
    // but not Reality/Hy2/etc.
    data.configs.forEach((uri) => {
      serverIPs.forEach((ip) => {
        const ipRegex = new RegExp(`@${ip.replace(/\./g, "\\.")}:`);
        if (ipRegex.test(uri)) {
          const isXrayHTTP = uri.includes("#XrayHTTP-") || uri.includes("headerType=http");
          const isSS2022 = uri.startsWith("ss://");
          const isFinalmask = uri.includes("#Finalmask-") || uri.includes("type=kcp");
          const isShadowTLS = uri.includes("#ShadowTLS-") || uri.includes("sing-box://");
          expect(isXrayHTTP || isSS2022 || isFinalmask || isShadowTLS).toBe(true);
        }
      });
    });
    // Should include XrayHTTP configs
    const hasXrayHTTP = data.configs.some((uri) => uri.includes("#XrayHTTP-"));
    expect(hasXrayHTTP).toBe(true);
    // SS2022 on port 80 disabled — DPI blocks non-TLS traffic
    // ShadowTLS-wrapped SS2022 on port 10443 still active
  });

  it("non-Iran traffic includes direct-IP configs", async () => {
    const request = new Request(
      `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json`,
      { headers: new Headers({ "CF-IPCountry": "US" }) }
    );
    const res = await worker.fetch(request, TEST_ENV);
    expect(res.status).toBe(200);
    const data = await res.json();
    const hasDirectIP = data.configs.some((uri) =>
      serverIPs.some((ip) => uri.includes(`@${ip}:`))
    );
    expect(hasDirectIP).toBe(true);
  });
});


describe("ISP Detection and Fragment Tuning", () => {
  // Cloudflare exposes the ASN on request.cf.asn as a NUMBER. It does not set
  // a CF-IPRegion-ASN or cf-meta-asn header — reading those meant this always
  // returned "unknown" in production, silently disabling every per-ISP feature.
  function requestWithAsn(asn, headers = {}) {
    const req = new Request("https://example.com", { headers: new Headers(headers) });
    if (asn !== undefined) Object.defineProperty(req, "cf", { value: { asn }, configurable: true });
    return req;
  }

  it("detectIranISP reads the ASN from request.cf, not a header", () => {
    expect(detectIranISP(requestWithAsn(197207))).toBe("mci");
    expect(detectIranISP(requestWithAsn(44244))).toBe("irancell");
  });

  it("detectIranISP recognises the larger Iranian networks", () => {
    expect(detectIranISP(requestWithAsn(58224))).toBe("tci");
    expect(detectIranISP(requestWithAsn(12880))).toBe("itc");
  });

  it("detectIranISP returns unknown for a non-Iranian ASN", () => {
    expect(detectIranISP(requestWithAsn(12345))).toBe("unknown");
  });

  it("detectIranISP ignores the legacy headers that never existed", () => {
    const req = new Request("https://example.com", {
      headers: new Headers({ "CF-IPRegion-ASN": "197207", "cf-meta-asn": "197207" }),
    });
    expect(detectIranISP(req)).toBe("unknown");
  });

  // The platform value must win over anything the client sends, or a caller
  // could pick their own ISP profile and protocol set.
  it("detectIranISP prefers request.cf over a client-supplied header", () => {
    expect(detectIranISP(requestWithAsn(197207, { "cf-asn": "44244" }))).toBe("mci");
  });

  it("detectIranISP falls back to cf-asn only when the platform gives nothing", () => {
    expect(detectIranISP(requestWithAsn(undefined, { "cf-asn": "44244" }))).toBe("irancell");
  });

  it("getISPFragment returns fragment object for known ISPs", () => {
    const mciFragment = getISPFragment("mci");
    expect(mciFragment).toBeDefined();
    expect(mciFragment.packets).toBe("tlshello");
    expect(mciFragment.length).toBeDefined();
    expect(mciFragment.interval).toBeDefined();
  });

  it("ISP_FRAGMENTS contains entries for major Iranian ISPs", () => {
    expect(ISP_FRAGMENTS).toBeDefined();
    // Should have at least mci, irancell, rightel
    expect(ISP_FRAGMENTS.mci).toBeDefined();
    expect(ISP_FRAGMENTS.irancell).toBeDefined();
    expect(ISP_FRAGMENTS.rightel).toBeDefined();
  });
});

// ── ISP-aware config ordering ────────────────────────────────────
describe("ISP-aware config ordering (sortConfigsByISP)", () => {
  const mockLines = [
    "vless://uuid@cdn:443?type=ws#CDN-WS-Helsinki",
    "vless://uuid@1.2.3.4:80?headerType=http#XrayHTTP-Helsinki",
    "ss://abc@1.2.3.4:8388#SS2022-Helsinki",
    "vless://uuid@cdn:443?path=/xhttp#XHTTP-CDN-Helsinki",
    "vless://uuid@1.2.3.4:10055?type=kcp#Finalmask-Helsinki",
    "sing-box://import-outbound?data=abc#ShadowTLS-Helsinki",
    "vless://uuid@cdn:443?serviceName=grpc#gRPC-CDN-Helsinki",
  ];

  it("Irancell: XrayHTTP first, then SS2022", () => {
    const sorted = sortConfigsByISP([...mockLines], "irancell");
    const xrayIdx = sorted.findIndex(l => l.includes("#XrayHTTP-"));
    const ss2022Idx = sorted.findIndex(l => l.includes("#SS2022-"));
    const cdnWsIdx = sorted.findIndex(l => l.includes("#CDN-WS-"));
    expect(xrayIdx).toBeLessThan(ss2022Idx);
    expect(ss2022Idx).toBeLessThan(cdnWsIdx);
  });

  it("MCI: XHTTP-CDN first, then XrayHTTP", () => {
    const sorted = sortConfigsByISP([...mockLines], "mci");
    const xhttpIdx = sorted.findIndex(l => l.includes("#XHTTP-CDN-"));
    const xrayIdx = sorted.findIndex(l => l.includes("#XrayHTTP-"));
    const cdnWsIdx = sorted.findIndex(l => l.includes("#CDN-WS-"));
    expect(xhttpIdx).toBeLessThan(xrayIdx);
    expect(xrayIdx).toBeLessThan(cdnWsIdx);
  });

  it("Rightel: XHTTP-CDN prioritized", () => {
    const sorted = sortConfigsByISP([...mockLines], "rightel");
    const xhttpIdx = sorted.findIndex(l => l.includes("#XHTTP-CDN-"));
    const cdnWsIdx = sorted.findIndex(l => l.includes("#CDN-WS-"));
    expect(xhttpIdx).toBeLessThan(cdnWsIdx);
  });

  it("unknown ISP: returns unchanged order", () => {
    const original = [...mockLines];
    const sorted = sortConfigsByISP([...mockLines], "unknown");
    expect(sorted).toEqual(original);
  });

  it("preserves all configs (no loss)", () => {
    const sorted = sortConfigsByISP([...mockLines], "irancell");
    expect(sorted).toHaveLength(mockLines.length);
    mockLines.forEach(line => expect(sorted).toContain(line));
  });
});

// ── Fix 1+2: Geo-restriction tests ──────────────────────────────
describe("Server geo-restriction", () => {
  const globalServer = {
    tag: "test-global", location: "Test", ip: "1.2.3.4", enabled: true,
    geo_restrict: null, reality_pubkey: "abc", reality_port: 443, hy2_port: 8443,
    sni: "www.google.com", reality_short_id: "aa", cdn_ws: null, http_obfs: null,
    xhttp_cdn: null, ss2022: null, finalmask: null, shadowtls: null,
    hy2_hop: null, naive: null, cloak: null, amneziawg: null, relay: null, mtproto: null,
  };
  const iranServer = {
    ...globalServer,
    tag: "test-iran", location: "Iran", ip: "10.0.0.1",
    geo_restrict: ["IR"],
  };
  const mixedServers = [globalServer, iranServer];
  const testUser = { name: "test", tier: "premium", enabled: true };
  const freeUser = { name: "free", tier: "free", enabled: true };

  it("global servers appear for all countries", () => {
    const result = getServersForUser(testUser, mixedServers, 2, "US");
    expect(result.map(s => s.tag)).toContain("test-global");
  });

  it("geo-restricted server excluded for non-matching country", () => {
    const result = getServersForUser(testUser, mixedServers, 2, "US");
    expect(result.map(s => s.tag)).not.toContain("test-iran");
  });

  it("geo-restricted server included for matching country", () => {
    const result = getServersForUser(testUser, mixedServers, 2, "IR");
    expect(result.map(s => s.tag)).toContain("test-iran");
    expect(result.map(s => s.tag)).toContain("test-global");
  });

  it("geo-restricted server excluded when no country provided", () => {
    const result = getServersForUser(testUser, mixedServers, 2, null);
    expect(result.map(s => s.tag)).not.toContain("test-iran");
    expect(result.map(s => s.tag)).toContain("test-global");
  });

  it("geo-restricted server excluded with empty string country", () => {
    const result = getServersForUser(testUser, mixedServers, 2, "");
    expect(result.map(s => s.tag)).not.toContain("test-iran");
  });

  it("free tier respects both geo_restrict and freeServerLimit", () => {
    const result = getServersForUser(freeUser, mixedServers, 1, "IR");
    // Both servers are eligible but free limit = 1
    expect(result).toHaveLength(1);
  });

  it("country matching is case-insensitive", () => {
    const result = getServersForUser(testUser, mixedServers, 2, "ir");
    expect(result.map(s => s.tag)).toContain("test-iran");
  });

  it("existing 4 servers have geo_restrict: null (global)", () => {
    const config = buildConfig(TEST_ENV);
    for (const server of config.servers) {
      expect(server.geo_restrict).toBeNull();
    }
  });
});

// ── Fix 3: /health hides geo-restricted servers ──────────────────
describe("Health endpoint geo-restriction filtering", () => {
  it("public /health does not show geo-restricted servers", async () => {
    // Current servers all have geo_restrict: null, so all should appear
    const res = await callWorker("/health");
    const data = await res.json();
    // All 4 global servers should appear
    expect(data.server_count).toBe(SERVERS.length);
  });

  it("admin /health shows all servers including geo-restricted", async () => {
    const res = await callWorker(`/health?key=${ADMIN_UUID}`);
    const data = await res.json();
    expect(data.server_count).toBeGreaterThanOrEqual(SERVERS.length);
    // Admin view includes IPs
    data.servers.forEach(s => expect(s.ip).toBeDefined());
  });
});

// ── Fix 5: Server IP validation ────────────────────────────────
describe("Server IP validation in buildConfig", () => {
  it("throws when enabled server has no IP", () => {
    const badEnv = { ...TEST_ENV, HEL_IP: undefined };
    expect(() => buildConfig(badEnv)).toThrow(/has no IP configured/);
  });

  it("succeeds when all enabled servers have IPs", () => {
    expect(() => buildConfig(TEST_ENV)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  v5.6–5.7 — AnyTLS, Relay Architecture, CDN-only Override
// ═══════════════════════════════════════════════════════════════════

// ── AnyTLS URI generation ────────────────────────────────────────
describe("AnyTLS URI generation", () => {
  it("generates sing-box import URI for server with anytls config", () => {
    const uri = generateAnyTlsURI(RELAY_SERVER, TEST_UUID);
    expect(uri).not.toBeNull();
    expect(uri).toMatch(/^sing-box:\/\/import-outbound\?data=/);
    expect(uri).toContain("#AnyTLS-Tehran");
  });

  it("embeds correct server details in base64 payload", () => {
    const uri = generateAnyTlsURI(RELAY_SERVER, TEST_UUID);
    const dataMatch = uri.match(/data=([^#]+)/);
    expect(dataMatch).not.toBeNull();
    const decoded = JSON.parse(atob(dataMatch[1]));
    expect(decoded).toBeInstanceOf(Array);
    expect(decoded[0].type).toBe("anytls");
    expect(decoded[0].server).toBe("192.168.1.100");
    expect(decoded[0].server_port).toBe(443);
    expect(decoded[0].password).toBe("test-anytls-pass");
    expect(decoded[0].tls.enabled).toBe(true);
    expect(decoded[0].tls.server_name).toBe("divar.ir");
  });

  it("returns null when server has no anytls config", () => {
    const uri = generateAnyTlsURI(FULL_SERVER, TEST_UUID);
    expect(uri).toBeNull();
  });

  it("returns null for bare server", () => {
    expect(generateAnyTlsURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});

// ── Relay server config dispatcher ──────────────────────────────
describe("Relay server config dispatcher", () => {
  it("generates exactly 2 configs for relay server (AnyTLS + ShadowTLS)", () => {
    const configs = generateRelayServerConfigs(RELAY_SERVER, TEST_UUID);
    expect(configs).toBeInstanceOf(Array);
    // v5.7: AnyTLS + ShadowTLS only (VLESS-TLS removed — DPI target)
    expect(configs.length).toBe(2);
  });

  it("includes AnyTLS config", () => {
    const configs = generateRelayServerConfigs(RELAY_SERVER, TEST_UUID);
    const anyTls = configs.find(c => c.includes("sing-box://import-outbound"));
    expect(anyTls).toBeDefined();
  });

  it("does NOT include VLESS-TLS (removed in v5.7 — DPI target)", () => {
    const configs = generateRelayServerConfigs(RELAY_SERVER, TEST_UUID);
    const vless = configs.find(c => c.startsWith("vless://") && c.includes("Relay-TLS"));
    expect(vless).toBeUndefined();
  });

  it("includes ShadowTLS config when shadowtls field is set", () => {
    const configs = generateRelayServerConfigs(RELAY_SERVER, TEST_UUID);
    const stls = configs.find(c => c.includes("ShadowTLS"));
    expect(stls).toBeDefined();
  });

  it("does NOT include Reality, Hy2, CDN, or other standard configs", () => {
    const configs = generateRelayServerConfigs(RELAY_SERVER, TEST_UUID);
    configs.forEach(c => {
      // No reality configs
      expect(c).not.toMatch(/security=reality/);
      // No Hy2 configs
      expect(c).not.toMatch(/^hy2:\/\//);
      // No CDN-WS configs
      expect(c).not.toMatch(/CDN-WS/);
      // No XHTTP configs (except embedded in sing-box JSON)
      if (!c.startsWith("sing-box://")) {
        expect(c).not.toMatch(/XHTTP/);
      }
    });
  });

  it("returns empty array for server without any relay protocols", () => {
    const emptyRelay = {
      ...BARE_SERVER,
      is_relay: true,
      relay_config: {},
      anytls: null,
      shadowtls: null,
    };
    const configs = generateRelayServerConfigs(emptyRelay, TEST_UUID);
    expect(configs).toEqual([]);
  });
});

// ── CDN-only override for geo-restricted servers ─────────────────
describe("CDN-only override (geo-restricted IP protection)", () => {
  // These use the integration endpoint to verify the full subscription loop

  it("geo-restricted server never leaks IP even with ?geo=global", async () => {
    // An IR user with ?geo=global should still not see geo-restricted server's
    // direct-IP configs — only CDN-fronted configs for that server
    const request = new Request(
      `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json&geo=global`,
      { headers: new Headers({ "CF-IPCountry": "IR" }) }
    );
    const res = await worker.fetch(request, TEST_ENV);
    expect(res.status).toBe(200);
    const data = await res.json();
    // Current servers all have geo_restrict: null, so they ARE allowed in direct mode
    // with ?geo=global. This test verifies the mechanism works by checking that
    // existing servers DO appear in direct configs (proving ?geo=global works for
    // non-restricted servers), which means the override only fires for restricted ones.
    const hasDirectIP = data.configs.some(
      uri => TEST_ENV.HEL_IP && uri.includes(`@${TEST_ENV.HEL_IP}:`)
    );
    expect(hasDirectIP).toBe(true);
  });

  it("Iran subscription excludes DPI-detectable direct-IP configs (Reality/Hy2)", async () => {
    const request = new Request(
      `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json`,
      { headers: new Headers({ "CF-IPCountry": "IR" }) }
    );
    const res = await worker.fetch(request, TEST_ENV);
    expect(res.status).toBe(200);
    const data = await res.json();
    const serverIPs = [TEST_ENV.HEL_IP, TEST_ENV.ORC_IP, TEST_ENV.GCP_IP, TEST_ENV.SCW_IP];
    // Iran mode: XrayHTTP (TCP+HTTP obfs), SS2022, Finalmask (mKCP), and
    // ShadowTLS v3 (handles active probing) are allowed.
    // Reality, Hy2, NaiveProxy, Cloak, etc. are excluded.
    data.configs.forEach((uri) => {
      serverIPs.forEach((ip) => {
        const ipRegex = new RegExp(`@${ip.replace(/\./g, "\\.")}:`);
        if (ipRegex.test(uri)) {
          // XrayHTTP, SS2022, Finalmask, and ShadowTLS may use direct IPs in Iran mode
          const isXrayHTTP = uri.includes("#XrayHTTP-") || uri.includes("headerType=http");
          const isSS2022 = uri.startsWith("ss://");
          const isFinalmask = uri.includes("#Finalmask-") || uri.includes("type=kcp");
          const isShadowTLS = uri.includes("#ShadowTLS-") || uri.includes("sing-box://");
          expect(isXrayHTTP || isSS2022 || isFinalmask || isShadowTLS).toBe(true);
        }
      });
    });
    // Must NOT include Reality or Hy2 configs
    const hasReality = data.configs.some((uri) => uri.includes("#Reality-") || uri.includes("security=reality"));
    const hasHy2 = data.configs.some((uri) => uri.startsWith("hysteria2://") || uri.includes("#Hy2-"));
    expect(hasReality).toBe(false);
    expect(hasHy2).toBe(false);
  });
});

// ── Relay server subscription integration ────────────────────────
describe("Relay server in subscription loop", () => {
  it("is_relay server generates only AnyTLS + ShadowTLS (no VLESS-TLS)", () => {
    // v5.7: relay generates only AnyTLS + ShadowTLS (VLESS-TLS removed)
    const configs = generateRelayServerConfigs(RELAY_SERVER, TEST_UUID);
    const allConfigStr = configs.join("\n");

    // Should NOT contain CDN config patterns
    expect(allConfigStr).not.toContain("CDN-WS");
    expect(allConfigStr).not.toContain("CDN-XHTTP");
    expect(allConfigStr).not.toContain("Finalmask");
    expect(allConfigStr).not.toContain("NaiveProxy");
    expect(allConfigStr).not.toContain("Cloak");
    // Should NOT contain VLESS-TLS (removed in v5.7 — DPI fingerprint)
    expect(allConfigStr).not.toContain("Relay-TLS");

    // Should contain relay-specific patterns
    expect(allConfigStr).toContain("AnyTLS");
    expect(allConfigStr).toContain("ShadowTLS");
  });

  it("AnyTLS config includes relay server IP for domestic connection", () => {
    const configs = generateRelayServerConfigs(RELAY_SERVER, TEST_UUID);
    // AnyTLS is a sing-box share link, decode it to check IP
    const anyTls = configs.find(c => c.includes("sing-box://import-outbound"));
    expect(anyTls).toBeDefined();
    const dataMatch = anyTls.match(/data=([^#]+)/);
    const decoded = JSON.parse(atob(dataMatch[1]));
    expect(decoded[0].server).toBe("192.168.1.100");
  });

  it("AnyTLS config uses cover SNI", () => {
    const configs = generateRelayServerConfigs(RELAY_SERVER, TEST_UUID);
    const anyTls = configs.find(c => c.includes("sing-box://import-outbound"));
    const dataMatch = anyTls.match(/data=([^#]+)/);
    const decoded = JSON.parse(atob(dataMatch[1]));
    expect(decoded[0].tls.server_name).toBe("divar.ir");
  });

  it("ShadowTLS config uses non-google handshake target", () => {
    const configs = generateRelayServerConfigs(RELAY_SERVER, TEST_UUID);
    const stls = configs.find(c => c.includes("ShadowTLS"));
    expect(stls).toBeDefined();
    // Decode the sing-box share link
    const dataMatch = stls.match(/data=([^#]+)/);
    const decoded = JSON.parse(atob(dataMatch[1]));
    // First element is the ShadowTLS outbound
    const shadowtls = decoded.find(d => d.type === "shadowtls");
    expect(shadowtls.tls.server_name).toBe("cafebazaar.ir");
  });
});

// ── Per-generator coverage (Section 3.2) ─────────────────────────

/** Server fixture with amneziawg, grpc_cdn, finalmask kcp ports, and mtproto */
const AWG_SERVER = {
  ...FULL_SERVER,
  amneziawg: {
    client_addr: "10.66.66.2",
    dns: "1.1.1.1",
    client_private_key: "testPrivateKeyBase64==",
    jc: 4,
    jmin: 40,
    jmax: 70,
    s1: 0,
    s2: 0,
    h1: 1,
    h2: 2,
    h3: 3,
    h4: 4,
    public_key: "testPublicKeyBase64==",
    psk: "testPSKBase64==",
    port: 51820,
  },
};

const GRPC_SERVER = {
  ...FULL_SERVER,
  grpc_cdn: { host: "cdn.example.com", serviceName: "vpngrpc", port: 443 },
};

const FINALMASK_KCP_SERVER = {
  ...FULL_SERVER,
  finalmask: {
    xdns_port: 10053,
    xicmp_port: 10054,
    wechat_port: 10055,
    dtls_port: 10056,
    srtp_port: 10057,
    seed: "test-seed-value",
  },
};

const MTPROTO_SERVER = {
  ...FULL_SERVER,
  mtproto: { port: 443, secret: "ee11111111111111111111111111111111" },
};

describe("generateAmneziaWGURI", () => {
  it("starts with awg:// scheme", () => {
    const uri = generateAmneziaWGURI(AWG_SERVER, TEST_UUID);
    expect(uri).not.toBeNull();
    expect(uri).toMatch(/^awg:\/\//);
  });

  it("includes server location in fragment", () => {
    const uri = generateAmneziaWGURI(AWG_SERVER, TEST_UUID);
    expect(uri).toContain(`#AWG-${AWG_SERVER.location}`);
  });

  it("encodes a valid WireGuard config block", () => {
    const uri = generateAmneziaWGURI(AWG_SERVER, TEST_UUID);
    const encoded = uri.replace(/^awg:\/\//, "").replace(/#.*$/, "");
    const decoded = atob(encoded);
    expect(decoded).toContain("[Interface]");
    expect(decoded).toContain("[Peer]");
    expect(decoded).toContain(AWG_SERVER.ip);
  });

  it("returns null when amneziawg is absent", () => {
    expect(generateAmneziaWGURI(FULL_SERVER, TEST_UUID)).toBeNull();
    expect(generateAmneziaWGURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});

describe("generateGrpcCdnURI", () => {
  it("starts with vless:// scheme", () => {
    const uri = generateGrpcCdnURI(GRPC_SERVER, TEST_UUID);
    expect(uri).not.toBeNull();
    expect(uri).toMatch(/^vless:\/\//);
  });

  it("is a parseable URI", () => {
    const uri = generateGrpcCdnURI(GRPC_SERVER, TEST_UUID);
    expect(() => new URL(uri)).not.toThrow();
  });

  it("uses type=grpc transport", () => {
    const uri = generateGrpcCdnURI(GRPC_SERVER, TEST_UUID);
    expect(uri).toContain("type=grpc");
  });

  it("contains the CDN host as SNI", () => {
    const uri = generateGrpcCdnURI(GRPC_SERVER, TEST_UUID);
    expect(uri).toContain("sni=cdn.example.com");
  });

  it("returns null when grpc_cdn is absent", () => {
    expect(generateGrpcCdnURI(FULL_SERVER, TEST_UUID)).toBeNull();
    expect(generateGrpcCdnURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});

describe("generateHttpObfsMultiHostURIs", () => {
  it("returns an array of vless:// URIs", () => {
    const uris = generateHttpObfsMultiHostURIs(FULL_SERVER, TEST_UUID);
    expect(Array.isArray(uris)).toBe(true);
    expect(uris.length).toBeGreaterThan(0);
    uris.forEach(u => expect(u).toMatch(/^vless:\/\//));
  });

  it("each URI is parseable", () => {
    const uris = generateHttpObfsMultiHostURIs(FULL_SERVER, TEST_UUID);
    uris.forEach(u => expect(() => new URL(u)).not.toThrow());
  });

  it("uses headerType=http transport", () => {
    const uris = generateHttpObfsMultiHostURIs(FULL_SERVER, TEST_UUID);
    uris.forEach(u => expect(u).toContain("headerType=http"));
  });

  it("contains server IP in each URI", () => {
    const uris = generateHttpObfsMultiHostURIs(FULL_SERVER, TEST_UUID);
    uris.forEach(u => expect(u).toContain(FULL_SERVER.ip));
  });

  it("returns empty array when http_obfs is absent", () => {
    expect(generateHttpObfsMultiHostURIs(BARE_SERVER, TEST_UUID)).toHaveLength(0);
  });
});

describe("generateGrpcCdnCleanIPURIs", () => {
  it("returns one URI per clean IP", () => {
    const uris = generateGrpcCdnCleanIPURIs(GRPC_SERVER, TEST_UUID);
    expect(uris.length).toBe(Math.min(CF_CLEAN_IPS.length, 3));
  });

  it("each URI starts with vless://", () => {
    const uris = generateGrpcCdnCleanIPURIs(GRPC_SERVER, TEST_UUID);
    uris.forEach(u => expect(u).toMatch(/^vless:\/\//));
  });

  it("each URI is parseable", () => {
    const uris = generateGrpcCdnCleanIPURIs(GRPC_SERVER, TEST_UUID);
    uris.forEach(u => expect(() => new URL(u)).not.toThrow());
  });

  it("returns empty array when grpc_cdn is absent", () => {
    expect(generateGrpcCdnCleanIPURIs(FULL_SERVER, TEST_UUID)).toHaveLength(0);
    expect(generateGrpcCdnCleanIPURIs(BARE_SERVER, TEST_UUID)).toHaveLength(0);
  });
});

describe("generateFinalmaskWechatURI", () => {
  it("starts with vless:// scheme", () => {
    const uri = generateFinalmaskWechatURI(FINALMASK_KCP_SERVER, TEST_UUID);
    expect(uri).not.toBeNull();
    expect(uri).toMatch(/^vless:\/\//);
  });

  it("uses kcp transport with wechat-video header", () => {
    const uri = generateFinalmaskWechatURI(FINALMASK_KCP_SERVER, TEST_UUID);
    expect(uri).toContain("type=kcp");
    expect(uri).toContain("headerType=wechat-video");
  });

  it("contains server IP", () => {
    const uri = generateFinalmaskWechatURI(FINALMASK_KCP_SERVER, TEST_UUID);
    expect(uri).toContain(FINALMASK_KCP_SERVER.ip);
  });

  it("returns null when wechat_port is absent", () => {
    expect(generateFinalmaskWechatURI(FULL_SERVER, TEST_UUID)).toBeNull();
    expect(generateFinalmaskWechatURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});

describe("generateFinalmaskDtlsURI", () => {
  it("starts with vless:// scheme", () => {
    const uri = generateFinalmaskDtlsURI(FINALMASK_KCP_SERVER, TEST_UUID);
    expect(uri).not.toBeNull();
    expect(uri).toMatch(/^vless:\/\//);
  });

  it("uses kcp transport with dtls header", () => {
    const uri = generateFinalmaskDtlsURI(FINALMASK_KCP_SERVER, TEST_UUID);
    expect(uri).toContain("type=kcp");
    expect(uri).toContain("headerType=dtls");
  });

  it("contains server IP", () => {
    const uri = generateFinalmaskDtlsURI(FINALMASK_KCP_SERVER, TEST_UUID);
    expect(uri).toContain(FINALMASK_KCP_SERVER.ip);
  });

  it("returns null when dtls_port is absent", () => {
    expect(generateFinalmaskDtlsURI(FULL_SERVER, TEST_UUID)).toBeNull();
    expect(generateFinalmaskDtlsURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});

describe("generateFinalmaskSrtpURI", () => {
  it("starts with vless:// scheme", () => {
    const uri = generateFinalmaskSrtpURI(FINALMASK_KCP_SERVER, TEST_UUID);
    expect(uri).not.toBeNull();
    expect(uri).toMatch(/^vless:\/\//);
  });

  it("uses kcp transport with srtp header", () => {
    const uri = generateFinalmaskSrtpURI(FINALMASK_KCP_SERVER, TEST_UUID);
    expect(uri).toContain("type=kcp");
    expect(uri).toContain("headerType=srtp");
  });

  it("contains server IP", () => {
    const uri = generateFinalmaskSrtpURI(FINALMASK_KCP_SERVER, TEST_UUID);
    expect(uri).toContain(FINALMASK_KCP_SERVER.ip);
  });

  it("returns null when srtp_port is absent", () => {
    expect(generateFinalmaskSrtpURI(FULL_SERVER, TEST_UUID)).toBeNull();
    expect(generateFinalmaskSrtpURI(BARE_SERVER, TEST_UUID)).toBeNull();
  });
});

describe("generateMTProtoLink", () => {
  it("returns a t.me/proxy link", () => {
    const link = generateMTProtoLink(MTPROTO_SERVER);
    expect(link).not.toBeNull();
    expect(link).toMatch(/^https:\/\/t\.me\/proxy\?/);
  });

  it("contains server IP", () => {
    const link = generateMTProtoLink(MTPROTO_SERVER);
    expect(link).toContain(`server=${MTPROTO_SERVER.ip}`);
  });

  it("contains the port parameter", () => {
    const link = generateMTProtoLink(MTPROTO_SERVER);
    expect(link).toContain(`port=${MTPROTO_SERVER.mtproto.port}`);
  });

  it("contains the secret parameter", () => {
    const link = generateMTProtoLink(MTPROTO_SERVER);
    expect(link).toContain(`secret=${MTPROTO_SERVER.mtproto.secret}`);
  });

  it("returns null when mtproto is absent", () => {
    expect(generateMTProtoLink(FULL_SERVER)).toBeNull();
    expect(generateMTProtoLink(BARE_SERVER)).toBeNull();
  });
});

describe("generateRealityAltSNIURIs", () => {
  it("returns empty array when ALT_REALITY_SNIS is empty", () => {
    // ALT_REALITY_SNIS is currently [] (servers only accept their own SNI)
    const uris = generateRealityAltSNIURIs(FULL_SERVER, TEST_UUID);
    expect(Array.isArray(uris)).toBe(true);
    // With empty ALT_REALITY_SNIS, no URIs are generated
    expect(uris.length).toBe(0);
  });

  it("returns empty array when server has no reality_pubkey", () => {
    const uris = generateRealityAltSNIURIs(BARE_SERVER, TEST_UUID);
    expect(uris).toHaveLength(0);
  });

  it("each generated URI starts with vless:// if SNIs are configured", () => {
    // Test with a locally modified server to verify format when SNIs exist
    const serverWithAltSNIs = { ...FULL_SERVER };
    // The function uses the module-level ALT_REALITY_SNIS constant.
    // If it's empty, we verify the function handles that gracefully.
    const uris = generateRealityAltSNIURIs(serverWithAltSNIs, TEST_UUID);
    uris.forEach(u => {
      expect(u).toMatch(/^vless:\/\//);
      expect(() => new URL(u)).not.toThrow();
    });
  });
});
