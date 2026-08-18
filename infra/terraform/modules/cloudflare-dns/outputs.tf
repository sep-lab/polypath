output "dns_records" {
  description = "Map of DNS record names to IDs"
  value = {
    hel_direct = cloudflare_record.hel_direct.id
    orc_direct = cloudflare_record.orc_direct.id
    gcp_direct = cloudflare_record.gcp_direct.id
    scw_direct = cloudflare_record.scw_direct.id
    cdn        = cloudflare_record.cdn.id
    cdn2       = cloudflare_record.cdn2.id
    cdn3       = cloudflare_record.cdn3.id
    cdn4       = cloudflare_record.cdn4.id
    sub        = cloudflare_record.sub.id
  }
}
