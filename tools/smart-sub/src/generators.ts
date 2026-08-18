// ── URI Generators ────────────────────────────────────────────────
import {
  CF_CLEAN_IPS, ALT_REALITY_SNIS, WHITELISTED_HOSTS, FRAGMENT, MUX,
  ISP_HOST_PRIORITY,
} from "./constants";
import type { Server, GeneratorOpts, EdtunnelConfig } from "./types";

// ── Direct Protocols ──

export function generateRealityURI(server: Server, uuid: string): string {
  const params = new URLSearchParams({
    encryption: "none",
    flow: "xtls-rprx-vision",
    security: "reality",
    sni: server.sni,
    fp: "chrome",
    pbk: server.reality_pubkey,
    sid: server.reality_short_id,
    type: "tcp",
  });
  return `vless://${uuid}@${server.ip}:${server.reality_port}?${params}#Reality-${server.location}`;
}

export function generateHy2URI(server: Server, uuid: string): string {
  const params = new URLSearchParams({
    insecure: "1",
    sni: server.sni,
  });
  return `hy2://${uuid}@${server.ip}:${server.hy2_port}?${params}#Hysteria2-${server.location}`;
}

export function generateIPv6RealityURI(server: Server, uuid: string): string | null {
  if (!server.ipv6) return null;
  const params = new URLSearchParams({
    encryption: "none",
    flow: "xtls-rprx-vision",
    security: "reality",
    sni: server.sni,
    fp: "chrome",
    pbk: server.reality_pubkey,
    sid: server.reality_short_id,
    type: "tcp",
  });
  return `vless://${uuid}@[${server.ipv6}]:${server.reality_port}?${params}#Reality-IPv6-${server.location}`;
}

export function generateIPv6Hy2URI(server: Server, uuid: string): string | null {
  if (!server.ipv6) return null;
  const params = new URLSearchParams({
    insecure: "1",
    sni: server.sni,
  });
  return `hy2://${uuid}@[${server.ipv6}]:${server.hy2_port}?${params}#Hy2-IPv6-${server.location}`;
}

export function generateAmneziaWGURI(server: Server, _uuid: string): string | null {
  if (!server.amneziawg) return null;
  const awg = server.amneziawg as Record<string, unknown>;
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
    `PersistentKeepalive = 25`,
  ].join("\n");
  const encoded = btoa(config);
  return `awg://${encoded}#AWG-${server.location}`;
}

// ── CDN-Fronted ──

export function generateCdnWsURI(server: Server, uuid: string, opts: GeneratorOpts = {}): string | null {
  if (!server.cdn_ws) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "tls",
    sni: server.cdn_ws.host,
    host: server.cdn_ws.host,
    path: server.cdn_ws.path,
    type: "ws",
    fp: "chrome",
    alpn: "h2,http/1.1",
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

export function generateXhttpCdnURI(server: Server, uuid: string, opts: GeneratorOpts = {}): string | null {
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
    alpn: "h2,http/1.1",
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

export function generateGrpcCdnURI(server: Server, uuid: string, opts: GeneratorOpts = {}): string | null {
  if (!server.grpc_cdn) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "tls",
    sni: server.grpc_cdn.host,
    type: "grpc",
    serviceName: server.grpc_cdn.serviceName,
    mode: "gun",
    fp: "chrome",
    alpn: "h2",
  });
  const frag = opts.fragmentSettings || (opts.fragment ? FRAGMENT : null);
  if (frag) {
    params.set("fragment", `${frag.packets},${frag.length},${frag.interval}`);
  }
  const addr = opts.address || server.grpc_cdn.host;
  const suffix = opts.nameSuffix || "";
  return `vless://${uuid}@${addr}:${server.grpc_cdn.port}?${params}#gRPC-CDN${suffix}-${server.location}`;
}

// ── TCP Obfuscation ──

