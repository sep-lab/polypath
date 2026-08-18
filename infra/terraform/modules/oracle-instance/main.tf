terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

resource "oci_core_instance" "main" {
  compartment_id      = var.compartment_id
  availability_domain = var.availability_domain
  display_name        = "vpn-oracle"

  shape = "VM.Standard.A1.Flex"
  shape_config {
    ocpus         = 1
    memory_in_gbs = 6
  }

  source_details {
    source_type = "image"
    source_id   = var.image_ocid
  }

  create_vnic_details {
    subnet_id        = var.subnet_id
    assign_public_ip = false
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
  }
}

resource "oci_core_public_ip" "main" {
  compartment_id = var.compartment_id
  lifetime       = "RESERVED"
  display_name   = "vpn-oracle-static-ip"
  private_ip_id  = data.oci_core_private_ips.main.private_ips[0].id
}

data "oci_core_private_ips" "main" {
  ip_address = oci_core_instance.main.private_ip
  subnet_id  = var.subnet_id
}
