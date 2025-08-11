# Grafana Alloy CloudWatch metrics receiver definition

locals {
  service_name = "alloy"
  prefix       = "${var.prefix}-${local.service_name}"

  # Port definitions for Alloy
  http_port = 5000  # Alloy HTTP API for metrics scraping
  
  # Port names for Service Connect
  http_port_name = "${local.service_name}-http"   # HTTP API
  
  # DNS names for Service Connect  
  http_port_dns = "${local.http_port_name}.${var.service_discovery_namespace_name}"
}
