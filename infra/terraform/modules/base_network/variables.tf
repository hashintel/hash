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

# We have disabled flow logs for all infra that uses the base_network module
# to reenable flow logs, set this variable default to true and bump any consuming modules.
variable "enable_flow_logs" {
  type        = bool
  description = "Enable VPC flow logs"
  default     = false
}
