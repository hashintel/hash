# Observability stack DNS name and OTLP ports

output "otel_otlp_endpoint" {
  description = "OTLP HTTPS DNS name for sending telemetry via internal domain"
  value       = aws_route53_record.otlp.fqdn
}
