output "http_port" {
  description = "Port number for Grafana Alloy HTTP API"
  value       = local.http_port
}

output "http_port_name" {
  description = "Port name for Service Connect"
  value       = local.http_port_name
}

output "http_port_dns" {
  description = "Service Connect DNS name for Grafana Alloy metrics endpoint"
  value       = local.http_port_dns
}
