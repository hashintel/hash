
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

variable "pg_host" {
  type        = string
  description = "Postgres hostname"
}

variable "pg_port" {
  type        = number
  description = "Postgres connection port"
}

variable "pg_database" {
  type        = string
  description = "Postgres database name"
}

variable "pg_user" {
  type        = string
  description = "Postgres user to connect as"
}

variable "pg_password" {
  type        = string
  description = "Postgres user password"
  sensitive   = true
}

variable "image_tag" {
  type        = string
  description = "Tag of the API Docker image to deploy"
}

