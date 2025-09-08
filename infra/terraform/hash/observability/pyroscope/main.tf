# Loki service definition

locals {
  service_name = "pyroscope"
  prefix       = "${var.prefix}-${local.service_name}"

  # Port definitions for Pyroscope
  http_port = 4040 # Pyroscope HTTP
  grpc_port = 4041 # Pyroscope gRPC

  # Port names for Service Connect
  http_port_name = "${local.service_name}-http" # HTTP API
  grpc_port_name = "${local.service_name}-grpc" # gRPC API

  # DNS names for Service Connect
  http_port_dns = "${local.http_port_name}.${var.service_discovery_namespace_name}"
  grpc_port_dns = "${local.grpc_port_name}.${var.service_discovery_namespace_name}"
}
