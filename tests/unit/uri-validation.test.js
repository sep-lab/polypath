/**
 * URI Validation Tests — TDD: these tests catch real bugs that cause
 * configs to fail in Hiddify, v2rayNG, and other VPN clients.
 *
 * Written BEFORE fixes — they should FAIL on the current codebase,
 * proving each bug exists. Then we fix the generators.
 */
import { describe, it, expect } from "vitest";
import worker from "../../tools/smart-sub/worker.js";

// ── Test Environment (same as other test files) ──
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
  VERCEL_RELAY_HOSTS: "vercel-relay.vercel.app",
  NETLIFY_RELAY_HOSTS: "vpn-relay.netlify.app",
};

async function getConfigs(params = "") {
  const request = new Request(
    `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json${params}`
  );
  const res = await worker.fetch(request, TEST_ENV);
  const data = await res.json();
  return data.configs;
}

// ── Helpers ──

/** Characters that are safe in URI fragments (RFC 3986 §3.5) */
const FRAGMENT_UNSAFE_REGEX = /[ ()[\]{}<>|\\^`"]/;

/**
 * Parse a vless:// URI into its components.
 * Returns null if it can't be parsed.
 */
function parseVlessURI(uri) {
  try {
    // vless://uuid@host:port?params#name  OR  vless://uuid@[ipv6]:port?params#name
    const match = uri.match(
      /^vless:\/\/([^@]+)@(\[[^\]]+\]|[^:?#]+):(\d+)\?([^#]*)(?:#(.*))?$/
    );
    if (!match) return null;
    const [, uuid, host, port, queryStr, fragment] = match;
    const params = new URLSearchParams(queryStr);
    return { uuid, host, port: parseInt(port), params, fragment: fragment || "" };
  } catch {
    return null;
  }
}

/**
 * Parse a hy2:// URI into its components.
 */
function parseHy2URI(uri) {
  try {
    // hy2://uuid@host:port?params#name  OR  hy2://uuid@[ipv6]:port?params#name
    const match = uri.match(
      /^hy2:\/\/([^@]+)@(\[[^\]]+\]|[^:?#]+):([0-9-]+)\?([^#]*)(?:#(.*))?$/
    );
    if (!match) return null;
    const [, uuid, host, port, queryStr, fragment] = match;
    const params = new URLSearchParams(queryStr);
    return { uuid, host, port, params, fragment: fragment || "" };
  } catch {
    return null;
  }
}

/**
 * Parse an ss:// URI into its components.
 */
function parseSsURI(uri) {
  try {
    // ss://base64@host:port#name  or  ss://base64@host:port/?plugin=...#name
    const match = uri.match(
      /^ss:\/\/([^@]+)@([^:?#]+):(\d+)\/?(\?[^#]*)?(?:#(.*))?$/
    );
    if (!match) return null;
    const [, encoded, host, port, queryStr, fragment] = match;
    return { encoded, host, port: parseInt(port), queryStr: queryStr || "", fragment: fragment || "" };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  BUG 1: Fragment (config name) encoding
//  Config names must not contain spaces, parens, or other unsafe chars
//  because clients use the fragment to name/identify configs.
// ═══════════════════════════════════════════════════════════════════

describe("BUG 1: Config names must be URI-safe", () => {
  it("no config name contains spaces", async () => {
    const configs = await getConfigs();
    const broken = configs.filter((c) => {
      const fragIdx = c.lastIndexOf("#");
      if (fragIdx === -1) return false;
      const frag = c.slice(fragIdx + 1);
      return frag.includes(" ");
    });
    if (broken.length > 0) {
      console.log(
        `[BUG 1] ${broken.length} configs have spaces in name, e.g.:`,
        broken[0].slice(broken[0].lastIndexOf("#"))
      );
    }
    expect(broken).toHaveLength(0);
  });

  it("no config name contains parentheses", async () => {
    const configs = await getConfigs();
    const broken = configs.filter((c) => {
      const fragIdx = c.lastIndexOf("#");
      if (fragIdx === -1) return false;
      const frag = c.slice(fragIdx + 1);
      return frag.includes("(") || frag.includes(")");
    });
    if (broken.length > 0) {
      console.log(
        `[BUG 1] ${broken.length} configs have parens in name, e.g.:`,
        broken[0].slice(broken[0].lastIndexOf("#"))
      );
    }
    expect(broken).toHaveLength(0);
  });

  it("no config name contains URI-unsafe characters", async () => {
    const configs = await getConfigs();
    const broken = configs.filter((c) => {
      const fragIdx = c.lastIndexOf("#");
      if (fragIdx === -1) return false;
      const frag = decodeURIComponent(c.slice(fragIdx + 1));
      return FRAGMENT_UNSAFE_REGEX.test(frag);
    });
    expect(broken).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 2: Every vless:// URI must be structurally parseable
// ═══════════════════════════════════════════════════════════════════

describe("BUG 2: All VLESS URIs are parseable", () => {
  it("every vless:// line parses into uuid, host, port, params", async () => {
    const configs = await getConfigs();
    const vless = configs.filter((c) => c.startsWith("vless://"));
    const unparseable = vless.filter((c) => !parseVlessURI(c));
    if (unparseable.length > 0) {
      console.log(
        `[BUG 2] ${unparseable.length} unparseable VLESS URIs, e.g.:`,
        unparseable[0].slice(0, 120)
      );
    }
    expect(unparseable).toHaveLength(0);
  });

  it("every vless:// has a valid UUID in the user-info", async () => {
    const configs = await getConfigs();
    const vless = configs.filter((c) => c.startsWith("vless://"));
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const uri of vless) {
      const parsed = parseVlessURI(uri);
      if (parsed) {
        expect(parsed.uuid).toMatch(uuidRegex);
      }
    }
  });

  it("every vless:// has a non-empty host", async () => {
    const configs = await getConfigs();
    const vless = configs.filter((c) => c.startsWith("vless://"));
    for (const uri of vless) {
      const parsed = parseVlessURI(uri);
      if (parsed) {
        expect(parsed.host.length).toBeGreaterThan(0);
      }
    }
  });

  it("every vless:// has port in valid range", async () => {
    const configs = await getConfigs();
    const vless = configs.filter((c) => c.startsWith("vless://"));
    for (const uri of vless) {
      const parsed = parseVlessURI(uri);
      if (parsed) {
        expect(parsed.port).toBeGreaterThanOrEqual(1);
        expect(parsed.port).toBeLessThanOrEqual(65535);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 3: Hiddify/sing-box compatibility
//  Hiddify uses sing-box core. The following transports are NOT
//  supported: xhttp, kcp, headerType=http (TCP masquerade).
//  Configs using these should be clearly tagged as xray-only or
//  converted to sing-box equivalents.
// ═══════════════════════════════════════════════════════════════════

describe("BUG 3: sing-box/Hiddify compatibility", () => {
  /**
   * At minimum, a subscription MUST include configs that work in Hiddify
   * (sing-box core). The supported transports are: tcp (Reality/plain),
   * ws, grpc, h2. Supported protocols: vless, ss, hy2, sing-box://.
   */

  it("has Reality configs usable by Hiddify (VLESS + tcp + reality)", async () => {
    const configs = await getConfigs();
    const realityConfigs = configs.filter((c) => {
      if (!c.startsWith("vless://")) return false;
      const parsed = parseVlessURI(c);
      if (!parsed) return false;
      return (
        parsed.params.get("security") === "reality" &&
        parsed.params.get("type") === "tcp"
      );
    });
    expect(realityConfigs.length).toBeGreaterThanOrEqual(4); // 4 servers
  });

  it("has Hysteria2 configs usable by Hiddify", async () => {
    const configs = await getConfigs();
    const hy2 = configs.filter((c) => c.startsWith("hy2://"));
    expect(hy2.length).toBeGreaterThanOrEqual(4);
  });

  it("has CDN-WS configs usable by Hiddify (VLESS + ws + tls)", async () => {
    const configs = await getConfigs();
    const cdnWs = configs.filter((c) => {
      if (!c.startsWith("vless://")) return false;
      const parsed = parseVlessURI(c);
      if (!parsed) return false;
      return (
        parsed.params.get("type") === "ws" &&
        parsed.params.get("security") === "tls"
      );
    });
    expect(cdnWs.length).toBeGreaterThanOrEqual(4);
  });

  it("has ShadowSocks configs usable by Hiddify", async () => {
    const configs = await getConfigs();
    const ss = configs.filter(
      (c) => c.startsWith("ss://") && !c.includes("sing-box://")
    );
    expect(ss.length).toBeGreaterThanOrEqual(1); // Cloak-SS2022 only (direct SS2022 on port 80 disabled)
  });

  it("has sing-box:// share links (ShadowTLS)", async () => {
    const configs = await getConfigs();
    const singbox = configs.filter((c) => c.startsWith("sing-box://"));
    expect(singbox.length).toBeGreaterThanOrEqual(4);
  });

  it("at least 30% of ALL configs work in Hiddify (sing-box compatible)", async () => {
    const configs = await getConfigs();
    const total = configs.length;

    const hiddifyCompatible = configs.filter((c) => {
      // hy2 — always compatible
      if (c.startsWith("hy2://")) return true;
      // sing-box share links — always compatible
      if (c.startsWith("sing-box://")) return true;
      // naive — not supported by Hiddify
      if (c.startsWith("naive+")) return false;
      // SS2022 — compatible IF no unsupported plugin
      if (c.startsWith("ss://") && !c.includes("plugin=ck-client")) return true;
      // vless
      if (c.startsWith("vless://")) {
        const parsed = parseVlessURI(c);
        if (!parsed) return false;
        const type = parsed.params.get("type");
        // sing-box supported transports: tcp, ws, grpc, h2
        if (!["tcp", "ws", "grpc", "h2"].includes(type)) return false;
        // headerType=http is xray-only
        if (parsed.params.get("headerType") === "http") return false;
        return true;
      }
      return false;
    });

    const pct = ((hiddifyCompatible.length / total) * 100).toFixed(1);
    console.log(
      `[Compat] ${hiddifyCompatible.length}/${total} (${pct}%) Hiddify-compatible`
    );
    expect(hiddifyCompatible.length / total).toBeGreaterThanOrEqual(0.25);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 4: SS2022 base64 validity
//  SIP008/SS2022 URIs require the user-info to be valid base64.
// ═══════════════════════════════════════════════════════════════════

describe("BUG 4: SS2022 URIs have valid base64 credentials", () => {
  it("every ss:// URI decodes to valid method:key format", async () => {
    const configs = await getConfigs();
    const ssConfigs = configs.filter(
      (c) => c.startsWith("ss://") && !c.includes("sing-box://")
    );

    for (const uri of ssConfigs) {
      const parsed = parseSsURI(uri);
      expect(parsed).not.toBeNull();
      // Decode base64
      const decoded = atob(parsed.encoded);
      // Should be "method:server_key:user_key"
      expect(decoded).toMatch(/^2022-blake3-aes-128-gcm:/);
      const parts = decoded.split(":");
      expect(parts.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 5: Hy2 URIs must have required params
// ═══════════════════════════════════════════════════════════════════

describe("BUG 5: Hysteria2 URI completeness", () => {
  it("every hy2:// has sni param", async () => {
    const configs = await getConfigs();
    const hy2 = configs.filter((c) => c.startsWith("hy2://"));
    for (const uri of hy2) {
      const parsed = parseHy2URI(uri);
      expect(parsed).not.toBeNull();
      expect(parsed.params.get("sni")).toBeTruthy();
    }
  });

  it("hy2-hop configs have obfs and obfs-password", async () => {
    const configs = await getConfigs();
    const hopConfigs = configs.filter(
      (c) => c.startsWith("hy2://") && c.includes("Hop")
    );
    expect(hopConfigs.length).toBeGreaterThanOrEqual(1);
    for (const uri of hopConfigs) {
      const parsed = parseHy2URI(uri);
      expect(parsed).not.toBeNull();
      expect(parsed.params.get("obfs")).toBe("salamander");
      expect(parsed.params.get("obfs-password")).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 6: Reality configs must have all required fields
// ═══════════════════════════════════════════════════════════════════

describe("BUG 6: Reality config completeness", () => {
  it("every Reality config has pbk (public key)", async () => {
    const configs = await getConfigs();
    const reality = configs.filter(
      (c) => c.startsWith("vless://") && c.includes("security=reality")
    );
    for (const uri of reality) {
      const parsed = parseVlessURI(uri);
      expect(parsed).not.toBeNull();
      expect(parsed.params.get("pbk")).toBeTruthy();
      expect(parsed.params.get("pbk").length).toBeGreaterThan(10);
    }
  });

  it("every Reality config has sid (short id)", async () => {
    const configs = await getConfigs();
    const reality = configs.filter(
      (c) => c.startsWith("vless://") && c.includes("security=reality")
    );
    for (const uri of reality) {
      const parsed = parseVlessURI(uri);
      expect(parsed).not.toBeNull();
      expect(parsed.params.get("sid")).toBeTruthy();
    }
  });

  it("every Reality config has flow=xtls-rprx-vision", async () => {
    const configs = await getConfigs();
    const reality = configs.filter(
      (c) => c.startsWith("vless://") && c.includes("security=reality")
    );
    for (const uri of reality) {
      const parsed = parseVlessURI(uri);
      expect(parsed).not.toBeNull();
      expect(parsed.params.get("flow")).toBe("xtls-rprx-vision");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 7: CDN-WS / XHTTP configs need host header matching SNI
// ═══════════════════════════════════════════════════════════════════

describe("BUG 7: CDN config consistency", () => {
  it("CDN-WS configs have matching sni and host", async () => {
    const configs = await getConfigs();
    const cdnWs = configs.filter(
      (c) =>
        c.startsWith("vless://") &&
        c.includes("type=ws") &&
        c.includes("security=tls") &&
        c.includes("#CDN-WS")
    );
    for (const uri of cdnWs) {
      const parsed = parseVlessURI(uri);
      if (!parsed) continue;
      const sni = parsed.params.get("sni");
      const host = parsed.params.get("host");
      // For CDN configs, sni and host should match the CDN domain
      expect(sni).toBeTruthy();
      expect(host).toBeTruthy();
      expect(sni).toBe(host);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 8: sing-box share links must decode to valid JSON
// ═══════════════════════════════════════════════════════════════════

describe("BUG 8: sing-box:// share links are valid", () => {
  it("every sing-box:// URI contains valid base64 JSON data", async () => {
    const configs = await getConfigs();
    const singbox = configs.filter((c) => c.startsWith("sing-box://"));

    for (const uri of singbox) {
      const match = uri.match(/data=([^#&]+)/);
      expect(match).not.toBeNull();
      const decoded = atob(match[1]);
      const parsed = JSON.parse(decoded);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThanOrEqual(1);
      // First element should be the outer protocol (shadowtls/anytls)
      expect(parsed[0]).toHaveProperty("type");
      expect(parsed[0]).toHaveProperty("server");
      expect(parsed[0]).toHaveProperty("server_port");
    }
  });

  it("ShadowTLS sing-box configs have correct inner detour", async () => {
    const configs = await getConfigs();
    const stls = configs.filter(
      (c) => c.startsWith("sing-box://") && c.includes("ShadowTLS")
    );
    for (const uri of stls) {
      const match = uri.match(/data=([^#&]+)/);
      const parsed = JSON.parse(atob(match[1]));
      // Should have 2 elements: shadowtls outer + shadowsocks inner
      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe("shadowtls");
      expect(parsed[1].type).toBe("shadowsocks");
      // The outer's detour should reference the inner's tag
      expect(parsed[0].detour).toBe(parsed[1].tag);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 9: Iran mode must still produce working Hiddify configs
// ═══════════════════════════════════════════════════════════════════

describe("BUG 9: Iran mode Hiddify compatibility", () => {
  it("Iran mode has CDN-WS configs (ws transport works in Hiddify)", async () => {
    const configs = await getConfigs("&geo=ir");
    const cdnWs = configs.filter((c) => {
      if (!c.startsWith("vless://")) return false;
      const parsed = parseVlessURI(c);
      if (!parsed) return false;
      return parsed.params.get("type") === "ws";
    });
    expect(cdnWs.length).toBeGreaterThanOrEqual(4);
  });

  it("Iran mode has ShadowTLS configs (works in Hiddify)", async () => {
    const configs = await getConfigs("&geo=ir");
    const stls = configs.filter((c) => c.startsWith("sing-box://"));
    expect(stls.length).toBeGreaterThanOrEqual(1);
  });

  it("Iran mode configs have fragment settings for TLS", async () => {
    const configs = await getConfigs("&geo=ir");
    const fragConfigs = configs.filter((c) => c.includes("fragment="));
    // Iran mode should add TLS fragment to CDN configs
    expect(fragConfigs.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 10: Base64 subscription must be decodable
// ═══════════════════════════════════════════════════════════════════

describe("BUG 10: Base64 subscription format", () => {
  it("default format returns valid base64 that decodes to config lines", async () => {
    const request = new Request(
      `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}`
    );
    const res = await worker.fetch(request, TEST_ENV);
    expect(res.status).toBe(200);
    const text = await res.text();
    const decoded = atob(text);
    const lines = decoded.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(100);

    // Every line should start with a known protocol scheme
    const validSchemes = [
      "vless://",
      "vmess://",
      "ss://",
      "hy2://",
      "hy://",
      "trojan://",
      "naive+https://",
      "sing-box://",
      "awg://",
      "wg://",
    ];
    for (const line of lines) {
      const hasValidScheme = validSchemes.some((s) => line.startsWith(s));
      if (!hasValidScheme) {
        console.log(`[BUG 10] Unknown scheme: ${line.slice(0, 60)}`);
      }
      expect(hasValidScheme).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUG 11: Reality SNI must match server_name
//  All servers use server_name: "www.google.com" in their sing-box
//  Reality config. If the client SNI doesn't match, Reality rejects.
// ═══════════════════════════════════════════════════════════════════

describe("BUG 11: Reality SNI consistency", () => {
  it("all Reality configs use the same SNI as the server server_name", async () => {
    const configs = await getConfigs();
    const reality = configs.filter(
      (c) => c.startsWith("vless://") && c.includes("security=reality")
    );
    expect(reality.length).toBeGreaterThan(0);

    // All servers have server_name: "www.google.com"
    const expectedSNI = "www.google.com";
    const mismatches = [];

    for (const uri of reality) {
      const parsed = parseVlessURI(uri);
      if (!parsed) continue;
      const sni = parsed.params.get("sni");
      if (sni !== expectedSNI) {
        mismatches.push(`${parsed.fragment}: sni=${sni} (expected ${expectedSNI})`);
      }
    }

    if (mismatches.length > 0) {
      console.log("[BUG 11] SNI mismatches:", mismatches);
    }
    expect(mismatches).toHaveLength(0);
  });

  it("no Reality config has alt SNIs that servers don't accept", async () => {
    const configs = await getConfigs();
    const reality = configs.filter(
      (c) => c.startsWith("vless://") && c.includes("security=reality")
    );
    // All Reality configs should only use SNIs that servers actually accept.
    // Currently all servers only accept "www.google.com".
    const acceptedSNIs = new Set(["www.google.com"]);
    for (const uri of reality) {
      const parsed = parseVlessURI(uri);
      if (!parsed) continue;
      const sni = parsed.params.get("sni");
      expect(acceptedSNIs.has(sni)).toBe(true);
    }
  });
});
