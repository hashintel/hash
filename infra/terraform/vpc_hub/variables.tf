variable "region" {
  type        = string
  description = "The AWS region"
}

variable "region_az_count" {
  type        = number
  description = "Number of availability zones to use for the infrastructure"
}

variable "vpc_hub_cidr" {
  type        = number
  description = "The CIDR block of the VPC Hub"
}
