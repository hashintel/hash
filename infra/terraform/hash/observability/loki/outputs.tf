# Loki service outputs for Service Connect integration

output "http_port" {
  description = "HTTP API port for Loki log ingestion and queries"
  value       = local.http_port
}

output "http_port_name" {
  description = "Service Connect port name for HTTP API"
  value       = local.http_port_name
}

output "grpc_port" {
  description = "gRPC API port for Loki live tail streaming"
  value       = local.grpc_port
}

output "grpc_port_name" {
  description = "Service Connect port name for gRPC API"
  value       = local.grpc_port_name
}

# DNS names for Service Connect
output "http_dns" {
  description = "Service Connect DNS name for HTTP API (for OTel collector and Grafana)"
  value       = local.http_port_dns
}

output "grpc_dns" {
  description = "Service Connect DNS name for gRPC API (for live tail streaming)"
  value       = local.grpc_port_dns
}