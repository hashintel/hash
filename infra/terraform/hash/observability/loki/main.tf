# Loki service definition

locals {
  service_name = "loki"
  prefix       = "${var.prefix}-${local.service_name}"

  # Port definitions for Loki
  api_port      = 3100  # Loki HTTP API for log ingestion and queries
  
  # Port names for Service Connect
  api_port_name = "${local.service_name}-api"
  
  # DNS names for Service Connect
  api_port_dns = "${local.api_port_name}.${var.service_discovery_namespace_name}"
}