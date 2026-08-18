variable "compartment_id" {
  description = "Oracle Cloud compartment OCID"
  type        = string
}

variable "availability_domain" {
  description = "Oracle Cloud availability domain"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key content"
  type        = string
}

variable "image_ocid" {
  description = "Oracle Cloud image OCID (Ubuntu 24.04 — get from OCI console for your region)"
  type        = string
}

variable "subnet_id" {
  description = "Oracle Cloud subnet OCID"
  type        = string
  default     = ""
}
