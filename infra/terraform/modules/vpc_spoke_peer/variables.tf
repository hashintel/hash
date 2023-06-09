variable "region" {
  type        = string
  description = "The AWS region"
}

variable "env" {
  type        = string
  description = "The environment of the deployment"
}

variable "vpc_id" {
  type        = string
  description = "The VPC ID of the VPC Spoke to connect to the Hub"
}
