# Loki service definition

locals {
  service_name = "loki"
  prefix       = "${var.prefix}-${local.service_name}"

  # Port definitions for Loki
  http_port = 3100 # Loki HTTP API for log ingestion and queries
  grpc_port = 9096 # Loki gRPC API for live tail streaming

  # Port names for Service Connect
  http_port_name = "${local.service_name}-http" # HTTP API
  grpc_port_name = "${local.service_name}-grpc" # gRPC API

  # DNS names for Service Connect
  http_port_dns = "${local.http_port_name}.${var.service_discovery_namespace_name}"
  grpc_port_dns = "${local.grpc_port_name}.${var.service_discovery_namespace_name}"
}
