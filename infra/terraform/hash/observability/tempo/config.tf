# Tempo configuration management

# Upload Tempo configuration generated from template
resource "aws_s3_object" "tempo_config" {
  bucket = var.config_bucket.id
  key    = "tempo/config.yaml"

  # Generate config from template with environment-specific parameters
  content = templatefile("${path.module}/templates/tempo.yaml.tpl", {
    environment     = terraform.workspace
    api_port        = local.api_port
    otlp_port       = local.otlp_port
    tempo_bucket    = aws_s3_bucket.tempo_traces.bucket
    aws_region      = var.region
    mimir_http_dns  = var.mimir_http_dns
    mimir_http_port = var.mimir_http_port
  })

  content_type = "application/x-yaml"

  tags = {
    Purpose = "Tempo Configuration"
    Service = "tempo"
  }
}
