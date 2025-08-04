# OpenTelemetry Collector service definition

locals {
  service_name = "otel-collector"
  prefix       = "${var.prefix}-${local.service_name}"

  # Port definitions for OpenTelemetry Collector
  # Internal ports for service-to-service communication (Tempo, etc.)
  grpc_port_internal = 4317
  http_port_internal = 4318
  health_port        = 13133

  # External ports for client applications sending traces/metrics
  grpc_port_external = 4319
  http_port_external = 4320

  # Port names for Service Connect (internal communication only)
  grpc_port_name_internal = "${local.service_name}-grpc-internal"
  http_port_name_internal = "${local.service_name}-http-internal"
}
