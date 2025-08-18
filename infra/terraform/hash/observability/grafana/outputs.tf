output "target_group_arn" {
  description = "ARN of the Grafana target group"
  value       = aws_lb_target_group.grafana.arn
}

output "grafana_port" {
  description = "Port number for Grafana service"
  value       = local.grafana_port
}

output "grafana_port_name" {
  description = "Port name for Service Connect"
  value       = local.grafana_port_name
}

output "grafana_dns" {
  description = "Service Connect DNS name for Grafana metrics endpoint"
  value       = local.grafana_dns
}