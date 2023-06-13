terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.67"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "~> 3.15"
    }
  }

  required_version = ">= 1.2"

  backend "s3" {
    bucket               = "hash-terraform-state-s3-backend"
    workspace_key_prefix = "vpchub"
    key                  = "state"
    region               = "us-east-1"
    encrypt              = true
  }
}