export function generateHttpObfsURI(server: Server, uuid: string): string | null {
  if (!server.http_obfs) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "tcp",
    headerType: "http",
    host: server.http_obfs.host,
    path: server.http_obfs.path,
  });
  return `vless://${uuid}@${server.ip}:${server.http_obfs.port}?${params}#XrayHTTP-${server.location}`;
}

export function generateHttpObfsMultiHostURIs(server: Server, uuid: string, isp?: string): string[] {
  if (!server.http_obfs) return [];

  // Use ISP-prioritized hosts when available, fall back to general list
  const ispHosts = isp && ISP_HOST_PRIORITY[isp];
  const hostList = ispHosts || WHITELISTED_HOSTS;

  return hostList
    .filter(h => h !== server.http_obfs.host)
    .map(host => {
      const params = new URLSearchParams({
        encryption: "none",
        security: "none",
        type: "tcp",
        headerType: "http",
        host: host,
        path: server.http_obfs.path,
      });
      // Extract a readable tag from CDN subdomain (e.g. "cdn-live.telewebion.com" → "telew")
      const parts = host.split(".");
      const domainPart = parts.length >= 2 ? parts.at(-2)! : parts[0];
      const tag = domainPart.slice(0, 5);
      return `vless://${uuid}@${server.ip}:${server.http_obfs.port}?${params}#XrayHTTP-${tag}-${server.location}`;
    });
}

export function generateSs2022URI(server: Server, _uuid: string): string | null {
  if (!server.ss2022) return null;
  const password = `${server.ss2022.server_key}:${server.ss2022.user_key}`;
  const userInfo = `${server.ss2022.method}:${password}`;
  const encoded = btoa(userInfo);
  return `ss://${encoded}@${server.ip}:${server.ss2022.port}#SS2022-${server.location}`;
}

export function generateNaiveURI(server: Server, _uuid: string): string | null {
  if (!server.naive) return null;
  return `naive+https://${server.naive.user}:${server.naive.pass}@${server.naive.host}:${server.naive.port}#Naive-${server.location}`;
}

// ── Clean CF IP Variants ──

export function generateXhttpCdnCleanIPURIs(server: Server, uuid: string, opts: GeneratorOpts = {}, cleanIps?: string[]): string[] {
  if (!server.xhttp_cdn) return [];
  const ips = cleanIps || CF_CLEAN_IPS;
  return ips.map((ip, i) =>
    generateXhttpCdnURI(server, uuid, {
      address: ip,
      nameSuffix: `-CF${i + 1}`,
      fragment: opts.fragment || false,
      fragmentSettings: opts.fragmentSettings || null,
      mux: opts.mux || false,
    })
  ).filter((u): u is string => u !== null);
}

export function generateCdnWsCleanIPURIs(server: Server, uuid: string, opts: GeneratorOpts = {}, cleanIps?: string[]): string[] {
  if (!server.cdn_ws) return [];
  const ips = cleanIps || CF_CLEAN_IPS;
  return ips.map((ip, i) =>
    generateCdnWsURI(server, uuid, {
      address: ip,
      nameSuffix: `-CF${i + 1}`,
      fragment: opts.fragment || false,
      fragmentSettings: opts.fragmentSettings || null,
      mux: opts.mux || false,
    })
  ).filter((u): u is string => u !== null);
}

export function generateGrpcCdnCleanIPURIs(server: Server, uuid: string, opts: GeneratorOpts = {}, cleanIps?: string[]): string[] {
  if (!server.grpc_cdn) return [];
  const ips = (cleanIps || CF_CLEAN_IPS).slice(0, 3);
  return ips.map((ip, i) =>
    generateGrpcCdnURI(server, uuid, {
      address: ip,
      nameSuffix: `-CF${i + 1}`,
      fragment: opts.fragment || false,
      fragmentSettings: opts.fragmentSettings || null,
    })
  ).filter((u): u is string => u !== null);
}

// ── EDtunnel ──

