output "ip_address" {
  description = "Static external IP address"
  value       = google_compute_address.static.address
}

output "instance_id" {
  description = "GCP instance ID"
  value       = google_compute_instance.main.id
}
