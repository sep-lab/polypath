# Server Provisioning Guide

Step-by-step instructions for each provider. After provisioning, hand the IP to Claude → `deploy.sh` handles the rest.

---

## 1. Oracle Cloud — Always Free (2 VMs, $0 forever)

### What You Get

- **2 VMs** with 1 OCPU (ARM Ampere), 1GB RAM, 50GB boot volume each
- Always Free — never expires, no credit card charge (card required for verification only)
- Locations: US (Phoenix/Ashburn), EU (Frankfurt/Amsterdam), Asia (Tokyo/Mumbai/Seoul)

### Step-by-Step

1. **Go to**: <https://cloud.oracle.com/>

2. **Sign up** (takes ~5 min):
   - Click "Sign Up for Free"
   - Use a real email (you'll verify it)
   - **Home Region**: Pick **Frankfurt** (eu-frankfurt-1) or **Amsterdam** — closest to Iran, best latency
   - Enter credit card (verification only, $0 charged for Always Free)
   - Wait for account activation (usually instant, sometimes up to 30 min)

3. **Create VM #1**:
   - Dashboard → "Create a VM instance"
   - **Name**: `vpn-exit-1` (or anything)
   - **Image**: Ubuntu 24.04 (Canonical)
   - **Shape**: Click "Change Shape" → **Ampere** → **VM.Standard.A1.Flex**
     - OCPUs: **1**
     - RAM: **1 GB** (this keeps it in Always Free)
   - **Networking**: Use default VCN or create new
     - Check "Assign a public IPv4 address"
   - **SSH Key**: Upload your public key (`~/.ssh/id_ed25519.pub` or `~/.ssh/id_rsa.pub`)
     - Same key you use for Helsinki
   - Click **Create**
   - Wait ~2 min for it to boot
   - **Copy the Public IP** from the instance details page

4. **Open firewall ports** (Oracle has both OS firewall AND cloud security list):

   **Cloud Security List** (in Oracle Console):
   - Go to: Networking → Virtual Cloud Networks → your VCN → Security Lists → Default
   - Add Ingress Rules:
     - Source: `0.0.0.0/0`, Protocol: TCP, Dest Port: `443` (Reality)
     - Source: `0.0.0.0/0`, Protocol: UDP, Dest Port: `8443` (Hy2)
     - Source: `0.0.0.0/0`, Protocol: TCP, Dest Port: `22` (SSH — already there)

5. **Test SSH**:

   ```bash
   ssh ubuntu@<ORACLE_IP>
   # Oracle uses 'ubuntu' user, not root. deploy.sh will need adjustment.
   # Or: sudo su - to become root
   ```

6. **Create VM #2**: Repeat step 3-4 with name `vpn-exit-2`
   - Use same or different region for diversity

7. **Record both IPs** → deploy the stack (see [checklist.md](../../docs/ops/checklist.md))

### Oracle Gotchas

- Default user is `ubuntu`, not `root` — need `sudo` or set up root
- ARM (aarch64) — sing-box and reality-ezpz support ARM, should work
- Oracle's iptables rules are aggressive — must open ports in BOTH Security List AND OS firewall
- "Always Free" shape: VM.Standard.A1.Flex with max 1 OCPU + 1GB per VM (total 4 OCPU + 24GB across account)
- If you pick a non-Always-Free shape by accident, you'll be charged

### Time: ~15 minutes total (both VMs)

---

## 2. OVH — VPS Starter, France (~€3.50/mo)

### What You Get

- 1 vCPU, 2GB RAM, 20GB SSD, 250 Mbps, unlimited traffic
- Location: France (Gravelines or Strasbourg datacenter)
- Different ASN than Hetzner — IP block diversity

### Step-by-Step

1. **Go to**: <https://www.ovhcloud.com/en/vps/>

2. **Sign up** (if no account):
   - Click "Get started"
   - Create OVH account with email + password
   - Verify email

3. **Order VPS**:
   - Select **VPS Starter** (~€3.50/mo)
   - **Location**: France (default, fine)
   - **OS**: Ubuntu 24.04 LTS
   - **SSH Key**: Paste your public key
   - **Billing**: Monthly
   - **Payment**: Credit card or PayPal
   - Complete order

4. **Wait for provisioning** (~5-10 min):
   - Check email for "Your VPS is ready" notification
   - Go to OVH Control Panel → Bare Metal Cloud → VPS → your VPS
   - **Copy the IPv4 and IPv6 addresses**

5. **Test SSH**:

   ```bash
   ssh root@<OVH_IP>
   # OVH VPS uses root by default with SSH key
   ```

6. **Record the IP** → run `bash tools/deploy/deploy.sh <SERVER_IP>`

### OVH Gotchas

- OVH's cheapest plan has only 20GB disk (vs Hetzner's 40GB) — plenty for VPN
- No built-in firewall panel — UFW on the server is your firewall
- IPv6 is included but may need manual configuration in netplan
- Support is slow on starter plans

### Time: ~10 minutes

---

## 3. ArvanCloud — eco-small1 (Iranian domestic relay, ~$1.50/mo)

