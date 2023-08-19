variable "region" {
  type        = string
  description = "The AWS region"

  # TODO: add more AWS regions to the condition
  validation {
    condition     = contains(["us-east-1"], var.region)
    error_message = "Invalid AWS region."
  }
}

variable "env" {
  type        = string
  description = "The environment: prod or staging"

  validation {
    condition     = contains(["prod", "staging"], var.env)
    error_message = "Environment must be 'prod' or 'staging'."
  }
}

variable "instance_type" {
  type        = string
  description = "The EC2 instance type to use for the database"
}
