variable "prefix" {
  type        = string
  description = "The prefix to use for resource names"
}

variable "cluster_arn" {
  type        = string
  description = "ARN of the ECS cluster to deploy to"
}

variable "vpc" {
  description = "The VPC to deploy the components within"
}

variable "subnets" {
  type        = list(string)
  description = "List of subnet IDs for the ECS service"
}

variable "config_bucket" {
  description = "S3 bucket for configuration files"
}

variable "log_group_name" {
  type        = string
  description = "CloudWatch log group name for container logs"
}

variable "region" {
  type        = string
  description = "AWS region"
}

variable "root_url" {
  type        = string
  description = "Public DNS name for Grafana"
}

variable "service_discovery_namespace_arn" {
  type        = string
  description = "ARN of the service discovery namespace for Service Connect"
}

variable "service_discovery_namespace_name" {
  type        = string
  description = "Name of the service discovery namespace for DNS resolution"
}

variable "grafana_database_host" {
  type        = string
  description = "PostgreSQL database host"
}

variable "grafana_database_port" {
  type        = number
  description = "PostgreSQL database port"
}

variable "grafana_database_password" {
  type        = string
  sensitive   = true
  description = "PostgreSQL database password for grafana user"
}

variable "grafana_secret_key" {
  type        = string
  sensitive   = true
  description = "Grafana secret key"
}

variable "tempo_api_dns" {
  type        = string
  description = "DNS name for Tempo API service"
}

variable "tempo_api_port" {
  type        = number
  description = "Port for Tempo API service"
}

variable "loki_http_dns" {
  type        = string
  description = "DNS name for Loki HTTP API service"
}

variable "loki_http_port" {
  type        = number
  description = "Port for Loki HTTP API service"
}

variable "ssl_config" {
  description = "Shared SSL configuration for container certificates"
}
