terraform {
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.0"
    }
  }
}

resource "scaleway_instance_ip" "main" {
  zone = var.zone
}

resource "scaleway_instance_server" "main" {
  name  = "vpn-scaleway"
  type  = "PLAY2-PICO"
  image = "ubuntu_jammy"
  zone  = var.zone

  ip_id = scaleway_instance_ip.main.id

  root_volume {
    size_in_gb = 20
  }
}

resource "scaleway_account_ssh_key" "main" {
  name       = "vpn-scaleway-key"
  public_key = var.ssh_public_key
}
