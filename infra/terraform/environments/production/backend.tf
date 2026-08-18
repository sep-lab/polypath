terraform {
  # Backend credentials are deliberately NOT declared here. backend.tf is
  # required source and cannot be gitignored, so any credential written into it
  # is one `git add -A` away from being committed. Supply them at init time:
  #
  #   export AWS_ACCESS_KEY_ID=<r2-access-key-id>
  #   export AWS_SECRET_ACCESS_KEY=<r2-secret-access-key>
  #   tofu init -backend-config="bucket=<your-bucket>" \
  #             -backend-config="endpoints={s3=\"https://<account>.r2.cloudflarestorage.com\"}"
  #
  # See terraform.tfvars.example for the full list of required variables.
  backend "s3" {
    key                         = "production/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.49"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.0"
    }
  }

  required_version = ">= 1.6.0"
}
