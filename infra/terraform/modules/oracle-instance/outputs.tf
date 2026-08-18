output "ip_address" {
  description = "Reserved public IP address"
  value       = oci_core_public_ip.main.ip_address
}

output "instance_id" {
  description = "Oracle instance OCID"
  value       = oci_core_instance.main.id
}
