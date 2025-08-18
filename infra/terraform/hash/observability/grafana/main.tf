# Grafana ECS service for distributed tracing visualization
# Integrates with Tempo for trace data and PostgreSQL for configuration storage

locals {
  service_name = "grafana"
  prefix       = "${var.prefix}-${local.service_name}"

  grafana_port      = 3000
  grafana_port_name = "${local.service_name}-http"
  grafana_dns       = "${local.grafana_port_name}.${var.service_discovery_namespace_name}"
}
