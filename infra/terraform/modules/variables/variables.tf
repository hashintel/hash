variable "project" {
  type        = string
  description = "The project name"
  validation {
    condition     = can(regex("[a-z]+", var.project))
    error_message = "Must be a lowercase non-empty string"
  }
}

variable "env" {
  type        = string
  description = "The environment, defaults to the selected workspace."

  validation {
    condition     = var.env != "default"
    error_message = "Please switch to a workspace that reflects the environment you're executing within. Detected 'default'"
  }
}

variable "region" {
  type        = string
  description = "The AWS region"
}


variable "region_az_count" {
  type        = number
  description = "Number of availability zones to use for the infrastructure"

  validation {
    condition     = var.region_az_count >= 2 && var.region_az_count <= 16
    error_message = "Given number of availability zones not supported. Please provide 2 <= AZs <= 16"
  }
}

# Shorter region prefixes used for naming resources
# Source: https://gist.github.com/colinvh/14e4b7fb6b66c29f79d3#schemes
variable "region_short" {
  type = map(string)
  default = {
    us-east-1      = "usea1"
    us-east-2      = "usea2"
    us-west-1      = "uswe1"
    us-west-2      = "uswe2"
    us-gov-west-1  = "ugwe2"
    ca-central-1   = "cace1"
    eu-west-1      = "euwe1"
    eu-west-2      = "euwe2"
    eu-central-1   = "euce1"
    ap-southeast-1 = "apse1"
    ap-southeast-2 = "apse2"
    ap-south-1     = "apso1"
    ap-northeast-1 = "apne1"
    ap-northeast-2 = "apne2"
    sa-east-1      = "saea1"
    cn-north-1     = "cnno1"
  }
}
