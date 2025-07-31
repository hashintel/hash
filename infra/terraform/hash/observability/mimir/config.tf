# Mimir configuration management

# Configuration hash for task definition versioning
locals {
  config_hash = sha256(jsonencode({
    mimir_config = aws_s3_object.mimir_config.content
  }))
}

resource "aws_s3_object" "mimir_config" {
  bucket = var.config_bucket.id
  key    = "mimir/config.yaml"

  # Generate config from template with environment-specific parameters
  content = templatefile("${path.module}/templates/mimir.yaml.tpl", {
    http_port                 = local.http_port
    grpc_port                 = local.grpc_port
    mimir_blocks_bucket       = aws_s3_bucket.mimir_blocks.bucket
    mimir_alertmanager_bucket = aws_s3_bucket.mimir_alertmanager.bucket
    mimir_ruler_bucket        = aws_s3_bucket.mimir_ruler.bucket
    aws_region                = var.region
  })

  content_type = "application/x-yaml"

  tags = {
    Purpose = "Mimir Configuration"
    Service = "mimir"
  }
}
