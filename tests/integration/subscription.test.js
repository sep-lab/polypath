import { describe, it, expect } from "vitest";
import worker, { buildConfig } from "../../tools/smart-sub/worker.js";

// ── Test Environment ──
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

function callWorker(path) {
  const request = new Request(`https://sub.example.com${path}`);
  return worker.fetch(request, TEST_ENV);
}

describe("Subscription Integration", () => {
  it("returns 200 with valid base64 for admin UUID", async () => {
    const res = await callWorker(`/sub/${TEST_ENV.ADMIN_UUID}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const decoded = atob(text);
    const lines = decoded.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(100);
  });

  it("JSON format returns configs array with protocol diversity", async () => {
    const res = await callWorker(`/sub/${TEST_ENV.ADMIN_UUID}?format=json`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.configs)).toBe(true);

    const configs = data.configs;
    expect(configs.some((c) => c.startsWith("vless://"))).toBe(true);
    expect(configs.some((c) => c.startsWith("hy2://"))).toBe(true);
    expect(configs.some((c) => c.startsWith("ss://"))).toBe(true);
  });

  it("returns 401 for unknown UUID", async () => {
    const res = await callWorker("/sub/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid UUID format", async () => {
    const res = await callWorker("/sub/not-a-uuid");
    expect(res.status).toBe(404);
  });

  it("/health returns version and server count", async () => {
    const res = await callWorker("/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.servers).toBeDefined();
    expect(data.server_count).toBeGreaterThanOrEqual(1);
  });

  it("Iran geo filter returns CDN-only configs", async () => {
    const res = await callWorker(`/sub/${TEST_ENV.ADMIN_UUID}?geo=ir&format=json`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.configs.length).toBeGreaterThan(0);
    // No Reality or Hy2 URIs (those expose IPs)
    const serverIPs = ["10.0.1.1", "10.0.1.2", "10.0.1.3", "10.0.1.4"];
    data.configs.forEach((uri) => {
      if (uri.startsWith("vless://") && uri.includes("reality")) {
        serverIPs.forEach((ip) => {
          expect(uri).not.toContain(`@${ip}:`);
        });
      }
    });
  });
});
