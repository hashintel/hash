# Service ports for parent module to use in load balancer configuration

output "grpc_port" {
  description = "gRPC port for OpenTelemetry Collector"
  value       = local.grpc_port
}

output "http_port" {
  description = "HTTP port for OpenTelemetry Collector"
  value       = local.http_port
}

output "health_port" {
  description = "Health check port for OpenTelemetry Collector"
  value       = local.health_port
}

# Port names for Service Connect
output "grpc_port_name" {
  description = "Service Connect port name for gRPC"
  value       = local.grpc_port_name
}

output "http_port_name" {
  description = "Service Connect port name for HTTP"
  value       = local.http_port_name
}

output "health_port_name" {
  description = "Service Connect port name for health check"
  value       = local.health_port_name
}

# Target groups for load balancer attachment
output "http_target_group_arn" {
  description = "HTTP target group ARN"
  value       = aws_lb_target_group.http.arn
}

output "grpc_target_group_arn" {
  description = "gRPC target group ARN"
  value       = aws_lb_target_group.grpc.arn
}

