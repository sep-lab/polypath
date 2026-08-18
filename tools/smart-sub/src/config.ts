// ── Configuration Builder ─────────────────────────────────────────
import {
  FINALMASK, SHADOWTLS_DEFAULTS, SALAMANDER_DEFAULTS,
} from "./constants";
import type { Env, AppConfig, Server, User } from "./types";

export function buildConfig(env: Env): AppConfig {
  const shadowtlsPassword = env.SHADOWTLS_PASSWORD;
  const salamanderPassword = env.SALAMANDER_PASSWORD;
  const ssUserKey = env.SS_USER_KEY;
  const finalmaskSeed = env.FINALMASK_SEED;
  const adminUuid = env.ADMIN_UUID;

  const edtunnel = {
    pages: (env.EDTUNNEL_PAGES || "").split(",").filter(Boolean),
    path: "/?ed=2048",
    port: 443,
  };

  const vercelRelays = (env.VERCEL_RELAY_HOSTS || "").split(",").filter(Boolean);
  const netlifyRelays = (env.NETLIFY_RELAY_HOSTS || "").split(",").filter(Boolean);

  const servers: Server[] = [
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
        user_key: ssUserKey,
      },
      finalmask: {
        xdns_port: FINALMASK.xdns_port,
        xicmp_port: FINALMASK.xicmp_port,
        wechat_port: FINALMASK.wechat_port,
        dtls_port: FINALMASK.dtls_port,
        srtp_port: FINALMASK.srtp_port,
        seed: finalmaskSeed,
      },
      grpc_cdn: null, // gRPC requires HTTP/2 end-to-end — incompatible with HAProxy TCP mode
      shadowtls: {
        port: SHADOWTLS_DEFAULTS.port,
        password: shadowtlsPassword,
        handshake_server: SHADOWTLS_DEFAULTS.handshake_server,
      },
      hy2_hop: {
        port_range: `${SALAMANDER_DEFAULTS.hop_min}-${SALAMANDER_DEFAULTS.hop_max}`,
        salamander_password: salamanderPassword,
      },
      naive: {
        host: "web.example.com",
        port: 2087,
        user: "vpnuser",
        pass: env.HEL_NAIVE_PASS,
      },
      cloak: null,
      amneziawg: null,
      relay: null,
      mtproto: {
        port: 3443,
        secret: env.HEL_MTPROTO_SECRET,
      },
      geo_restrict: null,
      geo_exclude: null,
      geo_cdn_only: null,
      enabled: true,
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
        user_key: ssUserKey,
      },
      finalmask: {
        xdns_port: FINALMASK.xdns_port,
        xicmp_port: FINALMASK.xicmp_port,
        wechat_port: FINALMASK.wechat_port,
        dtls_port: FINALMASK.dtls_port,
        srtp_port: FINALMASK.srtp_port,
        seed: finalmaskSeed,
      },
      grpc_cdn: null, // gRPC requires HTTP/2 end-to-end — incompatible with HAProxy TCP mode
      shadowtls: {
        port: SHADOWTLS_DEFAULTS.port,
        password: shadowtlsPassword,
        handshake_server: SHADOWTLS_DEFAULTS.handshake_server,
      },
      hy2_hop: {
        port_range: `${SALAMANDER_DEFAULTS.hop_min}-${SALAMANDER_DEFAULTS.hop_max}`,
        salamander_password: salamanderPassword,
      },
      naive: {
        host: "web2.example.com",
        port: 2087,
        user: "vpnuser",
        pass: env.ORC_NAIVE_PASS,
      },
      cloak: null,
      amneziawg: null,
      relay: null,
      mtproto: {
        port: 3443,
        secret: env.ORC_MTPROTO_SECRET,
      },
      geo_restrict: null,
      geo_exclude: null,
      geo_cdn_only: ["IR"], // Madrid direct IP blocked from Iran, but CDN-fronted configs work via CF
      enabled: true,
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
        user_key: ssUserKey,
      },
      finalmask: {
        xdns_port: FINALMASK.xdns_port,
        xicmp_port: FINALMASK.xicmp_port,
        wechat_port: FINALMASK.wechat_port,
        dtls_port: FINALMASK.dtls_port,
        srtp_port: FINALMASK.srtp_port,
        seed: finalmaskSeed,
      },
      grpc_cdn: null, // gRPC requires HTTP/2 end-to-end — incompatible with HAProxy TCP mode
      shadowtls: {
        port: SHADOWTLS_DEFAULTS.port,
        password: shadowtlsPassword,
        handshake_server: SHADOWTLS_DEFAULTS.handshake_server,
      },
      hy2_hop: {
        port_range: `${SALAMANDER_DEFAULTS.hop_min}-${SALAMANDER_DEFAULTS.hop_max}`,
        salamander_password: salamanderPassword,
      },
      naive: null,
      cloak: null,
      amneziawg: null,
      relay: null,
      mtproto: {
        port: 3443,
        secret: env.GCP_MTPROTO_SECRET,
      },
      geo_restrict: null,
      geo_exclude: null,
      geo_cdn_only: null,
      enabled: true,
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
        user_key: ssUserKey,
      },
      finalmask: {
        xdns_port: FINALMASK.xdns_port,
        xicmp_port: FINALMASK.xicmp_port,
        wechat_port: FINALMASK.wechat_port,
        dtls_port: FINALMASK.dtls_port,
        srtp_port: FINALMASK.srtp_port,
        seed: finalmaskSeed,
      },
      grpc_cdn: null, // gRPC requires HTTP/2 end-to-end — incompatible with HAProxy TCP mode
      shadowtls: {
        port: SHADOWTLS_DEFAULTS.port,
        password: shadowtlsPassword,
        handshake_server: SHADOWTLS_DEFAULTS.handshake_server,
      },
      hy2_hop: {
        port_range: `${SALAMANDER_DEFAULTS.hop_min}-${SALAMANDER_DEFAULTS.hop_max}`,
        salamander_password: salamanderPassword,
      },
      naive: {
        host: "web4.example.com",
        port: 2087,
        user: "vpnuser",
        pass: env.SCW_NAIVE_PASS,
      },
      cloak: {
        port: 2053,
        uid: env.SCW_CLOAK_UID,
        public_key: env.SCW_CLOAK_PUBKEY,
        server_name: "www.google.com",
        encryption: "plain",
        browser_sig: "chrome",
      },
      amneziawg: null,
      relay: null,
      mtproto: {
        port: 3443,
        secret: env.SCW_MTPROTO_SECRET,
      },
      geo_restrict: null,
      geo_exclude: null,
      geo_cdn_only: null,
      enabled: true,
    },
  ];

  for (const server of servers) {
    if (server.enabled && !server.ip) {
      throw new Error(
        `Server "${server.tag}" is enabled but has no IP configured. ` +
        `Set the corresponding env var (e.g. HEL_IP, ORC_IP).`
      );
    }
  }

  const envUsers: Record<string, User> = {
    [adminUuid]: { name: "admin", tier: "premium", enabled: true, source: "env" },
  };
  if (env.FAMILY_UUID) {
    envUsers[env.FAMILY_UUID] = { name: "family", tier: "premium", enabled: true, source: "env" };
  }
  if (env.TEST_UUID) {
    envUsers[env.TEST_UUID] = {
      name: "test", tier: "premium", enabled: true, source: "env",
      expires: env.TEST_UUID_EXPIRES || "2026-04-07",
    };
  }

  const freeServerLimit = parseInt(env.FREE_SERVER_LIMIT || "2", 10);

  return { servers, envUsers, adminUuid, freeServerLimit, edtunnel, vercelRelays, netlifyRelays };
}
