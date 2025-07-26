# Observability stack DNS name and OTLP ports
output "otlp_dns" {
  description = "OTLP DNS name for sending telemetry to the observability cluster"
  value       = aws_lb.observability.dns_name
}

output "otlp_http_port" {
  description = "OTLP HTTP port number for sending telemetry to the observability cluster"
  value       = module.otel_collector.http_port
}
