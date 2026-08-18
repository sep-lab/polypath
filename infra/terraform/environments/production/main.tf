module "hetzner" {
  source         = "../../modules/hetzner-server"
  server_name    = "helsinki"
  location       = "hel1"
  server_type    = "cx23"
  ssh_public_key = var.hetzner_ssh_public_key
}

module "oracle" {
  source              = "../../modules/oracle-instance"
  compartment_id      = var.oracle_compartment_id
  availability_domain = var.oracle_availability_domain
  ssh_public_key      = var.oracle_ssh_public_key
  image_ocid          = var.oracle_image_ocid
}

module "gcp" {
  source         = "../../modules/gcp-instance"
  project_id     = var.gcp_project_id
  zone           = "me-central1-b"
  machine_type   = "e2-medium"
  ssh_public_key = var.gcp_ssh_public_key
}

module "scaleway" {
  source         = "../../modules/scaleway-instance"
  zone           = "fr-par-1"
  ssh_public_key = var.scaleway_ssh_public_key
}

module "dns" {
  source     = "../../modules/cloudflare-dns"
  zone_id    = var.cloudflare_zone_id
  hel_ip     = module.hetzner.ip_address
  orc_ip     = module.oracle.ip_address
  gcp_ip     = module.gcp.ip_address
  scw_ip     = module.scaleway.ip_address
}

module "pages" {
  source         = "../../modules/cloudflare-pages"
  account_id     = var.cloudflare_account_id
  project_name   = "your-pages-project"
  custom_domain  = "sub.example.com"
}
