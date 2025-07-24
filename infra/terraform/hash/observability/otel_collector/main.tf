# OpenTelemetry Collector service definition

locals {
  service_name = "otel-collector"
  prefix       = "${var.prefix}-${local.service_name}"

  # Port definitions for OpenTelemetry Collector
  grpc_port   = 4317
  http_port   = 4318
  health_port = 13133
  
  # Port names for Service Connect
  grpc_port_name   = "${local.service_name}-grpc"
  http_port_name   = "${local.service_name}-http"
  health_port_name = "${local.service_name}-health"
}
