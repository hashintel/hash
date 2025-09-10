# Grafana Alloy CloudWatch metrics receiver definition

locals {
  service_name = "alloy"
  prefix       = "${var.prefix}-${local.service_name}"

  # Port definitions for Alloy
  http_port             = 5000 # Alloy HTTP API for metrics scraping
  profile_port_internal = 4040
  profile_port_external = 4042

  # Port names for Service Connect
  http_port_name    = "${local.service_name}-http" # HTTP API
  profile_port_name = "${local.service_name}-profile"

  # DNS names for Service Connect
  http_port_dns    = "${local.http_port_name}.${var.service_discovery_namespace_name}"
  profile_port_dns = "${local.profile_port_name}.${var.service_discovery_namespace_name}"
}
