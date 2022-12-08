variable "env" {
  type        = string
  description = "The environment, defaults to the selected workspace."
}

variable "region" {
  type        = string
  description = "The AWS region"
}

variable "vpc_id" {
  type        = string
  description = "The VPC to deploy the components within"
}

variable "vpc_cidr_block" {
  type        = string
  description = "VPC cidr block"
}

variable "prefix" {
  type        = string
  description = "The prefix to use for resource names, includes region and env"
}

variable "subnets" {
  type        = list(string)
  description = "The list of subnet IDs that the instance should have attached"
}

variable "pg_port" {
  type        = number
  description = "Postgres connection port"
  default     = 5432
}

variable "instance_class" {
  type        = string
  description = "The RDS instance class"
}

variable "pg_superuser_username" {
  type        = string
  description = "Username for the 'superuser' user in the Postgres instance"
  default     = "superuser"
}

variable "pg_superuser_password" {
  type        = string
  sensitive   = true
  description = "Password for the 'superuser' user in the Postgres instance"
}
