variable "region" {
  type        = string
  description = "The AWS region"
}

variable "region_az_count" {
  type        = number
  description = "Number of availability zones to use for the infrastructure"
}

variable "kratos_secrets_cookie" {
  type        = string
  description = "Kratos cookie secret"
}

variable "kratos_secrets_cipher" {
  type        = string
  description = "Kratos cookie cipher"
}

variable "kratos_api_key" {
  type        = string
  description = "Kratos webhook api key"
}

variable "kratos_env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))
  description = "A list of environment variables to save as system parameters and inject into Kratos"
}

variable "hash_graph_env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))
  description = "A list of environment variables to save as system parameters and inject into the Graph service"
}

variable "hash_api_env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))
  description = "A list of environment variables to save as system parameters and inject into the API service"
}

variable "hash_seed_users" {
  type        = any
  description = "List of users to seed"
}

variable "hash_system_user_password" {
  type        = string
  description = "Password to give the system user in HASH"
}

variable "hash_block_protocol_api_key" {
  type        = string
  description = "API key to fetch blocks from the BP Hub"
}

variable "pg_superuser_password" {
  type        = string
  sensitive   = true
  description = "Password for the 'superuser' user in the Postgres instance"
}

variable "pg_kratos_user_password" {
  type        = object({ hash = string, raw = string })
  sensitive   = true
  description = "Hashed form of the 'kratos' user Postgres password."
}

variable "pg_graph_user_password" {
  type        = object({ hash = string, raw = string })
  sensitive   = true
  description = "Hashed form of the 'graph' user Postgres password."
}

variable "ses_verified_domain_identity" {
  type        = string
  default     = ""
  description = "A verified AWS SES identity to use for email sending in the application."
}
