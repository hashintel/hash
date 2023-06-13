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

variable "hub_cidr" {
  type        = string
  description = "CIDR of the VPC Hub"
}

variable "spoke_cidr" {
  type        = string
  description = "CIDR of the VPC Spoke to peer to the Hub"
}

variable "rtpriv_id" {
  type        = string
  description = "Private route table ID"
}
