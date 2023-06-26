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
