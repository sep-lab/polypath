variable "zone" {
  description = "Scaleway zone"
  type        = string
  default     = "fr-par-1"
}

variable "ssh_public_key" {
  description = "SSH public key content"
  type        = string
}
