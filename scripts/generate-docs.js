#!/usr/bin/env node
// Generate docs: reads config/*.yaml and updates markdown tables
// between <!-- BEGIN GENERATED --> / <!-- END GENERATED --> markers
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const servers = yaml.load(readFileSync(resolve(root, "config/servers.yaml"), "utf8"));
const cdn = yaml.load(readFileSync(resolve(root, "config/cdn.yaml"), "utf8"));
const protocols = yaml.load(readFileSync(resolve(root, "config/protocols.yaml"), "utf8"));

// ── Server inventory table for multi-server.md ──
function buildServerTable() {
  const rows = servers.servers.map((s) => {
    const protos = [];
    if (s.reality) protos.push("VLESS Reality");
    if (s.hy2_port) protos.push("Hysteria2");
    if (s.cdn_ws) protos.push("CDN-WS");
    if (s.xhttp_cdn) protos.push("XHTTP-CDN");
    if (s.grpc_cdn) protos.push("gRPC-CDN");
    if (s.http_obfs) protos.push("XrayHTTP");
    if (s.ss2022) protos.push("SS2022");
    if (s.has_dns_tunnel) protos.push("DNS Tunnel");
    if (s.naive) protos.push("NaiveProxy");
    if (s.cloak) protos.push("Cloak+SS2022");
    if (s.mtproto) protos.push("MTProto");
    return `| ${s.tag} | ${s.location} | ${s.provider} | \`<${s.ip_env}>\` | ${protos.join(", ")} | ${s.enabled ? "Yes" : "No"} |`;
  });

  return [
    "| Tag | Location | Provider | IP | Key Protocols | Enabled |",
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

// ── Quick stats for README.md ──
function buildReadmeStats() {
  const serverCount = servers.servers.filter((s) => s.enabled).length;
  const protocolList = [
    "VLESS Reality", "Hysteria2", "XHTTP-CDN", "CDN-WS", "gRPC-CDN",
    "XrayHTTP", "SS2022", "Finalmask (mKCP)", "ShadowTLS v3",
    "NaiveProxy", "Cloak+SS2022", "DNS Tunnel", "Hy2 Salamander",
    "EDtunnel", "MTProto", "AmneziaWG",
  ];
  return [
    `- **${serverCount} servers** across ${serverCount} locations`,
    `- **${protocolList.length}+ protocol types**: ${protocolList.join(", ")}`,
    `- **${cdn.cf_clean_ips.length} Cloudflare clean IPs** optimized for Iranian ISPs`,
  ].join("\n");
}

// ── Replace content between markers ──
function replaceMarkers(filePath, content) {
  const fullPath = resolve(root, filePath);
  let text;
  try {
    text = readFileSync(fullPath, "utf8");
  } catch {
    console.log(`  ⚠ ${filePath} not found, skipping`);
    return;
  }
  const marker = /<!-- BEGIN GENERATED -->\n[\s\S]*?\n<!-- END GENERATED -->/;
  if (!marker.test(text)) {
    console.log(`  ⚠ ${filePath} has no generation markers, skipping`);
    return;
  }
  const updated = text.replace(
    marker,
    `<!-- BEGIN GENERATED -->\n${content}\n<!-- END GENERATED -->`
  );
  if (updated !== text) {
    writeFileSync(fullPath, updated);
    console.log(`  ✓ ${filePath} updated`);
  } else {
    console.log(`  · ${filePath} already up to date`);
  }
}

console.log("Generating docs from config...");
replaceMarkers("multi-server.md", buildServerTable());
replaceMarkers("README.md", buildReadmeStats());
console.log("✓ Done");
