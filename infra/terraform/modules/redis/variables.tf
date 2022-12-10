variable "prefix" {
  type        = string
  description = "The prefix to use for resource names, includes region and env"
}

variable "node_type" {
  type        = string
  description = "The EC2 node type to use for the Redis instance"
}

variable "subnet_ids" {
  type        = list(string)
  description = "The subnet to run the cache within"
}

variable "vpc_id" {
  type        = string
  description = "VPC id"
}

variable "vpc_cidr_block" {
  type        = string
  description = "VPC cidr block"
}

variable "region_az_names" {
  type        = list(string)
  description = "Availability zones to use for the multi-AZ redis cluster"
}
