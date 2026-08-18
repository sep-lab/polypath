# Quickstart — deploy your own

Zero to a working subscription URL on your own infrastructure.

Nothing here needs access to this project's servers, secrets, or maintainer.

**Before you start**, read [the threat model](../threat-model.md) — in particular
§3.6 on legal risk. If you are provisioning a server in a jurisdiction where this
carries legal exposure, that exposure is yours, and it is real.

---

## 0. Try it with no infrastructure first (2 minutes)

```bash
git clone https://github.com/sep-lab/polypath && cd polypath
npm ci && npm run demo
```

That runs the config generator against fictional servers and prints real output.
Do this before spending money — it shows you what you are building toward.

## 1. What you need

| | |
|---|---|
| **A VPS** | 1 vCPU / 1 GB is enough. Any provider. ~$4/month, or a free tier |
| **A domain** | Any registrar. Needed for CDN fronting and TLS |
| **A Cloudflare account** | Free tier. Hosts the subscription worker and proxies the CDN subdomains |
| **Local tools** | `node >= 20`, `ansible`, `git`, an SSH key |

One server is a complete deployment. The four-server fleet in `config/servers.yaml`
is what this project runs, not what you need to start.

## 2. Provision the server

Create an Ubuntu 22.04 or 24.04 VPS and note its IP. Confirm SSH works:

```bash
export MY_SERVER_IP=<your-server-ip>
ssh root@$MY_SERVER_IP    # or ubuntu@ on Oracle/GCP/AWS images
```

Open these ports in your provider's firewall — the Ansible role configures UFW on
the host, but cloud firewalls are separate and are a common first stumble:

| Port | Proto | Why |
|---|---|---|
| 22 | tcp | SSH. Restrict to your own address if you can |
| 80 | tcp | HTTP obfuscation, ACME |
| 443 | tcp | HAProxy — fronts Reality, CDN-WS and XHTTP |
| 8443 | udp | Hysteria2 |

## 3. Point DNS at it

In Cloudflare DNS for your domain:

| Record | Name | Value | Proxy |
|---|---|---|---|
| A | `cdn` | your server IP | **Proxied** (orange) |
| A | `web` | your server IP | DNS only (grey) |

`cdn` must be proxied — that is what puts CDN edge addresses between your users
and your origin. `web` is used for NaiveProxy, which terminates its own TLS.

> Do **not** create a grey-clouded record pointing at your origin unless you need
> a direct-connect fallback. It publishes the address the CDN exists to hide.

## 4. Generate your own secrets

Never reuse values from this repo — everything committed here is a placeholder.

```bash
# Reality keypair (the server prints both halves)
docker run --rm ghcr.io/xtls/xray-core x25519

# Reality short ID — a server-side allowlist credential, not public
openssl rand -hex 8

# Protocol passwords
openssl rand -hex 16    # NaiveProxy, ShadowTLS, Salamander (one each)
openssl rand -base64 16 # Shadowsocks 2022 keys

# A user UUID, and a separate probe token
uuidgen
openssl rand -hex 16
```

Put them in an environment file that is **not** committed (`.gitignore` already
covers these paths):

```bash
cp tools/smart-sub/.dev.vars.example tools/smart-sub/.dev.vars
$EDITOR tools/smart-sub/.dev.vars
```

`PROBE_TOKEN` must not equal `ADMIN_UUID`. It is embedded in the probe script
handed to testers, and it grants only the ability to report results.

## 5. Configure the server topology

```bash
cd infra/ansible
cp inventory/hosts.example.yml inventory/hosts.yml
$EDITOR inventory/hosts.yml   # set ansible_user, key path, and your domain
```

Then describe the same server in `config/servers.yaml`. Copy an existing entry and
change the tag, location, and the `*_env` names. Note that the config layer stores
the **name of the environment variable**, never the value:

```yaml
- tag: "myserver"
  location: "Somewhere"
  ip_env: "MY_SERVER_IP"
  reality:
    port: 443
    pubkey_env: "MY_REALITY_PUBKEY"
    short_id_env: "MY_REALITY_SHORT_ID"
    sni: "www.google.com"
  enabled: true
```

Validate before deploying:

```bash
npm run validate:config
```

## 6. Deploy the server

```bash
cd infra/ansible
ansible-galaxy collection install -r requirements.yml
ansible-playbook -i inventory/hosts.yml playbooks/site.yml --check   # dry run
ansible-playbook -i inventory/hosts.yml playbooks/site.yml
```

This installs Docker, configures UFW and SSH, and brings up HAProxy on 443
fronting Xray and sing-box.

Verify:

```bash
ssh root@$MY_SERVER_IP 'docker ps && ss -tulnp | grep -E "443|8443"'
```

## 7. Deploy the subscription worker

```bash
npm run build
cd tools/smart-sub
npx wrangler pages project create <your-project-name>
npx wrangler pages deploy . --project-name <your-project-name>
```

Set each secret from your `.dev.vars` as a Cloudflare secret, then bind a KV
namespace for health and user data:

```bash
npx wrangler kv namespace create HEALTH   # put the returned id in wrangler.toml
```

Point `sub.yourdomain.com` at the Pages project in Cloudflare.

## 8. Connect a client

Your subscription URL is:

```text
https://sub.yourdomain.com/sub/<your-uuid>
```

Add it to [Hiddify](https://github.com/hiddify/hiddify-next),
[v2rayNG](https://github.com/2dust/v2rayNG), or any sing-box client. See
[client-setup.md](./client-setup.md) for per-app detail.

Sanity check before you trust it:

```bash
curl -s https://sub.yourdomain.com/sub/<your-uuid> | base64 -d | head
```

## 9. Confirm it actually works

Connect, then verify your traffic egresses from the server:

```bash
curl https://ipinfo.io/ip     # should return your server's IP
```

And check for DNS leaks at [dnsleaktest.com](https://www.dnsleaktest.com).

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Ansible cannot connect | Cloud firewall, or wrong `ansible_user` for the image |
| `/sub/<uuid>` returns 401 | UUID not in `.dev.vars` or not set as a Cloudflare secret |
| Configs generate but nothing connects | Cloud firewall ports 443/tcp and 8443/udp |
| Reality fails to handshake | `pubkey`/`short_id` mismatch between server and generated config |
| CDN configs fail, direct works | `cdn` record not proxied (grey instead of orange) |
| `npm ci` fails in `tools/smart-sub` | Known lockfile drift — run from the repo root instead |

## Where to go next

- [Threat model](../threat-model.md) — what this does and does not defend against
- [Architecture](../../architecture.md) — how the layers fit together
- [Operations](../ops/operations.md) — backup, rotation, troubleshooting
- [Contributing](../../CONTRIBUTING.md) — the most useful contribution is a measurement
