variable "region" {
  type        = string
  description = "The AWS region"
}

variable "region_az_count" {
  type        = number
  description = "Number of availability zones to use for the infrastructure"
}