export function generateEdtunnelURIs(uuid: string, edtunnel: EdtunnelConfig): string[] {
  return edtunnel.pages.map((host, i) => {
    const params = new URLSearchParams({
      encryption: "none",
      security: "tls",
      sni: host,
      host: host,
      path: edtunnel.path,
      type: "ws",
      fp: "chrome",
    });
    return `vless://${uuid}@${host}:${edtunnel.port}?${params}#EDtunnel-${i + 1}`;
  });
}

export function generateEdtunnelCleanIPURIs(uuid: string, edtunnel: EdtunnelConfig): string[] {
  const uris: string[] = [];
  for (const host of edtunnel.pages) {
    for (let i = 0; i < CF_CLEAN_IPS.length; i++) {
      const params = new URLSearchParams({
        encryption: "none",
        security: "tls",
        sni: host,
        host: host,
        path: edtunnel.path,
        type: "ws",
        fp: "chrome",
      });
      uris.push(`vless://${uuid}@${CF_CLEAN_IPS[i]}:${edtunnel.port}?${params}#EDtunnel-CF${i + 1}`);
    }
    break;
  }
  return uris;
}

// ── Finalmask / mKCP ──

export function generateFinalmaskXdnsURI(server: Server, uuid: string): string | null {
  if (!server.finalmask || !server.finalmask.xdns_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "dns",
    seed: server.finalmask.seed,
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.xdns_port}?${params}#Finalmask-XDNS-${server.location}`;
}

export function generateFinalmaskXicmpURI(server: Server, uuid: string): string | null {
  if (!server.finalmask || !server.finalmask.xicmp_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "utp",
    seed: server.finalmask.seed,
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.xicmp_port}?${params}#Finalmask-XICMP-${server.location}`;
}

export function generateFinalmaskWechatURI(server: Server, uuid: string): string | null {
  if (!server.finalmask || !server.finalmask.wechat_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "wechat-video",
    seed: server.finalmask.seed,
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.wechat_port}?${params}#Finalmask-WeChat-${server.location}`;
}

export function generateFinalmaskDtlsURI(server: Server, uuid: string): string | null {
  if (!server.finalmask || !server.finalmask.dtls_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "dtls",
    seed: server.finalmask.seed,
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.dtls_port}?${params}#Finalmask-DTLS-${server.location}`;
}

export function generateFinalmaskSrtpURI(server: Server, uuid: string): string | null {
  if (!server.finalmask || !server.finalmask.srtp_port) return null;
  const params = new URLSearchParams({
    encryption: "none",
    security: "none",
    type: "kcp",
    headerType: "srtp",
    seed: server.finalmask.seed,
  });
  return `vless://${uuid}@${server.ip}:${server.finalmask.srtp_port}?${params}#Finalmask-SRTP-${server.location}`;
}

// ── Advanced Stealth ──

export function generateHy2HopURI(server: Server, uuid: string): string | null {
  if (!server.hy2_hop) return null;
  const params = new URLSearchParams({
    insecure: "1",
    sni: server.sni,
    obfs: "salamander",
    "obfs-password": server.hy2_hop.salamander_password,
  });
  return `hy2://${uuid}@${server.ip}:${server.hy2_hop.port_range}?${params}#Hy2-Hop-${server.location}`;
}

export function generateShadowTLSURI(server: Server, _uuid: string): string | null {
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
      utls: { enabled: true, fingerprint: "chrome" },
    },
    detour: `shadowtls-ss-${server.tag}`,
  };
  const innerConfig = {
    type: "shadowsocks",
    tag: `shadowtls-ss-${server.tag}`,
    method: server.ss2022.method,
    password: innerPassword,
    multiplex: { enabled: true, padding: true },
  };
  const shareData = btoa(JSON.stringify([config, innerConfig]));
  return `sing-box://import-outbound?data=${shareData}#ShadowTLS-${server.location}`;
}

