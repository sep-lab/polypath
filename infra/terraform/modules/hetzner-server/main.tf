terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.49"
    }
  }
}

resource "hcloud_ssh_key" "main" {
  name       = "${var.server_name}-key"
  public_key = var.ssh_public_key
}

resource "hcloud_firewall" "main" {
  name = "${var.server_name}-fw"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
    description = "SSH"
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "udp"
    port      = "8443"
    source_ips = ["0.0.0.0/0", "::/0"]
    description = "Hysteria2"
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "53"
    source_ips = ["0.0.0.0/0", "::/0"]
    description = "DNS tunnel"
  }

  rule {
    direction = "in"
    protocol  = "udp"
    port      = "53"
    source_ips = ["0.0.0.0/0", "::/0"]
    description = "DNS tunnel"
  }
}

resource "hcloud_server" "main" {
  name        = var.server_name
  image       = var.baked_image_id != "" ? var.baked_image_id : "ubuntu-24.04"
  server_type = var.server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.main.id]
}

resource "hcloud_firewall_attachment" "main" {
  firewall_id = hcloud_firewall.main.id
  server_ids  = [hcloud_server.main.id]
}

resource "hcloud_rdns" "ipv4" {
  server_id  = hcloud_server.main.id
  ip_address = hcloud_server.main.ipv4_address
  dns_ptr    = "${var.server_name}.example.com"
}
