# Tempo service outputs for Service Connect integration

output "otlp_grpc_port" {
  description = "OTLP gRPC port for traces (for otel_collector config)"
  value       = local.otlp_port
}

output "otlp_grpc_port_name" {
  description = "Service Connect port name for OTLP gRPC"
  value       = local.otlp_grpc_port_name
}

output "api_port" {
  description = "API port for Tempo queries (for Grafana)"
  value       = local.api_port
}

output "api_port_name" {
  description = "Service Connect port name for API"
  value       = local.api_port_name
}

# DNS names for Service Connect
output "otlp_grpc_dns" {
  description = "Service Connect DNS name for OTLP gRPC (for otel_collector config)"
  value       = local.otlp_grpc_port_dns
}

output "api_dns" {
  description = "Service Connect DNS name for API (for Grafana)"
  value       = local.api_port_dns
}
