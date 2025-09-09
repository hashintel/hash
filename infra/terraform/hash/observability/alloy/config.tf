# Grafana Alloy configuration management

# Upload Alloy configuration to S3
resource "aws_s3_object" "alloy_config" {
  bucket = var.config_bucket.id
  key    = "alloy/config.alloy"

  # Grafana Alloy configuration
  content = templatefile("${path.module}/templates/alloy-config.alloy.tpl", {
    environment           = terraform.workspace
    region                = var.region
    profile_port_internal = local.profile_port_internal
    profile_port_external = local.profile_port_external
    mimir_http_dns        = var.mimir_http_dns
    mimir_http_port       = var.mimir_http_port
    pyroscope_http_dns    = var.pyroscope_http_dns
    pyroscope_http_port   = var.pyroscope_http_port

  })

  content_type = "text/plain"

  tags = {
    Purpose = "Grafana Alloy CloudWatch Configuration"
    Service = "alloy"
  }
}
