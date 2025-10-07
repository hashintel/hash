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

variable "service_discovery_namespace_arn" {
  type        = string
  description = "ARN of the service discovery namespace for Service Connect"
}

variable "service_discovery_namespace_name" {
  type        = string
  description = "Name of the service discovery namespace for Service Connect"
}

variable "tempo_api_dns" {
  type        = string
  description = "Tempo API DNS name for metrics scraping"
}

variable "tempo_api_port" {
  type        = number
  description = "Tempo API port number"
}

variable "tempo_otlp_grpc_dns" {
  type        = string
  description = "Tempo OTLP gRPC DNS name for trace forwarding"
}

variable "tempo_otlp_grpc_port" {
  type        = number
  description = "Tempo OTLP gRPC port number"
}

variable "loki_http_dns" {
  type        = string
  description = "Loki HTTP API DNS name for log forwarding"
}

variable "loki_http_port" {
  type        = number
  description = "Loki HTTP API port number"
}

variable "mimir_http_dns" {
  type        = string
  description = "Mimir HTTP API DNS name for metrics forwarding"
}

variable "mimir_http_port" {
  type        = number
  description = "Mimir HTTP API port number"
}

variable "pyroscope_http_dns" {
  type        = string
  description = "Pyroscope HTTP API DNS name for metrics forwarding"
}

variable "pyroscope_http_port" {
  type        = number
  description = "Pyroscope HTTP API port number"
}

variable "ssl_config" {
  description = "Shared SSL configuration for container certificates"
}

variable "grafana_dns" {
  type        = string
  description = "Grafana service DNS name for metrics scraping"
}

variable "grafana_port" {
  type        = number
  description = "Grafana service port number"
}

variable "alloy_dns" {
  type        = string
  description = "Grafana Alloy DNS name for metrics scraping"
}

variable "alloy_port" {
  type        = number
  description = "Grafana Alloy port number"
}
