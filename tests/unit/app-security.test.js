// Regression tests for the application-security fixes.
// Each test corresponds to a specific defect; the comment says what breaks
// if the test is deleted.
import { describe, it, expect } from "vitest";
import {
  timingSafeEqual, isValidHostOrIp, escapeHtml, extractAdminCredential, isAdminRequest,
} from "../../tools/smart-sub/src/utils.ts";
import { SECURITY_HEADERS } from "../../tools/smart-sub/src/constants.ts";

describe("timingSafeEqual", () => {
  it("matches equal strings and rejects unequal ones", async () => {
    expect(await timingSafeEqual("abc", "abc")).toBe(true);
    expect(await timingSafeEqual("abc", "abd")).toBe(false);
  });

  it("rejects on length difference without leaking via early return", async () => {
    expect(await timingSafeEqual("short", "considerably-longer")).toBe(false);
    expect(await timingSafeEqual("", "x")).toBe(false);
    expect(await timingSafeEqual("", "")).toBe(true);
  });
});

describe("isValidHostOrIp — config-poisoning guard", () => {
  it("accepts real addresses and hostnames", () => {
    for (const ok of ["203.0.113.10", "2001:db8::1", "cdn.example.com", "a-b.example.co.uk"]) {
      expect(isValidHostOrIp(ok), ok).toBe(true);
    }
  });

  // Each of these, unvalidated, rewrites vless://<uuid>@<ip>:<port> to point
  // somewhere else — silently redirecting every subscriber.
  it("rejects values that break out of the URI position", () => {
    for (const bad of [
      "evil.com:443?x=#",
      "evil.com/path",
      "evil.com@attacker.com",
      "evil.com#frag",
      "evil com",
      "evil.com\nHost: x",
      "",
      "  ",
      123,
      null,
      undefined,
    ]) {
      expect(isValidHostOrIp(bad), String(bad)).toBe(false);
    }
  });
});

describe("escapeHtml — stored XSS guard", () => {
  it("neutralises the characters that close an attribute or tag", () => {
    expect(escapeHtml('"><script>alert(1)</script>'))
      .toBe("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });
});

describe("SECURITY_HEADERS", () => {
  it("includes a CSP, since the worker serves one HTML page", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBeDefined();
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("default-src 'none'");
  });

  it("keeps the existing hardening headers", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("no-referrer");
  });
});

describe("admin credential extraction", () => {
  const url = new URL("https://example.com/stats?key=from-query");

  it("prefers the Authorization header over the query string", () => {
    const req = new Request("https://example.com/stats", {
      headers: new Headers({ Authorization: "Bearer from-header" }),
    });
    expect(extractAdminCredential(req, url)).toBe("from-header");
  });

  it("still accepts ?key= for deployed probe scripts and workflows", () => {
    const req = new Request("https://example.com/stats");
    expect(extractAdminCredential(req, url)).toBe("from-query");
  });

  it("returns null when nothing is presented", () => {
    const req = new Request("https://example.com/stats");
    expect(extractAdminCredential(req, new URL("https://example.com/stats"))).toBeNull();
  });
});

describe("isAdminRequest", () => {
  const bare = new URL("https://example.com/admin/users");
  const withToken = (t) => new Request("https://example.com/admin/users", {
    headers: new Headers({ Authorization: `Bearer ${t}` }),
  });

  it("accepts ADMIN_TOKEN when configured", async () => {
    expect(await isAdminRequest(withToken("tok"), bare, "tok", "uuid")).toBe(true);
  });

  // ADMIN_TOKEN exists so the admin credential can be rotated independently of
  // a user's subscription UUID. When it is set, the UUID must NOT also work.
  it("does not accept ADMIN_UUID once ADMIN_TOKEN is set", async () => {
    expect(await isAdminRequest(withToken("uuid"), bare, "tok", "uuid")).toBe(false);
  });

  it("falls back to ADMIN_UUID when ADMIN_TOKEN is unset", async () => {
    expect(await isAdminRequest(withToken("uuid"), bare, undefined, "uuid")).toBe(true);
  });

  it("rejects a missing or wrong credential", async () => {
    expect(await isAdminRequest(new Request("https://example.com/admin/users"), bare, "tok", "uuid")).toBe(false);
    expect(await isAdminRequest(withToken("nope"), bare, "tok", "uuid")).toBe(false);
  });
});
