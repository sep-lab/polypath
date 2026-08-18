output "ip_address" {
  description = "Static public IP address"
  value       = scaleway_instance_ip.main.address
}

output "instance_id" {
  description = "Scaleway server ID"
  value       = scaleway_instance_server.main.id
}
