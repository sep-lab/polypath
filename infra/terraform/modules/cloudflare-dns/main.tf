terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

resource "cloudflare_record" "hel_direct" {
  zone_id = var.zone_id
  name    = "hel"
  value   = var.hel_ip
  type    = "A"
  proxied = false
}

resource "cloudflare_record" "orc_direct" {
  zone_id = var.zone_id
  name    = "orc"
  value   = var.orc_ip
  type    = "A"
  proxied = false
}

resource "cloudflare_record" "gcp_direct" {
  zone_id = var.zone_id
  name    = "gcp"
  value   = var.gcp_ip
  type    = "A"
  proxied = false
}

resource "cloudflare_record" "scw_direct" {
  zone_id = var.zone_id
  name    = "scw"
  value   = var.scw_ip
  type    = "A"
  proxied = false
}

resource "cloudflare_record" "cdn" {
  zone_id = var.zone_id
  name    = "cdn"
  value   = var.hel_ip
  type    = "A"
  proxied = true
}

resource "cloudflare_record" "cdn2" {
  zone_id = var.zone_id
  name    = "cdn2"
  value   = var.orc_ip
  type    = "A"
  proxied = true
}

resource "cloudflare_record" "cdn3" {
  zone_id = var.zone_id
  name    = "cdn3"
  value   = var.scw_ip
  type    = "A"
  proxied = true
}

resource "cloudflare_record" "cdn4" {
  zone_id = var.zone_id
  name    = "cdn4"
  value   = var.gcp_ip
  type    = "A"
  proxied = true
}

resource "cloudflare_record" "sub" {
  zone_id = var.zone_id
  name    = "sub"
  value   = "your-pages-project.pages.dev"
  type    = "CNAME"
  proxied = true
}
