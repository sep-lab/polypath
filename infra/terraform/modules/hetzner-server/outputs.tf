output "ip_address" {
  description = "Server IPv4 address"
  value       = hcloud_server.main.ipv4_address
}

output "ipv6_address" {
  description = "Server IPv6 address"
  value       = hcloud_server.main.ipv6_address
}

output "server_id" {
  description = "Server ID"
  value       = hcloud_server.main.id
}
