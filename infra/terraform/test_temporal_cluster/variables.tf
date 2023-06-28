variable "region" {
  type        = string
  description = "The AWS region"
}

variable "region_az_count" {
  type        = number
  description = "Number of availability zones to use for the infrastructure"
}

variable "in_ci" {
  type        = bool
  default     = false
  description = "Whether or not this is running in CI. If true, the AWS provider will be configured to use the default profile."
}

# variable "vault_kvv2_secret_path" {
#   type        = string
#   default     = "pipelines/hash/"
#   description = "The _root_ path where secrets are stored in Vault for this service. The secrets shall be called the same as the Terraform Workspace name."
# }
