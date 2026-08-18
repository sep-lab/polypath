variable "hetzner_ssh_public_key" {
  description = "SSH public key for Hetzner server"
  type        = string
}

variable "hetzner_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "oracle_compartment_id" {
  description = "Oracle Cloud compartment OCID"
  type        = string
}

variable "oracle_availability_domain" {
  description = "Oracle Cloud availability domain"
  type        = string
}

variable "oracle_image_ocid" {
  description = "Oracle Cloud image OCID (region-specific). Find with: oci compute image list"
  type        = string
}

variable "oracle_ssh_public_key" {
  description = "SSH public key for Oracle instance"
  type        = string
}

variable "gcp_project_id" {
  description = "Google Cloud project ID"
  type        = string
}

variable "gcp_ssh_public_key" {
  description = "SSH public key for GCP instance"
  type        = string
}

variable "scaleway_ssh_public_key" {
  description = "SSH public key for Scaleway instance"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for example.com"
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  type        = string
  sensitive   = true
}
