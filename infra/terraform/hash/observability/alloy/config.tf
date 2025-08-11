# Grafana Alloy configuration management

# Upload Alloy configuration to S3
resource "aws_s3_object" "alloy_config" {
  bucket = var.config_bucket.id
  key    = "alloy/config.alloy"

  # Grafana Alloy configuration
  content = templatefile("${path.module}/templates/alloy-config.alloy.tpl", {
    region          = var.region
    mimir_http_dns  = var.mimir_http_dns
    mimir_http_port = var.mimir_http_port
  })

  content_type = "text/plain"

  tags = {
    Purpose = "Grafana Alloy CloudWatch Configuration"
    Service = "alloy"
  }
}
