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

variable "temporal_version" {
  type        = string
  description = "Docker container tag for temporal containers"
}

variable "temporal_ui_version" {
  type        = string
  description = "Docker container tag for temporal UI container"
}

variable "postgres_host" {
  type        = string
  description = "The hostname of the postgres database"
}

variable "postgres_port" {
  type        = number
  description = "The port of the postgres database"
}

variable "postgres_db" {
  type        = string
  description = "The name of the postgres database"
}

variable "postgres_visibility_db" {
  type        = string
  description = "The name of the postgres visibility database"
}

variable "postgres_user" {
  type        = string
  description = "The username for the postgres database"
}

variable "postgres_password" {
  type        = string
  description = "The password for the postgres database"
}

variable "postgres_superuser" {
  type        = string
  description = "The username for the postgres superuser"
}

variable "postgres_superuser_password" {
  type        = string
  description = "The password for the postgres superuser"
}
