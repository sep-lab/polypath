// ── sing-box Native JSON Config Generator ────────────────────────
// Converts URI-based configs to native sing-box outbound JSON format.
// Used when ?format=singbox is requested — Hiddify can import this directly.

interface SingBoxOutbound {
  type: string;
  tag: string;
  server?: string;
  server_port?: number;
  [key: string]: unknown;
}

interface SingBoxConfig {
  log: { level: string };
  dns: { servers: Array<{ tag: string; address: string; detour?: string }> };
  outbounds: SingBoxOutbound[];
  route: {
    rules: Array<{ protocol?: string; outbound: string }>;
    auto_detect_interface: boolean;
    final: string;
  };
}

/**
 * Parse a VLESS URI into a sing-box outbound config.
 */
function parseVlessURI(uri: string): SingBoxOutbound | null {
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

  const outbound: SingBoxOutbound = {
    type: "vless",
    tag,
    server: server.replace(/^\[|\]$/g, ""), // strip IPv6 brackets
    server_port: port,
    uuid,
    flow: params.get("flow") || undefined,
  };

  // TLS
  if (security === "tls") {
    outbound.tls = {
      enabled: true,
      server_name: params.get("sni") || params.get("host") || "",
      utls: { enabled: true, fingerprint: params.get("fp") || "chrome" },
      alpn: params.get("alpn")?.split(",") || undefined,
    };
  } else if (security === "reality") {
    outbound.tls = {
      enabled: true,
      server_name: params.get("sni") || "",
      utls: { enabled: true, fingerprint: params.get("fp") || "chrome" },
      reality: {
        enabled: true,
        public_key: params.get("pbk") || "",
        short_id: params.get("sid") || "",
      },
    };
  }

  // Transport
  if (transport === "ws") {
    outbound.transport = {
      type: "ws",
      path: params.get("path") || "/",
      headers: { Host: params.get("host") || params.get("sni") || "" },
    };
  } else if (transport === "xhttp") {
    outbound.transport = {
      type: "httpupgrade",
      path: params.get("path") || "/",
      host: params.get("host") || params.get("sni") || "",
    };
  } else if (transport === "grpc") {
    outbound.transport = {
      type: "grpc",
      service_name: params.get("serviceName") || "",
    };
  } else if (transport === "tcp" && params.get("headerType") === "http") {
    outbound.transport = {
      type: "http",
      host: [params.get("host") || ""],
      path: params.get("path") || "/",
    };
  }

  // Fragment (Hiddify extension)
  const fragment = params.get("fragment");
  if (fragment) {
    const [packets, length, interval] = fragment.split(",");
    outbound.tls_fragment = { enabled: true, packets, length, interval };
  }

  // MUX
  const mux = params.get("mux");
  if (mux) {
    outbound.multiplex = {
      enabled: true,
      protocol: mux,
      max_connections: parseInt(params.get("muxMaxConcurrency") || "8", 10),
      padding: params.get("muxPadding") === "true",
    };
  }

  // Clean up undefined values
  if (!outbound.flow) delete outbound.flow;
  return outbound;
}

/**
 * Parse a Hysteria2 URI into a sing-box outbound config.
 */
function parseHy2URI(uri: string): SingBoxOutbound | null {
  const hashIdx = uri.indexOf("#");
  const tag = hashIdx >= 0 ? decodeURIComponent(uri.substring(hashIdx + 1)) : "hysteria2";
  const mainPart = hashIdx >= 0 ? uri.substring(6, hashIdx) : uri.substring(6);
  const [userHost, query] = mainPart.split("?");
  if (!userHost) return null;

  const atIdx = userHost.indexOf("@");
  const password = atIdx >= 0 ? userHost.substring(0, atIdx) : "";
  const hostPort = atIdx >= 0 ? userHost.substring(atIdx + 1) : userHost;

  // Handle port ranges (e.g. 20000-50000)
  const colonIdx = hostPort.lastIndexOf(":");
  const server = hostPort.substring(0, colonIdx).replace(/^\[|\]$/g, "");
  const portStr = hostPort.substring(colonIdx + 1);

  const params = query ? new URLSearchParams(query) : new URLSearchParams();

  const outbound: SingBoxOutbound = {
    type: "hysteria2",
    tag,
    server,
    server_port: parseInt(portStr.split("-")[0], 10), // first port if range
    password,
    tls: {
      enabled: true,
      server_name: params.get("sni") || "",
      insecure: params.get("insecure") === "1",
    },
  };

  // Salamander obfuscation
  if (params.get("obfs") === "salamander") {
    outbound.obfs = {
      type: "salamander",
      password: params.get("obfs-password") || "",
    };
  }

  // Port hopping
  if (portStr.includes("-")) {
    outbound.server_port = parseInt(portStr.split("-")[0], 10);
    outbound.hop_ports = portStr;
  }

  return outbound;
}

