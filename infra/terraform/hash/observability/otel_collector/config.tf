# OpenTelemetry Collector configuration management

# Map Terraform workspace names to OpenTelemetry environment names
locals {
  environment_mapping = {
    "prod"  = "production"
    "stage" = "staging"
    "dev"   = "development"
  }
  
  # Use mapped environment name, fallback to workspace name if not in mapping
  otel_environment = lookup(local.environment_mapping, terraform.workspace, terraform.workspace)
}

# Upload OpenTelemetry Collector configuration generated from template
resource "aws_s3_object" "otel_collector_config" {
  bucket = var.config_bucket.id
  key    = "otelcol/config.yaml"

  # Generate config from template with environment-specific parameters
  content = templatefile("${path.module}/templates/otel-collector.yaml.tpl", {
    environment            = local.otel_environment
    batch_timeout          = "1s"
    batch_size             = 8192
    grpc_port_internal     = local.grpc_port_internal
    http_port_internal     = local.http_port_internal
    grpc_port_external     = local.grpc_port_external
    http_port_external     = local.http_port_external
    health_port            = local.health_port
    tempo_otlp_grpc_dns    = var.tempo_otlp_grpc_dns
    tempo_otlp_grpc_port   = var.tempo_otlp_grpc_port
    loki_http_dns          = var.loki_http_dns
    loki_http_port         = var.loki_http_port
  })

  content_type = "application/x-yaml"

  tags = {
    Purpose = "OpenTelemetry Collector Configuration"
    Service = "otel-collector"
  }
}
