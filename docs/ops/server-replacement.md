# Server Replacement Procedure

Use this procedure when replacing a VPN server (hardware failure, upgrade,
IP rotation, etc.). All servers are treated as cattle — replacing one means
creating a new one from a baked image and running the protocols playbook.

## Prerequisites

- Packer installed: `packer version`
- OpenTofu installed: `tofu version`
- Ansible installed: `ansible --version`
- Valid SSH keys in `~/.ssh/`
- Environment variables set (see `infra/ansible/inventory/hosts.yml`)

## Steps

### 1. Bake a new image

```bash
packer build infra/packer/<provider>.pkr.hcl
```

Note the image ID from the output (or check `infra/packer/<provider>-manifest.json`).

### 2. Update Terraform module with new image ID

Edit `infra/terraform/modules/<provider>/variables.tf` or
`infra/terraform/environments/production/main.tf` and set `baked_image_id`
to the new image ID.

### 3. Review the Terraform plan

```bash
node scripts/generate-terraform-vars.js
cd infra/terraform/environments/production
tofu init
tofu plan
```

Review the plan carefully. You should see:

- Old server destroyed
- New server created from baked image

### 4. Apply Terraform (server replacement)

```bash
tofu apply
```

The old server is destroyed and the new one is created.

### 5. Configure VPN protocols on the new server

```bash
ansible-playbook infra/ansible/playbooks/protocols.yml \
  -i infra/ansible/inventory/hosts.yml \
  --limit <server_name>
```

This configures sing-box, xray, and any optional protocols (NaiveProxy,
Cloak, etc.) on the fresh server.

### 6. Verify health

```bash
curl https://<server_ip>/health
```

Should return HTTP 200.

### 7. Update DNS if IP changed

If the server got a new IP, Terraform will have already updated DNS records
(via the `cloudflare-dns` module). Verify:

```bash
dig +short hel.example.com  # or orc/gcp/scw
```

## Notes

- The old server is **already gone** after `tofu apply` — no manual cleanup needed.
- WARP outbound needs the `warp_private_key` secret — set it in Ansible vault
  or pass via environment variable.
- If Terraform shows more than server replacement in the plan, **stop and investigate**
  before applying.
