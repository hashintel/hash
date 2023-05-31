variable "region" {
  type        = string
  description = "The AWS region"
}

variable "prefix" {
  type        = string
  description = "The prefix to use for resource names, includes region and env"
}

variable "region_az_names" {
  type        = list(string)
  description = "The availability zones to setup the VPC for"
}
