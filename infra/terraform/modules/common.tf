
provider "aws" {
  profile = "default"
  region  = var.region

  default_tags {
    tags = {
      project             = "hash"
      environment         = "${var.env}"
      region              = "${var.region}"
      terraform_workspace = "${terraform.workspace}"
    }
  }
}

locals {
  prefix = "h-hash-${var.env}-${var.region_short[var.region]}"
}


#########################################################################################
# Internal variables -- not intended to be specified in *.tfvars file.

# Shorter region prefixes used for naming resources
variable "region_short" {
  type = map(string)
  default = {
    us-east-1 = "usea1"
  }
}

# Availability zones in AWS regions
variable "az" {
  type = map(list(string))
  default = {
    "us-east-1" = ["us-east-1a", "us-east-1b", "us-east-1c", "us-east-1d"]
  }
}

#########################################################################################
