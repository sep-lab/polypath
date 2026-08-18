packer {
  required_plugins {
    ansible = {
      source  = "github.com/hashicorp/ansible"
      version = ">= 1.1.0"
    }
  }
}

# Shared Ansible provisioner configuration
# Used by provider-specific builds (hetzner.pkr.hcl, gcp.pkr.hcl, scaleway.pkr.hcl)
# Installs: Docker, UFW, fail2ban, HAProxy
# Does NOT start VPN services (needs runtime secrets — done by protocols.yml)

locals {
  ansible_playbook    = "${path.root}/../../infra/ansible/playbooks/site.yml"
  ansible_inventory   = "${path.root}/../../infra/ansible/inventory/hosts.yml"
  ansible_extra_vars  = "ansible_become=true"
  ansible_tags        = "base,haproxy"
}
