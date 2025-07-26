# Tempo service definition

locals {
  service_name = "tempo"
  prefix       = "${var.prefix}-${local.service_name}"

  # Port definitions for Tempo
  api_port      = 3200  # Tempo API for Grafana queries
  otlp_port     = 4317  # OTLP gRPC receiver for traces
  
  # Port names for Service Connect
  api_port_name       = "${local.service_name}-api"
  otlp_grpc_port_name = "${local.service_name}-otlp-grpc"
  
  # DNS names for Service Connect
  api_port_dns       = "${local.api_port_name}.${var.service_discovery_namespace_name}"
  otlp_grpc_port_dns = "${local.otlp_grpc_port_name}.${var.service_discovery_namespace_name}"
}
