output "hetzner_ip" {
  description = "Helsinki server IP"
  value       = module.hetzner.ip_address
}

output "oracle_ip" {
  description = "Oracle Madrid server IP"
  value       = module.oracle.ip_address
}

output "gcp_ip" {
  description = "GCP Dammam server IP"
  value       = module.gcp.ip_address
}

output "scaleway_ip" {
  description = "Scaleway London server IP"
  value       = module.scaleway.ip_address
}
