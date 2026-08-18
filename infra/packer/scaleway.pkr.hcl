packer {
  required_plugins {
    scaleway = {
      source  = "github.com/scaleway/scaleway"
      version = ">= 1.0.0"
    }
    ansible = {
      source  = "github.com/hashicorp/ansible"
      version = ">= 1.1.0"
    }
  }
}

variable "scw_access_key" {
  type      = string
  sensitive = true
  default   = env("SCW_ACCESS_KEY")
}

variable "scw_secret_key" {
  type      = string
  sensitive = true
  default   = env("SCW_SECRET_KEY")
}

source "scaleway" "ubuntu" {
  access_key    = var.scw_access_key
  secret_key    = var.scw_secret_key
  project_id    = env("SCW_PROJECT_ID")
  image         = "ubuntu_jammy"
  zone          = "fr-par-1"
  commercial_type = "PLAY2-PICO"
  image_name    = "vpn-base-{{timestamp}}"
  ssh_username  = "root"
}

build {
  sources = ["source.scaleway.ubuntu"]

  provisioner "ansible" {
    playbook_file = "${path.root}/../../infra/ansible/playbooks/site.yml"
    extra_arguments = [
      "--tags", "base,haproxy",
      "--extra-vars", "ansible_become=true",
    ]
  }

  post-processor "manifest" {
    output     = "${path.root}/scaleway-manifest.json"
    strip_path = true
  }
}
