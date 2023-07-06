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
  description = "The prefix for Param store"
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

variable "worker_name" {
  description = "Name of the worker"

  validation {
    condition     = can(regex("[a-z]+", var.worker_name))
    error_message = "Must be a lowercase non-empty string"
  }
}

variable "cluster_arn" {
  type        = string
  description = "The ECS Cluster ARN"
}

variable "temporal_host" {
  type        = string
  description = "The hostname of the Temporal cluster to connect to."
}

variable "temporal_port" {
  type        = string
  default     = "7233"
  description = "The port of the Temporal cluster to connect to."
}

variable "ecs_health_check" {
  type        = list(string)
  description = "The ECS Task Definition Health Check command for the image."
}

variable "env_vars" {
  type = list(object({
    name   = string,
    secret = bool,
    value  = string
  }))

  default     = []
  description = "The environment variables and secrets to pass to the container"
}

variable "desired_count" {
  type        = number
  default     = 1
  description = "The number of instances of the task to run"
}
