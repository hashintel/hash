# OpenTelemetry Collector configuration management

# Upload OpenTelemetry Collector configuration generated from template
resource "aws_s3_object" "otel_collector_config" {
  bucket = var.config_bucket.id
  key    = "otelcol/config.yaml"

  # Generate config from template with environment-specific parameters
  content = templatefile("${path.module}/templates/otel-collector.yaml.tpl", {
    environment     = terraform.workspace
    debug_verbosity = terraform.workspace == "prod" ? "basic" : "normal"
    batch_timeout   = "1s"
    batch_size      = 8192
    grpc_port       = local.grpc_port
    http_port       = local.http_port
    health_port     = local.health_port
  })

  content_type = "application/x-yaml"

  tags = {
    Purpose = "OpenTelemetry Collector Configuration"
    Service = "otel-collector"
  }
}
