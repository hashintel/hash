# Loki configuration management

# Upload Loki configuration generated from template
resource "aws_s3_object" "loki_config" {
  bucket = var.config_bucket.id
  key    = "loki/config.yaml"

  # Generate config from template with environment-specific parameters
  content = templatefile("${path.module}/templates/loki.yaml.tpl", {
    environment = terraform.workspace
    api_port    = local.api_port
    loki_bucket = aws_s3_bucket.loki_logs.bucket
    aws_region  = var.region
  })

  content_type = "application/x-yaml"

  tags = {
    Purpose = "Loki Configuration"
    Service = "loki"
  }
}