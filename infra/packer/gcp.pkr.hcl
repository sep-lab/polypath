packer {
  required_plugins {
    googlecompute = {
      source  = "github.com/hashicorp/googlecompute"
      version = ">= 1.1.0"
    }
    ansible = {
      source  = "github.com/hashicorp/ansible"
      version = ">= 1.1.0"
    }
  }
}

variable "gcp_project" {
  type    = string
  default = env("GCP_PROJECT_ID")
}

source "googlecompute" "ubuntu" {
  project_id          = var.gcp_project
  source_image_family = "ubuntu-2404-lts"
  zone                = "me-central1-b"
  machine_type        = "e2-medium"
  image_name          = "vpn-base-{{timestamp}}"
  image_description   = "VPN base image with Docker, UFW, HAProxy"
  ssh_username        = "ubuntu"
}

build {
  sources = ["source.googlecompute.ubuntu"]

  provisioner "ansible" {
    playbook_file = "${path.root}/../../infra/ansible/playbooks/site.yml"
    extra_arguments = [
      "--tags", "base,haproxy",
      "--extra-vars", "ansible_become=true",
    ]
  }

  post-processor "manifest" {
    output     = "${path.root}/gcp-manifest.json"
    strip_path = true
  }
}
