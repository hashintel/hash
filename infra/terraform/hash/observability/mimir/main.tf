# Mimir service definition

locals {
  service_name = "mimir"
  prefix       = "${var.prefix}-${local.service_name}"

  # Port definitions for Mimir
  http_port = 8080 # Mimir HTTP API for metrics ingestion and queries
  grpc_port = 9095 # Mimir gRPC API for internal communication

  # Port names for Service Connect
  http_port_name = "${local.service_name}-http" # HTTP API
  grpc_port_name = "${local.service_name}-grpc" # gRPC API

  # DNS names for Service Connect
  http_port_dns = "${local.http_port_name}.${var.service_discovery_namespace_name}"
  grpc_port_dns = "${local.grpc_port_name}.${var.service_discovery_namespace_name}"
}
