// ── Core Types for VPN Smart-Sub Worker ──────────────────────────

// ── Cloudflare Worker Environment ──
export interface Env {
  // Server IPs
  HEL_IP: string;
  HEL_IPV6?: string;
  ORC_IP: string;
  ORC_IPV6?: string;
  GCP_IP: string;
  GCP_IPV6?: string;
  SCW_IP: string;
  SCW_IPV6?: string;

  // Protocol secrets
  SHADOWTLS_PASSWORD: string;
  SALAMANDER_PASSWORD: string;
  SS_USER_KEY: string;
  FINALMASK_SEED: string;

  // Per-server Reality identity.
  // reality_short_id is a server-side allowlist credential, NOT public data —
  // it must never be committed. reality_pubkey is client-shareable but is kept
  // here too so the repo carries no durable fingerprint of live infrastructure.
  HEL_REALITY_PUBKEY: string;
  HEL_REALITY_SHORT_ID: string;
  ORC_REALITY_PUBKEY: string;
  ORC_REALITY_SHORT_ID: string;
  GCP_REALITY_PUBKEY: string;
  GCP_REALITY_SHORT_ID: string;
  SCW_REALITY_PUBKEY: string;
  SCW_REALITY_SHORT_ID: string;

  // MTProto secrets. These are the complete auth material for the Telegram
  // proxy — there is no per-user component and no revocation path.
  HEL_MTPROTO_SECRET: string;
  ORC_MTPROTO_SECRET: string;
  GCP_MTPROTO_SECRET: string;
  SCW_MTPROTO_SECRET: string;

  // Per-server SS keys
  HEL_SS_KEY: string;
  ORC_SS_KEY: string;
  GCP_SS_KEY: string;
  SCW_SS_KEY: string;

  // NaiveProxy passwords (optional)
  HEL_NAIVE_PASS?: string;
  ORC_NAIVE_PASS?: string;
  SCW_NAIVE_PASS?: string;

  // Cloak (SCW only)
  SCW_CLOAK_UID?: string;
  SCW_CLOAK_PUBKEY?: string;

  // EDtunnel
  EDTUNNEL_PAGES?: string;

  // Relays
  VERCEL_RELAY_HOSTS?: string;
  NETLIFY_RELAY_HOSTS?: string;

  // Probe reporting token. Scoped to POST /probe/report ONLY.
  // This is what gets embedded in the probe script handed to volunteers,
  // so it must never be ADMIN_UUID — a volunteer on a hostile network must
  // not end up holding a credential that grants admin API access.
  PROBE_TOKEN?: string;

  // Admin API credential, separate from any subscription UUID.
  // If unset, ADMIN_UUID is used — which means the admin credential and a
  // user's subscription token are the same value and cannot be rotated apart.
  ADMIN_TOKEN?: string;

  // User UUIDs
  ADMIN_UUID: string;
  FAMILY_UUID?: string;
  TEST_UUID?: string;
  TEST_UUID_EXPIRES?: string;

  // Limits
  FREE_SERVER_LIMIT?: string;

  // KV Namespace (optional — gracefully absent on Vercel)
  HEALTH?: KVNamespace;

  // Telegram (optional)
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

// ── Server Configuration ──
export interface CdnWsConfig {
  host: string;
  path: string;
  port: number;
}

export interface HttpObfsConfig {
  port: number;
  host: string;
  path: string;
}

export interface XhttpCdnConfig {
  host: string;
  path: string;
  port: number;
}

export interface Ss2022Config {
  port: number;
  method: string;
  server_key: string;
  user_key: string;
}

export interface FinalmaskConfig {
  xdns_port: number;
  xicmp_port: number;
  wechat_port: number;
  dtls_port: number;
  srtp_port: number;
  seed: string;
}

export interface GrpcCdnConfig {
  host: string;
  serviceName: string;
  port: number;
}

export interface ShadowTlsConfig {
  port: number;
  password: string;
  handshake_server: string;
}

export interface Hy2HopConfig {
  port_range: string;
  salamander_password: string;
}

export interface NaiveConfig {
  host: string;
  port: number;
  user: string;
  pass: string | undefined;
}

export interface CloakConfig {
  port: number;
  uid: string | undefined;
  public_key: string | undefined;
  server_name: string;
  encryption: string;
  browser_sig: string;
}

export interface MtprotoConfig {
  port: number;
  secret: string;
}

export interface Server {
  tag: string;
  location: string;
  provider: string;
  ip: string;
  ipv6: string | null;
  reality_port: number;
  reality_port_alt?: number;
  hy2_port: number;
  reality_pubkey: string;
  reality_short_id: string;
  sni: string;
  has_dns_tunnel: boolean;
  cdn_ws: CdnWsConfig;
  http_obfs: HttpObfsConfig;
  xhttp_cdn: XhttpCdnConfig;
  ss2022: Ss2022Config;
  finalmask: FinalmaskConfig;
  grpc_cdn: GrpcCdnConfig | null;
  shadowtls: ShadowTlsConfig;
  hy2_hop: Hy2HopConfig;
  naive: NaiveConfig | null;
  cloak: CloakConfig | null;
  amneziawg: null;
  relay: null;
  mtproto: MtprotoConfig;
  geo_restrict: string | null;
  geo_exclude: string[] | null;
  geo_cdn_only: string[] | null; // countries where only CDN-fronted configs work (direct IP blocked)
  enabled: boolean;
  // optional fields referenced in index.ts
  anytls?: unknown;
  is_relay?: boolean;
}

// ── User System ──
export type UserTier = "premium" | "free" | "limited";
export type UserSource = "env" | "kv";

export interface User {
  name: string;
  tier: UserTier;
  enabled: boolean;
  source: UserSource;
  expires?: string | null;
  created_at?: string | null;
}

export interface ResolvedUser extends User {
  uuid: string;
}

// ── Config Output ──
export interface EdtunnelConfig {
  pages: string[];
  path: string;
  port: number;
}

export interface AppConfig {
  servers: Server[];
  envUsers: Record<string, User>;
  adminUuid: string;
  freeServerLimit: number;
  edtunnel: EdtunnelConfig;
  vercelRelays: string[];
  netlifyRelays: string[];
}

// ── URI Generator Options ──
export interface FragmentSettings {
  packets: string;
  length: string;
  interval: string;
}

export interface GeneratorOpts {
  address?: string;
  nameSuffix?: string;
  fragment?: boolean;
  fragmentSettings?: FragmentSettings | null;
  mux?: boolean;
}

// ── KV Data Structures ──
export interface KvUserData {
  name: string;
  tier: UserTier;
  enabled: boolean;
  expires?: string | null;
  created_at?: string | null;
}

export interface ServerOverrideData {
  ip?: string;
  ipv6?: string;
  enabled?: boolean;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ProbeResult {
  tag: string;
  protocol: string;
  status: "up" | "down";
  latency_ms: number;
}

export interface ProbeReport {
  up: number;
  down: number;
  isp?: string;
  country?: string;
  city?: string;
  results: ProbeResult[];
}

export interface StoredProbeReport extends ProbeReport {
  timestamp: string;
}

export interface HealthData {
  [tag: string]: {
    status: string;
    latency_ms: number | null;
    last_check: string | null;
  };
}

export interface SubHits {
  [uuid: string]: number;
}

// ── ISP Types ──
export type IspName = "mci" | "irancell" | "rightel" | "shatel" | "mokhaberat" | "other" | "mobinnet" | "unknown";
