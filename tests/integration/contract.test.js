/**
 * Contract tests: validate worker responses match the OpenAPI 3.1 spec
 * in docs/openapi.yaml. Uses AJV to validate JSON responses against
 * the component schemas.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import worker from "../../tools/smart-sub/worker.js";

// ── Load OpenAPI spec ──
const specPath = resolve(import.meta.dirname, "../../docs/openapi.yaml");
const spec = yaml.load(readFileSync(specPath, "utf8"));

// ── AJV setup (OpenAPI 3.1 uses JSON Schema draft 2020-12) ──
let ajv;
beforeAll(() => {
  ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  // Register all component schemas so $ref works
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    ajv.addSchema(schema, `#/components/schemas/${name}`);
  }
});

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

function callWorker(path, opts = {}) {
  const request = new Request(`https://sub.example.com${path}`, opts);
  return worker.fetch(request, TEST_ENV);
}

function validateSchema(data, schemaRef) {
  const validate = ajv.getSchema(schemaRef);
  if (!validate) throw new Error(`Schema not found: ${schemaRef}`);
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors.map(
      (e) => `${e.instancePath} ${e.message}`
    );
    return { valid: false, errors };
  }
  return { valid: true, errors: [] };
}

function validateInline(data, schema) {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors.map(
      (e) => `${e.instancePath} ${e.message}`
    );
    return { valid: false, errors };
  }
  return { valid: true, errors: [] };
}

// ── Health endpoint contracts ──
describe("Contract: /health", () => {
  it("GET /health matches HealthResponse schema", async () => {
    const res = await callWorker("/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    const result = validateSchema(data, "#/components/schemas/HealthResponse");
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("GET /health has required fields: servers, server_count, checked_at", async () => {
    const res = await callWorker("/health");
    const data = await res.json();
    expect(data).toHaveProperty("servers");
    expect(data).toHaveProperty("server_count");
    expect(data).toHaveProperty("checked_at");
    expect(Array.isArray(data.servers)).toBe(true);
    expect(typeof data.server_count).toBe("number");
  });

  it("each server in /health has tag, location, protocols, health", async () => {
    const res = await callWorker("/health");
    const data = await res.json();
    for (const server of data.servers) {
      expect(server).toHaveProperty("tag");
      expect(server).toHaveProperty("location");
      expect(server).toHaveProperty("protocols");
      expect(server).toHaveProperty("health");
      expect(typeof server.tag).toBe("string");
      expect(Array.isArray(server.protocols)).toBe(true);
    }
  });

  it("admin /health includes ip, provider, enabled fields", async () => {
    const res = await callWorker(`/health?key=${TEST_ENV.ADMIN_UUID}`);
    const data = await res.json();
    const server = data.servers[0];
    expect(server).toHaveProperty("ip");
    expect(server).toHaveProperty("provider");
    expect(server).toHaveProperty("enabled");
  });
});

// ── Subscription endpoint contracts ──
describe("Contract: /sub/{uuid}", () => {
  it("GET /sub/{uuid}?format=json matches SubscriptionJsonResponse", async () => {
    const res = await callWorker(
      `/sub/${TEST_ENV.ADMIN_UUID}?format=json`
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    const result = validateSchema(
      data,
      "#/components/schemas/SubscriptionJsonResponse"
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("JSON response has configs array, user string, geo object", async () => {
    const res = await callWorker(
      `/sub/${TEST_ENV.ADMIN_UUID}?format=json`
    );
    const data = await res.json();
    expect(Array.isArray(data.configs)).toBe(true);
    expect(typeof data.user).toBe("string");
    expect(data.geo).toBeDefined();
    expect(typeof data.geo.country).toBe("string");
    expect(typeof data.geo.cdn_only).toBe("boolean");
  });

  it("base64 response is valid base64", async () => {
    const res = await callWorker(`/sub/${TEST_ENV.ADMIN_UUID}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    // Should decode without error
    const decoded = atob(text);
    expect(decoded.length).toBeGreaterThan(0);
  });

  it("401 for unknown UUID returns Unauthorized text", async () => {
    const res = await callWorker("/sub/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain("Unauthorized");
  });

  it("404 for malformed UUID", async () => {
    const res = await callWorker("/sub/not-a-uuid");
    expect(res.status).toBe(404);
  });
});

// ── MTProto endpoint contracts ──
describe("Contract: /mtproto/{uuid}", () => {
  it("GET /mtproto/{uuid} returns 200 HTML", async () => {
    const res = await callWorker(`/mtproto/${TEST_ENV.ADMIN_UUID}`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type");
    expect(ct).toContain("text/html");
  });

  it("401 for unknown UUID", async () => {
    const res = await callWorker(
      "/mtproto/00000000-0000-0000-0000-000000000000"
    );
    expect(res.status).toBe(401);
  });
});

// ── Diagnostic endpoint contracts ──
describe("Contract: /diagnostic", () => {
  it("GET /diagnostic returns 200 text", async () => {
    const res = await callWorker("/diagnostic");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });
});

// ── Root path contracts ──
describe("Contract: /", () => {
  it("GET / returns 404", async () => {
    const res = await callWorker("/");
    expect(res.status).toBe(404);
  });
});

// ── Stats endpoint contract (admin) ──
describe("Contract: /stats", () => {
  it("GET /stats without key returns 401", async () => {
    const res = await callWorker("/stats");
    expect(res.status).toBe(401);
    const data = await res.json();
    const result = validateSchema(data, "#/components/schemas/ErrorResponse");
    expect(result.errors).toEqual([]);
  });

  it("GET /stats with admin key returns valid stats", async () => {
    const res = await callWorker(`/stats?key=${TEST_ENV.ADMIN_UUID}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.servers)).toBe(true);
    expect(Array.isArray(data.users)).toBe(true);
    expect(typeof data.worker_version).toBe("string");
    expect(typeof data.total_servers).toBe("number");
    expect(typeof data.total_users).toBe("number");
  });

  it("stats servers have tag, location, enabled, health object", async () => {
    const res = await callWorker(`/stats?key=${TEST_ENV.ADMIN_UUID}`);
    const data = await res.json();
    for (const server of data.servers) {
      expect(server).toHaveProperty("tag");
      expect(server).toHaveProperty("location");
      expect(server).toHaveProperty("enabled");
      expect(server).toHaveProperty("health");
      expect(typeof server.health).toBe("object");
    }
  });
});

// ── Admin users endpoint contracts ──
describe("Contract: /admin/users", () => {
  it("GET /admin/users without auth returns 401", async () => {
    const res = await callWorker("/admin/users");
    expect(res.status).toBe(401);
  });

  it("GET /admin/users with admin auth returns user list", async () => {
    const res = await callWorker("/admin/users", {
      headers: { Authorization: `Bearer ${TEST_ENV.ADMIN_UUID}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("users");
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.users)).toBe(true);
    expect(typeof data.total).toBe("number");

    // Each user should have core fields
    for (const user of data.users) {
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("tier");
      expect(user).toHaveProperty("enabled");
    }
  });
});

// ── Admin servers endpoint contracts ──
describe("Contract: /admin/servers", () => {
  it("GET /admin/servers without auth returns 401", async () => {
    const res = await callWorker("/admin/servers");
    expect(res.status).toBe(401);
  });

  it("GET /admin/servers with auth returns server list", async () => {
    const res = await callWorker("/admin/servers", {
      headers: { Authorization: `Bearer ${TEST_ENV.ADMIN_UUID}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("servers");
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.servers)).toBe(true);

    for (const server of data.servers) {
      expect(server).toHaveProperty("tag");
      expect(server).toHaveProperty("ip");
      expect(server).toHaveProperty("enabled");
    }
  });
});
