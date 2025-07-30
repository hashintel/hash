# Loki service outputs for Service Connect integration

output "api_port" {
  description = "HTTP API port for Loki log ingestion and queries"
  value       = local.api_port
}

output "api_port_name" {
  description = "Service Connect port name for HTTP API"
  value       = local.api_port_name
}

# DNS names for Service Connect
output "api_dns" {
  description = "Service Connect DNS name for HTTP API (for OTel collector and Grafana)"
  value       = local.api_port_dns
}