/**
 * Parse an SS URI into a sing-box outbound config.
 */
function parseSsURI(uri: string): SingBoxOutbound | null {
  const hashIdx = uri.indexOf("#");
  const tag = hashIdx >= 0 ? decodeURIComponent(uri.substring(hashIdx + 1)) : "shadowsocks";
  const mainPart = hashIdx >= 0 ? uri.substring(5, hashIdx) : uri.substring(5);

  // ss://base64@host:port or ss://base64@host:port/?plugin=...
  const atIdx = mainPart.lastIndexOf("@");
  if (atIdx < 0) return null;

  const encoded = mainPart.substring(0, atIdx);
  const hostPortPlugin = mainPart.substring(atIdx + 1);

  let decoded: string;
  try { decoded = atob(encoded); } catch { return null; }

  const methodColonIdx = decoded.indexOf(":");
  if (methodColonIdx < 0) return null;
  const method = decoded.substring(0, methodColonIdx);
  const password = decoded.substring(methodColonIdx + 1);

  // Split host:port from plugin params
  const qIdx = hostPortPlugin.indexOf("?");
  const hostPort = qIdx >= 0 ? hostPortPlugin.substring(0, qIdx) : hostPortPlugin;
  const colonIdx = hostPort.lastIndexOf(":");
  const server = hostPort.substring(0, colonIdx).replace(/^\[|\]$/g, "");
  const port = parseInt(hostPort.substring(colonIdx + 1).replace(/\/$/, ""), 10);

  // Skip Cloak plugin configs — not natively supported in sing-box import
  if (qIdx >= 0 && hostPortPlugin.includes("ck-client")) return null;

  return {
    type: "shadowsocks",
    tag,
    server,
    server_port: port,
    method,
    password,
  };
}

/**
 * Parse a sing-box:// URI — these already contain native JSON, just extract outbounds.
 */
function parseSingBoxURI(uri: string): SingBoxOutbound[] {
  const hashIdx = uri.indexOf("#");
  const main = hashIdx >= 0 ? uri.substring(0, hashIdx) : uri;
  const match = main.match(/data=([A-Za-z0-9+/=]+)/);
  if (!match) return [];
  try {
    const json = atob(match[1]);
    return JSON.parse(json) as SingBoxOutbound[];
  } catch { return []; }
}

/**
 * Convert a list of URI-based configs into a full sing-box JSON config.
 */
export function buildSingBoxConfig(uris: string[]): SingBoxConfig {
  const outbounds: SingBoxOutbound[] = [];

  for (const uri of uris) {
    let parsed: SingBoxOutbound | SingBoxOutbound[] | null = null;

    if (uri.startsWith("vless://")) {
      parsed = parseVlessURI(uri);
    } else if (uri.startsWith("hy2://")) {
      parsed = parseHy2URI(uri);
    } else if (uri.startsWith("ss://")) {
      parsed = parseSsURI(uri);
    } else if (uri.startsWith("sing-box://")) {
      parsed = parseSingBoxURI(uri);
    } else if (uri.startsWith("naive+") || uri.startsWith("awg://")) {
      continue; // Not supported in sing-box import
    }

    if (parsed) {
      if (Array.isArray(parsed)) {
        outbounds.push(...parsed);
      } else {
        outbounds.push(parsed);
      }
    }
  }

  // Build auto-select and manual selectors from unique tags
  const proxyTags = outbounds.map(o => o.tag);

  return {
    log: { level: "warn" },
    dns: {
      servers: [
        { tag: "dns-remote", address: "https://1.1.1.1/dns-query", detour: "auto" },
        { tag: "dns-direct", address: "local" },
      ],
    },
    outbounds: [
      {
        type: "urltest",
        tag: "auto",
        outbounds: proxyTags,
        url: "https://www.gstatic.com/generate_204",
        interval: "5m",
        tolerance: 200,
      },
      {
        type: "selector",
        tag: "manual",
        outbounds: ["auto", ...proxyTags],
        default: "auto",
      },
      ...outbounds,
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
      { type: "dns", tag: "dns-out" },
    ],
    route: {
      rules: [
        { protocol: "dns", outbound: "dns-out" },
      ],
      auto_detect_interface: true,
      final: "manual",
    },
  };
}
