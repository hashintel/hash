# CloudWatch Log Group for all observability services
# Shared by otel_collector, tempo, loki, prometheus, grafana

resource "aws_cloudwatch_log_group" "observability" {
  name              = "/ecs/${var.prefix}"
  retention_in_days = 7

  tags = {
    Purpose = "Observability services logs"
  }
}
