packer {
  required_plugins {
    hcloud = {
      source  = "github.com/hetznercloud/hcloud"
      version = ">= 1.6.0"
    }
    ansible = {
      source  = "github.com/hashicorp/ansible"
      version = ">= 1.1.0"
    }
  }
}

variable "hcloud_token" {
  type      = string
  sensitive = true
  default   = env("HCLOUD_TOKEN")
}

source "hcloud" "ubuntu" {
  token         = var.hcloud_token
  image         = "ubuntu-24.04"
  location      = "hel1"
  server_type   = "cx23"
  snapshot_name = "vpn-base-{{timestamp}}"
  ssh_username  = "root"
}

build {
  sources = ["source.hcloud.ubuntu"]

  provisioner "ansible" {
    playbook_file = "${path.root}/../../infra/ansible/playbooks/site.yml"
    extra_arguments = [
      "--tags", "base,haproxy",
      "--extra-vars", "ansible_become=true",
      "-i", "${path.root}/../../infra/ansible/inventory/hosts.yml",
    ]
  }

  post-processor "manifest" {
    output     = "${path.root}/hetzner-manifest.json"
    strip_path = true
  }
}
