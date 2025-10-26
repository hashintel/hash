output "http_port" {
  description = "Port number for Grafana Alloy HTTP API"
  value       = local.http_port
}
output "profile_port_internal" {
  description = "Port number for Grafana Alloy Profile API"
  value       = local.profile_port_internal
}

output "profile_port_external" {
  description = "Port number for Grafana Alloy Profile API"
  value       = local.profile_port_external
}
output "http_port_name" {
  description = "Port name for Service Connect"
  value       = local.http_port_name
}

output "http_port_dns" {
  description = "Service Connect DNS name for Grafana Alloy metrics endpoint"
  value       = local.http_port_dns
}

# Target groups for load balancer attachment

# Internal target groups (service-to-service communication)
output "profile_internal_target_group_arn" {
  description = "Internal profile target group ARN"
  value       = aws_lb_target_group.profile_internal.arn
}

# External target groups (client applications)
output "profile_external_target_group_arn" {
  description = "External profile target group ARN"
  value       = aws_lb_target_group.profile_external.arn
}