export function generateAnyTlsURI(server: Server, _uuid: string): string | null {
  if (!server.anytls) return null;
  const anytls = server.anytls as Record<string, unknown>;
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
      utls: { enabled: true, fingerprint: "chrome" },
    },
  };
  const shareData = btoa(JSON.stringify([config]));
  return `sing-box://import-outbound?data=${shareData}#AnyTLS-${server.location}`;
}

export function generateCloakSs2022URI(server: Server, _uuid: string): string | null {
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
    `ProxyMethod=shadowsocks`,
  ].join(";");
  const pluginParam = encodeURIComponent(`ck-client;${pluginOpts}`);
  return `ss://${encoded}@${server.ip}:${server.cloak.port}/?plugin=${pluginParam}#Cloak-${server.location}`;
}

// ── Relay ──

export function generateRelayServerConfigs(server: Server, uuid: string): string[] {
  const configs: string[] = [];
  const anyTls = generateAnyTlsURI(server, uuid);
  if (anyTls) configs.push(anyTls);
  const stls = generateShadowTLSURI(server, uuid);
  if (stls) configs.push(stls);
  return configs;
}

export function generateRelayRealityURI(server: Server, uuid: string): string | null {
  if (!server.relay) return null;
  const relay = server.relay as Record<string, unknown>;
  const params = new URLSearchParams({
    encryption: "none",
    flow: "xtls-rprx-vision",
    security: "reality",
    sni: server.sni,
    fp: "chrome",
    pbk: server.reality_pubkey,
    sid: server.reality_short_id,
    type: "tcp",
  });
  return `vless://${uuid}@${relay["ip"]}:${server.reality_port}?${params}#Relay-Reality-${server.location}`;
}

export function generateRelayHy2URI(server: Server, uuid: string): string | null {
  if (!server.relay) return null;
  const relay = server.relay as Record<string, unknown>;
  const params = new URLSearchParams({
    insecure: "1",
    sni: server.sni,
  });
  return `hy2://${uuid}@${relay["ip"]}:${server.hy2_port}?${params}#Relay-Hy2-${server.location}`;
}

export function generateRelaySs2022URI(server: Server, _uuid: string): string | null {
  if (!server.relay || !server.ss2022) return null;
  const relay = server.relay as Record<string, unknown>;
  const password = `${server.ss2022.server_key}:${server.ss2022.user_key}`;
  const userInfo = `${server.ss2022.method}:${password}`;
  const encoded = btoa(userInfo);
  return `ss://${encoded}@${relay["ip"]}:${server.ss2022.port}#Relay-SS2022-${server.location}`;
}

// ── MTProto ──

export function generateMTProtoLink(server: Server): string | null {
  if (!server.mtproto) return null;
  const { port, secret } = server.mtproto;
  return `https://t.me/proxy?server=${server.ip}&port=${port}&secret=${secret}`;
}

// ── Alt Reality SNI ──

export function generateRealityAltSNIURIs(server: Server, uuid: string): string[] {
  if (!server.reality_pubkey) return [];
  const uris: string[] = [];
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
      type: "tcp",
    });
    uris.push(`vless://${uuid}@${server.ip}:${server.reality_port}?${params}#Reality-${sni.split(".")[0]}-${server.location}`);
  }
  return uris;
}

// ── Edge Relay CDN ──

export function generateRelayXhttpURIs(
  server: Server,
  uuid: string,
  relayHosts: string[],
  provider: string,
  opts: GeneratorOpts = {}
): string[] {
  if (!server.xhttp_cdn || !relayHosts.length) return [];
  const uris: string[] = [];
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
      alpn: "h2,http/1.1",
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

export function generateRelayCdnWsURIs(
  server: Server,
  uuid: string,
  relayHosts: string[],
  provider: string,
  opts: GeneratorOpts = {}
): string[] {
  if (!server.cdn_ws || !relayHosts.length) return [];
  if (provider === "Netlify") return [];
  const uris: string[] = [];
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
      alpn: "h2,http/1.1",
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