> **Before you read further.** A server inside Iran is subject to Iranian law, and
> whoever's identity the account is registered under carries that legal exposure —
> not whoever operates the server. Do not ask another person to register an account
> on your behalf, and do not ask anyone to hand you SSH access to a machine
> registered in their name. If you want a domestic relay, register it yourself and
> accept the risk knowingly, or skip this section. The rest of this playbook works
> without a domestic relay.

### Provisioning the server

1. **Go to**: <https://www.arvancloud.ir/fa> (dashboard is in Farsi)

2. **Sign up** — requires an Iranian phone number and SMS verification.

3. **Buy a Cloud Server**:
   - Products → Cloud Server (سرور ابری) → "خرید سرور ابری"
   - Select the **Economic** tab → **eco-small1**: 1 CPU, 1 GB RAM, 25 GB SSD
   - **OS**: Ubuntu 22.04 or 24.04
   - **SSH Key**: upload your own public key at creation time
   - **Location**: Tehran (default)
   - Payment is Rial-only, via an Iranian bank card

4. **After creation**, copy the server's IP from the dashboard (an Iranian IP,
   typically in `185.x.x.x` or `194.x.x.x`).

5. **Verify SSH**:

   ```bash
   ssh root@<ARVAN_IP>
   ```

6. **Deploy** the relay config — see [arvancloud-relay.md](./arvancloud-relay.md).

### ArvanCloud gotchas

- An Iranian IP means domestic traffic for your users — that is the entire point.
- Do not store anything sensitive on a domestic relay. Assume it can be seized.
- Accounts do get terminated; re-provisioning takes about 5 minutes.
- Payment is Rial-only and requires an Iranian bank card.

### Time: ~10 minutes

---

## 4. Deploy Smart Subscription Worker (CF Worker)

### What You Need

- Cloudflare account (you already have one)
- `wrangler` CLI installed (`npm install -g wrangler`)
- Already authenticated (`wrangler login`)

### Step-by-Step

1. **Navigate to the worker code**:

   ```bash
   cd tools/smart-sub
   ```

2. **Review/edit `worker.js`** if needed:
   - Helsinki server is already configured
   - Uncomment and fill in France/Oracle entries once those servers are deployed
   - UUID is already set

3. **Deploy**:

   ```bash
   wrangler deploy
   ```

   - First time: it'll create the worker and give you a URL like:
     `https://vpn-smart-sub.<your-cf-subdomain>.workers.dev`

4. **Test**:

   ```bash
   # Health check
   curl https://vpn-smart-sub.<your-subdomain>.workers.dev/health

   # Subscription (base64)
   curl https://vpn-smart-sub.<your-subdomain>.workers.dev/sub/<ADMIN_UUID>

   # Subscription (JSON)
   curl "https://vpn-smart-sub.<your-subdomain>.workers.dev/sub/<ADMIN_UUID>?format=json"
   ```

5. **Import in Hiddify**:
   - Open Hiddify → "+" → "Add from subscription link"
   - Paste: `https://vpn-smart-sub.<your-subdomain>.workers.dev/sub/<UUID>`
   - Hiddify will auto-import all server configs and refresh every 6 hours

6. **Optional**: Add a custom domain (e.g., `sub.example.com`) via Cloudflare dashboard → Workers → Routes

### Time: ~2 minutes

---

## After Provisioning: What I Do

Once you have an IP, here is exactly what happens:

```text
You: "Here's the OVH France IP: 51.x.x.x"

Me: ssh root@51.x.x.x
    → System update + Docker install           (~2 min)
    → SSH hardening (disable passwords)         (~10 sec)
    → UFW firewall (22, 80, 443/tcp, 8443/udp) (~10 sec)
    → fail2ban + unattended-upgrades            (~30 sec)
    → reality-ezpz + WARP (same UUID)           (~3 min)
    → Hysteria2 cert + injection                (~1 min)
    → Automated backups (cron)                  (~10 sec)
    → Verify everything running                 (~30 sec)
    → Output: Reality keys, Hy2 hash, client URIs

Total: ~8 minutes per server
```

Then I update:

- `worker.js` SERVERS array (add new server)
- `multi-server.md` server inventory table
- `vars.env.example` with new variables
- Commit everything

---

## Parallel provisioning plan

Provider signups and VM creation are mostly waiting, so run them concurrently.
A three-exit-node build takes roughly 30 minutes end to end.

```text
0-5     Start signups for each provider in parallel browser tabs
5-10    Complete the first signup; create VM #1
10-15   Create VM #2; the fastest provider's VPS is usually ready here
        -> begin deploying to whichever IP you have first
15-20   Open cloud firewall / security list rules for each VM
20-25   Deploy the smart-sub worker (~2 min)
25-30   Deploy remaining servers; add each to config/servers.yaml
        Test the subscription URL in a client
```

### Checklist

- [ ] Provider accounts created
- [ ] VM #1 created, firewall rules opened -> IP recorded
- [ ] VM #2 created, firewall rules opened -> IP recorded
- [ ] VM #3 created, firewall rules opened -> IP recorded
- [ ] Server entries added to `config/servers.yaml`
- [ ] Per-server secrets set (see `tools/smart-sub/.dev.vars.example`)
- [ ] Smart-sub worker deployed -> URL recorded
- [ ] Ansible run completed against all hosts
- [ ] Subscription URL tested in a client
- [ ] Changes committed
