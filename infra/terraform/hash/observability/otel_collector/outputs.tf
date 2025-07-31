# Service ports for parent module to use in load balancer configuration

# Internal ports (service-to-service communication)
output "grpc_port_internal" {
  description = "Internal gRPC port for OpenTelemetry Collector"
  value       = local.grpc_port_internal
}

output "http_port_internal" {
  description = "Internal HTTP port for OpenTelemetry Collector"
  value       = local.http_port_internal
}

# External ports (client applications)
output "grpc_port_external" {
  description = "External gRPC port for OpenTelemetry Collector"
  value       = local.grpc_port_external
}

output "http_port_external" {
  description = "External HTTP port for OpenTelemetry Collector"
  value       = local.http_port_external
}

output "health_port" {
  description = "Health check port for OpenTelemetry Collector"
  value       = local.health_port
}

# Port names for Service Connect (internal only)
output "grpc_port_name_internal" {
  description = "Service Connect port name for internal gRPC"
  value       = local.grpc_port_name_internal
}

output "http_port_name_internal" {
  description = "Service Connect port name for internal HTTP"
  value       = local.http_port_name_internal
}

# Target groups for load balancer attachment

# Internal target groups (service-to-service communication)
output "http_internal_target_group_arn" {
  description = "Internal HTTP target group ARN"
  value       = aws_lb_target_group.http_internal.arn
}

# External target groups (client applications)
output "http_external_target_group_arn" {
  description = "External HTTP target group ARN"
  value       = aws_lb_target_group.http_external.arn
}

output "grpc_external_target_group_arn" {
  description = "External gRPC target group ARN"
  value       = aws_lb_target_group.grpc_external.arn
}
