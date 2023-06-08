variable "env" {
  type        = string
  description = "The environment, defaults to the selected workspace."
}

variable "region" {
  type        = string
  description = "The AWS region"
}

variable "vpc" {
  description = "The VPC to deploy the components within"
}

variable "prefix" {
  type        = string
  description = "The prefix to use for resource names, includes region and env"
}

variable "param_prefix" {
  type        = string
  description = "The prefix of the SSM parameters to create"
}

variable "subnets" {
  type        = list(string)
  description = "The list of subnet IDs that the instance should have attached"
}

variable "cpu" {
  type        = number
  description = "API service Fargate CPU units"

  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.cpu)
    error_message = "Invalid API CPU allocation. See https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html#w380aac44c17c17"
  }
}

variable "memory" {
  type        = number
  description = "API service Fargate memory (MB). See https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html#w380aac44c17c17"
}

variable "graph_image" {
  type = object({
    url     = string
    ecr_arn = optional(string)
  })
  description = "URL of the docker image for the Graph service"
}

variable "graph_env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))
  description = "A list of environment variables to save as system parameters and inject into the Graph service"
}

variable "type_fetcher_image" {
  type = object({
    url     = string
    ecr_arn = optional(string)
  })
  description = "URL of the docker image for the type fetcher service"
}

variable "type_fetcher_env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))
  description = "A list of environment variables to save as system parameters and inject into the type fetcher service"
}

variable "kratos_image" {
  type = object({
    url     = string
    ecr_arn = optional(string)
  })
  description = "URL of the docker image for the Kratos service"
}

variable "kratos_env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))
  description = "A list of environment variables to save as system parameters and inject into Kratos"
}


variable "api_image" {
  type = object({
    url     = string
    ecr_arn = optional(string)
  })
  description = "URL of the docker image for the API service"
}

variable "api_env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))
  description = "A list of environment variables to save as system parameters and inject into the API service"
}

variable "ses_verified_domain_identity" {
  type        = string
  description = "A verified AWS SES identity to use for email sending in the application."
}
