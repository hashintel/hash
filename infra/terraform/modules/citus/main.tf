terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.53"
    }
  }

  required_version = ">= 0.14.9"

  backend "s3" {
    bucket               = "hash-terraform-state-s3-backend"
    workspace_key_prefix = "hash"
    key                  = "citus_single_config"
    region               = "us-east-1"
    encrypt              = true
  }
}

# For reading outputs from the "base" terraform config
data "terraform_remote_state" "base" {
  backend = "s3"
  config = {
    bucket = "hash-terraform-state-s3-backend"
    key    = "hash/${terraform.workspace}/base_config"
    region = "us-east-1"
  }
}
