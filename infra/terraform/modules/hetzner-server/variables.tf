variable "server_name" {
  description = "Server name"
  type        = string
}

variable "location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "hel1"
}

variable "server_type" {
  description = "Hetzner server type"
  type        = string
  default     = "cx23"
}

variable "ssh_public_key" {
  description = "SSH public key content"
  type        = string
}

variable "baked_image_id" {
  description = "Packer-baked snapshot ID (leave empty to use ubuntu-24.04)"
  type        = string
  default     = ""
}
