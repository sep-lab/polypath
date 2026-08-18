terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

resource "google_compute_address" "static" {
  name   = "vpn-static-ip"
  region = trimsuffix(var.zone, "-b")
}

resource "google_compute_firewall" "main" {
  name    = "vpn-allow"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22", "80", "443", "53"]
  }

  allow {
    protocol = "udp"
    ports    = ["8443", "53"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["vpn-server"]
}

resource "google_compute_instance" "main" {
  name         = "vpn-gcp"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["vpn-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts"
      size  = 30
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.static.address
    }
  }

  metadata = {
    ssh-keys = "ubuntu:${var.ssh_public_key}"
  }
}
