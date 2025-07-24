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
  description = "List of subnet IDs for the ECS services"
}

