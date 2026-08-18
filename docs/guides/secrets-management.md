# Secrets Management — sops + age

This project uses [Mozilla SOPS](https://github.com/getsops/sops) with
[age](https://github.com/FiloSottile/age) encryption to manage secrets.
Encrypted secrets live in `config/secrets/*.enc.yaml` and are committed to git.

## Prerequisites

Install both tools:

```bash
# macOS
brew install sops age

# Linux (Debian/Ubuntu)
sudo apt install age
# Download sops from https://github.com/getsops/sops/releases
```

## Initial Setup

### 1. Generate an age keypair

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
```

Note the **public key** printed (starts with `age1...`).

### 2. Configure `.sops.yaml`

Update `.sops.yaml` at the repo root — replace the placeholder age public key
with your actual public key:

```yaml
creation_rules:
  - path_regex: config/secrets/.*\.enc\.yaml$
    age: age1your-actual-public-key-here
```

### 3. Encrypt the template files

Fill in your real values in the `.enc.yaml` files, then encrypt them:

```bash
# Edit with real values first
nano config/secrets/servers.enc.yaml
nano config/secrets/users.enc.yaml

# Encrypt in-place
sops --encrypt --in-place config/secrets/servers.enc.yaml
sops --encrypt --in-place config/secrets/users.enc.yaml
```

After encryption, the files contain ciphertext and are safe to commit.

## Day-to-Day Usage

### Edit encrypted secrets

```bash
# Opens in $EDITOR, decrypts → edits → re-encrypts on save
sops config/secrets/servers.enc.yaml
```

### View decrypted values

```bash
sops --decrypt config/secrets/servers.enc.yaml
```

### Build with secrets

The build system automatically decrypts secrets when `SOPS_AGE_KEY` is set:

```bash
# Option A: Export the key
export SOPS_AGE_KEY=$(cat ~/.config/sops/age/keys.txt | grep -v '^#' | head -1)
npm run build

# Option B: Point to the key file
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
npm run build
```

Without either variable, the build produces a worker with placeholder values
and prints a warning.

### Build without secrets (development)

```bash
npm run build
# ℹ No SOPS_AGE_KEY set — secrets will use placeholder values
```

## CI/CD Integration

GitHub Actions receives the age **private key** via the `SOPS_AGE_KEY`
repository secret. The deploy workflow uses it during the build step:

```yaml
- name: Build worker from src/
  run: npm run build
  env:
    SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY }}
```

### Setting up the GitHub secret

1. Copy your age private key: `cat ~/.config/sops/age/keys.txt`
2. Go to repo **Settings → Secrets and variables → Actions**
3. Create secret `SOPS_AGE_KEY` with the full contents of `keys.txt`

## File Structure

```text
config/secrets/
├── .gitkeep              # Keeps the directory in git
├── servers.enc.yaml      # Encrypted server IPs, passwords, keys
└── users.enc.yaml        # Encrypted user UUIDs and tiers
```

- `*.enc.yaml` — **Encrypted**, committed to git (safe)
- `*.yaml` (without `.enc`) — **Decrypted**, gitignored (never commit)

## Migration from vars.env

The legacy `tools/deploy/vars.env` approach is deprecated. To migrate:

1. Complete the setup above
2. Move your secrets from `vars.env` into the `.enc.yaml` templates
3. Encrypt with `sops --encrypt --in-place`
4. Verify: `npm run build` with `SOPS_AGE_KEY` set produces correct output
5. Deploy scripts still read `vars.env` for server provisioning — keep it
   locally but don't rely on it for the subscription worker

## Security Notes

- The age **private key** (`keys.txt`) must NEVER be committed to git
- Only the **public key** goes in `.sops.yaml`
- Encrypted `.enc.yaml` files are safe to commit — they're ciphertext
- Rotate the age keypair if compromised: re-encrypt all files with `sops updatekeys`
