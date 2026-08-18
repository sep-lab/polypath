import { describe, it, expect } from "vitest";
import worker, { buildConfig } from "../../tools/smart-sub/worker.js";

// ═══════════════════════════════════════════════════════════════════
//  Config Count Regression Test
//
//  This is the PRIMARY regression guard. If a refactoring changes the
//  number of configs generated, this test must be reviewed and the
//  threshold updated intentionally.
// ═══════════════════════════════════════════════════════════════════

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

// Minimum expected config counts — update these intentionally after changes
// Updated for: 9 clean IPs, Madrid CDN-only for Iran, Hiddify filter relaxed
const MIN_GLOBAL_CONFIGS = 115;
const MIN_IRAN_CONFIGS = 50;

describe("Config Count Regression", () => {
  it(`global mode generates >= ${MIN_GLOBAL_CONFIGS} configs`, async () => {
    const request = new Request(
      `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json`
    );
    const res = await worker.fetch(request, TEST_ENV);
    expect(res.status).toBe(200);
    const data = await res.json();
    const count = data.configs.length;
    console.log(`[Config Count] Global mode: ${count} configs`);
    expect(count).toBeGreaterThanOrEqual(MIN_GLOBAL_CONFIGS);
  });

  it(`Iran mode generates >= ${MIN_IRAN_CONFIGS} configs`, async () => {
    const request = new Request(
      `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?geo=ir&format=json`
    );
    const res = await worker.fetch(request, TEST_ENV);
    expect(res.status).toBe(200);
    const data = await res.json();
    const count = data.configs.length;
    console.log(`[Config Count] Iran mode: ${count} configs`);
    expect(count).toBeGreaterThanOrEqual(MIN_IRAN_CONFIGS);
  });

  it("contains all expected protocol types", async () => {
    const request = new Request(
      `https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json`
    );
    const res = await worker.fetch(request, TEST_ENV);
    const data = await res.json();
    const configs = data.configs;

    const protocols = {
      vless: configs.filter((c) => c.startsWith("vless://")),
      hy2: configs.filter((c) => c.startsWith("hy2://")),
      ss2022: configs.filter((c) => c.startsWith("ss://")),
      singbox: configs.filter((c) => c.startsWith("sing-box://")),
    };

    console.log(
      `[Protocol Distribution] VLESS: ${protocols.vless.length}, Hy2: ${protocols.hy2.length}, SS: ${protocols.ss2022.length}, sing-box: ${protocols.singbox.length}`
    );

    expect(protocols.vless.length).toBeGreaterThanOrEqual(1);
    expect(protocols.hy2.length).toBeGreaterThanOrEqual(1);
    expect(protocols.ss2022.length).toBeGreaterThanOrEqual(1);
  });

  it("Iran mode generates fewer configs than global mode", async () => {
    // Global (all protocols)
    const globalRes = await worker.fetch(
      new Request(`https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json`),
      TEST_ENV
    );
    const globalData = await globalRes.json();

    // Iran mode (CDN-only + select direct protocols)
    const iranRes = await worker.fetch(
      new Request(`https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?geo=ir&format=json`),
      TEST_ENV
    );
    const iranData = await iranRes.json();

    console.log(
      `[Mode Comparison] Global: ${globalData.configs.length}, Iran: ${iranData.configs.length}`
    );
    expect(globalData.configs.length).toBeGreaterThan(iranData.configs.length);
  });

  it("Hiddify client filter removes incompatible configs", async () => {
    // Without client filter (default)
    const allRes = await worker.fetch(
      new Request(`https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json`),
      TEST_ENV
    );
    const allData = await allRes.json();

    // With client=hiddify filter
    const hiddifyRes = await worker.fetch(
      new Request(`https://sub.example.com/sub/${TEST_ENV.ADMIN_UUID}?format=json&client=hiddify`),
      TEST_ENV
    );
    const hiddifyData = await hiddifyRes.json();

    console.log(
      `[Client Filter] All: ${allData.configs.length}, Hiddify: ${hiddifyData.configs.length}`
    );

    // Hiddify should have fewer configs (incompatible removed)
    expect(hiddifyData.configs.length).toBeLessThan(allData.configs.length);
    // But still have a reasonable number
    expect(hiddifyData.configs.length).toBeGreaterThanOrEqual(30);
    // Should report client in JSON response
    expect(hiddifyData.client).toBe("hiddify");

    // Hiddify filter: keeps xhttp (sing-box 1.12+) and headerType=http (xray backend),
    // only removes kcp (Finalmask), Cloak plugin, and naive
    for (const c of hiddifyData.configs) {
      if (c.startsWith("vless://")) {
        expect(c).not.toContain("type=kcp");
      }
      // No Cloak plugin
      expect(c).not.toContain("plugin=ck-client");
      // No naive
      expect(c.startsWith("naive+")).toBe(false);
    }
  });
});
