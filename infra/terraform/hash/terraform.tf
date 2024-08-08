terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.67"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "1.18.0"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "~> 3.15"
    }
  }

  required_version = ">= 1.2"

  backend "s3" {
    bucket               = "hash-terraform-state-s3-backend"
    workspace_key_prefix = "hash"
    key                  = "state"
    region               = "us-east-1"
    encrypt              = true
  }
}
