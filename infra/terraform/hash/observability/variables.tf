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

variable "grafana_database_host" {
  type        = string
  description = "PostgreSQL database host for Grafana"
}

variable "grafana_database_port" {
  type        = number
  description = "PostgreSQL database port for Grafana"
}

variable "grafana_database_password" {
  type        = string
  sensitive   = true
  description = "PostgreSQL database password for Grafana user"
}

variable "grafana_secret_key" {
  type        = string
  sensitive   = true
  description = "Grafana secret key"
}

variable "vpc_zone_id" {
  type        = string
  description = "Route53 private hosted zone ID for services within the VPC"
}

variable "amazon_trust_ca_bundle" {
  type        = string
  description = "Amazon Trust Services CA Bundle for SSL verification"
}

variable "pagerduty_grafana_aws_integration_key" {
  type        = string
  description = "PagerDuty integration key for Grafana service"
}
