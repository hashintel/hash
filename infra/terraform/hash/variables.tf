variable "region" {
  type        = string
  description = "The AWS region"
}

variable "region_az_count" {
  type        = number
  description = "Number of availability zones to use for the infrastructure"
}

variable "kratos_env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))
  description = "A list of environment variables to save as system parameters and inject into Kratos"
}

variable "hydra_env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))
  description = "A list of environment variables to save as system parameters and inject into Hydra"
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

variable "ses_verified_domain_identity" {
  type        = string
  default     = ""
  description = "A verified AWS SES identity to use for email sending in the application."
}

variable "in_ci" {
  type        = bool
  default     = false
  description = "Whether or not this is running in CI. If true, the AWS provider will be configured to use the default profile."
}

variable "vault_kvv2_secret_path" {
  type        = string
  default     = "pipelines/hash/"
  description = "The _root_ path where secrets are stored in Vault for this service. The secrets shall be called the same as the Terraform Workspace name."
}
