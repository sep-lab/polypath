#!/usr/bin/env python3
"""
Protocol-level connectivity test for VPN servers.

Tests actual VPN protocol handshakes (not just TCP/port probes) to match
what Hiddify/sing-box clients experience. Requires sing-box installed.

Usage:
  python3 tests/connectivity.test.py              # Test all protocols
  python3 tests/connectivity.test.py --reality     # Reality only
  python3 tests/connectivity.test.py --hy2         # Hysteria2 only
  python3 tests/connectivity.test.py --json        # JSON output

Prerequisites:
  brew install sing-box   # macOS
"""

import subprocess
import json
import time
import os
import sys
import urllib.request
import shutil

PROXY_PORT = 19876  # avoid common ports

# Server definitions (must match config.ts)
# NOTE: sni must equal the server's sing-box reality.server_name
SERVERS = [
    {
        "tag": "HEL", "name": "Finland", "ip": os.environ.get("HEL_IP", ""),
        "reality_port": 443, "hy2_port": 8443,
        "pubkey": "dGVzdGhlbHJlYWxpdHlwdWJrZXkwMDAwMDAwMDAwMA",
        "short_id": "aa00000000000001", "sni": "www.google.com",
    },
    {
        "tag": "ORC", "name": "Madrid", "ip": os.environ.get("ORC_IP", ""),
        "reality_port": 443, "hy2_port": 8443,
        "pubkey": "dGVzdG9yY3JlYWxpdHlwdWJrZXkwMDAwMDAwMDAwMA",
        "short_id": "aa00000000000002", "sni": "www.google.com",
    },
    {
        "tag": "GCP", "name": "Dammam", "ip": os.environ.get("GCP_IP", ""),
        "reality_port": 443, "hy2_port": 8443,
        "pubkey": "dGVzdGdjcHJlYWxpdHlwdWJrZXkwMDAwMDAwMDAwMA",
        "short_id": "aa00000000000009", "sni": "www.google.com",
    },
    {
        "tag": "SCW", "name": "London", "ip": os.environ.get("SCW_IP", ""),
        "reality_port": 443, "hy2_port": 8443,
        "pubkey": "dGVzdHNjd3JlYWxpdHlwdWJrZXkwMDAwMDAwMDAwMA",
        "short_id": "aa00000000000009", "sni": "www.google.com",
    },
]

UUID = os.environ.get("TEST_UUID", os.environ.get("ADMIN_UUID", ""))
TEST_URL = "https://httpbin.org/ip"
TIMEOUT = 12


def check_prerequisites():
    """Verify sing-box is installed."""
    if not shutil.which("sing-box"):
        print("ERROR: sing-box not found. Install with: brew install sing-box")
        sys.exit(1)
    if not UUID:
        print("ERROR: Set TEST_UUID or ADMIN_UUID environment variable")
        sys.exit(1)
    missing = [s["tag"] for s in SERVERS if not s["ip"]]
    if missing:
        print(f"WARNING: No IP for {', '.join(missing)}. Set HEL_IP/ORC_IP/GCP_IP/SCW_IP env vars.")


def make_reality_config(server):
    """Generate sing-box client config for Reality test."""
    return {
        "log": {"level": "warn"},
        "inbounds": [{"type": "mixed", "tag": "in", "listen": "127.0.0.1", "listen_port": PROXY_PORT}],
        "outbounds": [{
            "type": "vless", "tag": "out",
            "server": server["ip"], "server_port": server["reality_port"],
            "uuid": UUID, "flow": "xtls-rprx-vision",
            "tls": {
                "enabled": True, "server_name": server["sni"],
                "utls": {"enabled": True, "fingerprint": "chrome"},
                "reality": {
                    "enabled": True,
                    "public_key": server["pubkey"],
                    "short_id": server["short_id"],
                },
            },
        }],
    }


def make_hy2_config(server):
    """Generate sing-box client config for Hysteria2 test."""
    return {
        "log": {"level": "warn"},
        "inbounds": [{"type": "mixed", "tag": "in", "listen": "127.0.0.1", "listen_port": PROXY_PORT}],
        "outbounds": [{
            "type": "hysteria2", "tag": "out",
            "server": server["ip"], "server_port": server["hy2_port"],
            "password": UUID,
            "tls": {
                "enabled": True,
                "server_name": server["sni"],
                "insecure": True,
            },
        }],
    }


def test_protocol(server, config, protocol_name):
    """Start sing-box with config, test proxy, return result."""
    config_path = "/tmp/vpn-connectivity-test.json"
    with open(config_path, "w") as f:
        json.dump(config, f)

    proc = subprocess.Popen(
        ["sing-box", "run", "-c", config_path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    time.sleep(3)

    result = {"server": server["tag"], "name": server["name"],
              "protocol": protocol_name, "status": "fail", "exit_ip": None, "error": None}

    os.environ["http_proxy"] = f"http://127.0.0.1:{PROXY_PORT}"
    os.environ["https_proxy"] = f"http://127.0.0.1:{PROXY_PORT}"
    try:
        r = urllib.request.urlopen(TEST_URL, timeout=TIMEOUT)
        data = json.loads(r.read().decode())
        result["status"] = "ok"
        result["exit_ip"] = data.get("origin", "unknown")
    except Exception as e:
        result["error"] = str(e)[:100]
    finally:
        del os.environ["http_proxy"]
        del os.environ["https_proxy"]

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    time.sleep(1)
    return result


def main():
    args = set(sys.argv[1:])
    json_output = "--json" in args
    test_reality = "--reality" in args or not (args - {"--json"})
    test_hy2 = "--hy2" in args or not (args - {"--json"})

    check_prerequisites()

    results = []
    active_servers = [s for s in SERVERS if s["ip"]]

    if not active_servers:
        print("No servers configured. Set HEL_IP, ORC_IP, GCP_IP, SCW_IP.")
        sys.exit(1)

    for server in active_servers:
        if test_reality:
            cfg = make_reality_config(server)
            r = test_protocol(server, cfg, "Reality")
            results.append(r)
            if not json_output:
                icon = "✅" if r["status"] == "ok" else "❌"
                print(f"  {icon} Reality {server['name']} ({server['ip']}): "
                      f"{r['status']}{' → ' + r['exit_ip'] if r['exit_ip'] else ''}"
                      f"{' — ' + r['error'] if r['error'] else ''}")

        if test_hy2:
            cfg = make_hy2_config(server)
            r = test_protocol(server, cfg, "Hysteria2")
            results.append(r)
            if not json_output:
                icon = "✅" if r["status"] == "ok" else "❌"
                print(f"  {icon} Hy2    {server['name']} ({server['ip']}): "
                      f"{r['status']}{' → ' + r['exit_ip'] if r['exit_ip'] else ''}"
                      f"{' — ' + r['error'] if r['error'] else ''}")

    if json_output:
        print(json.dumps(results, indent=2))

    ok = sum(1 for r in results if r["status"] == "ok")
    total = len(results)
    if not json_output:
        print(f"\n{'='*40}")
        print(f"Results: {ok}/{total} passed")

    sys.exit(0 if ok == total else 1)


if __name__ == "__main__":
    main()
