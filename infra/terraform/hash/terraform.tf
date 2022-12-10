terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.41"
    }
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "1.18.0"
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
