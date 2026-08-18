# Cloudflare Pages Setup (EDtunnel)

## Overview

EDtunnel deploys a VLESS proxy on Cloudflare's edge network via Pages.

- **Cost**: Free (100k requests/day on free tier)
- **Block risk**: Near zero (blocking = breaking Cloudflare for everyone)
- **Speed**: Moderate (good enough for browsing, not ideal for streaming)
- **Source repo**: <https://github.com/6Kmfi6HP/EDtunnel>
- **Fork the repo** under your own GitHub account with an innocent name

## Current Deployment

| Detail | Value |
|---|---|
| **Platform** | Cloudflare Pages (NOT Workers — see Known Issues) |
| **Project name** | `<CF_PROJECT_NAME>` |
| **Production URL** | `<CF_PAGES_URL>` |
| **Subscription URL** | `<CF_PAGES_URL>/sub/<UUID>` |
| **UUID** | Set via Pages secret (use `wrangler pages secret put UUID`) |
| **Cloudflare Account** | Your Cloudflare account email |
| **Account ID** | Your Cloudflare account ID (dashboard → overview sidebar) |

## Deploy via Cloudflare Pages (CLI — Recommended)

Using Wrangler CLI for deployment. This method avoids Cloudflare dashboard UI issues.

### Prerequisites

```bash
npm install -g wrangler --registry=https://registry.npmjs.org --ignore-scripts
wrangler login
```

### Steps

1. **Clone your fork**

   ```bash
   git clone https://github.com/<YOUR_GITHUB_USER>/<YOUR_FORK_NAME>.git
   cd <YOUR_FORK_NAME>
   ```

2. **Create a Pages project** (use an innocent, non-proxy-sounding name)

   ```bash
   wrangler pages project create <project-name> --production-branch main
   ```

   > **Important**: Use generic project names like `your-cover-site-a`, `blog-assets`, etc.
   > Avoid names containing "proxy", "vpn", "tunnel", "vless" — Cloudflare abuse detection flags these.

3. **Set the UUID secret**

   ```bash
   wrangler pages secret put UUID --project-name <project-name>
   # Enter your UUID when prompted
   ```

   Generate a UUID: `uuidgen` or <https://www.uuidgenerator.net/>

4. **Deploy**

   ```bash
   wrangler pages deploy pages-dist --project-name <project-name> --commit-dirty=true
   ```

5. **Verify**

   ```bash
   # Check landing page
   curl -s https://<project-name>-XXX.pages.dev/
   
   # Check subscription endpoint (returns base64-encoded VLESS+Trojan configs)
   curl -s "https://<project-name>-XXX.pages.dev/sub/YOUR_UUID"
   ```

### Redeployment

To redeploy (e.g. after updating `_worker.js`):

```bash
wrangler pages deploy pages-dist --project-name <project-name> --commit-dirty=true
```

## Deploy via Cloudflare Pages (Dashboard — Alternative)

1. Go to <https://dash.cloudflare.com> → Workers & Pages → Create → Pages → Connect to Git
2. Select the `your-cover-site-b` repo
3. Build settings: Framework preset: None, Build command: (empty), Build output directory: (empty)
4. Save and Deploy
5. Go to Settings → Environment variables → Add `UUID`
6. Redeploy

## Known Issues

### Workers DO NOT work (Error 1101)

Deploying EDtunnel as a Cloudflare Worker (not Pages) results in **Error 1101: Worker threw exception**.

**Root cause**: `import { connect } from 'cloudflare:sockets'` crashes at module initialization on Workers. This is specific to certain (free-tier?) accounts. A minimal Worker that only imports `cloudflare:sockets` will also fail with 1101. Hello World workers without the import work fine.

**Workaround**: Deploy via **Cloudflare Pages** instead. Pages handles `cloudflare:sockets` correctly.

### Cloudflare Abuse Detection (Code 8000119)

Cloudflare may flag Pages projects after deployment, blocking further deploys with:
> "Your Pages project has been blocked. Contact <abusereply@cloudflare.com>."

**Triggers**: Project names containing proxy/vpn-related keywords, or EDtunnel code fingerprint detection.

**Workaround**: Create a new project with an innocent name. Existing deployments continue to serve traffic even after the project is blocked for new deploys.

## Testing

### Browser Test

Visit `https://<project-url>/UUID` in a browser. You should see a configuration page with VLESS connection details.

### Subscription Test

Visit `https://<project-url>/sub/UUID` to get base64-encoded config list for auto-import into clients.

### Client Test

Import the VLESS link into Hiddify or V2RayNG and test connection.

## Tips

- **Innocent naming**: Always use generic, non-suspicious project names
- **Multiple UUIDs**: Set multiple UUIDs separated by commas for different users
- **ProxyIP** (optional): Set `PROXYIP` environment variable for better performance
- **Custom domain** (optional): In Pages → your project → Custom domains → add a subdomain of a domain on your Cloudflare account
- **Backup projects**: Consider having 2-3 Pages projects deployed under different names as redundancy

## Client Configuration

### Hiddify / V2RayNG / Shadowrocket

Import the VLESS subscription URL directly:

```text
<CF_PAGES_URL>/sub/<UUID>
```

Or use individual VLESS link:

```text
vless://<UUID>@<CF_PAGES_URL_HOST>:443?encryption=none&security=tls&type=ws&host=<CF_PAGES_URL_HOST>&path=%2F%3Fed%3D2048#CF-Pages-EDtunnel
```

### Clash / Clash Meta

```yaml
proxies:
  - name: CF-Pages-EDtunnel
    type: vless
    server: <CF_PAGES_URL_HOST>
    port: 443
    uuid: <UUID>
    network: ws
    tls: true
    ws-opts:
      path: /?ed=2048
      headers:
        Host: <CF_PAGES_URL_HOST>
```

### Trojan (also supported by EDtunnel)

```text
trojan://<UUID>@<CF_PAGES_URL_HOST>:443?security=tls&type=ws&host=<CF_PAGES_URL_HOST>&path=%2F%3Fed%3D2048&sni=<CF_PAGES_URL_HOST>#CF-Pages-Trojan
```
