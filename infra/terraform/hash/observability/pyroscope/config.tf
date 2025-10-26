# Pyroscope configuration management

# Upload Pyroscope configuration generated from template
resource "aws_s3_object" "pyroscope_config" {
  bucket = var.config_bucket.id
  key    = "pyroscope/config.yaml"

  # Generate config from template with environment-specific parameters
  content = templatefile("${path.module}/templates/pyroscope.yaml.tpl", {
    environment      = terraform.workspace
    http_port        = local.http_port
    grpc_port        = local.grpc_port
    pyroscope_bucket = aws_s3_bucket.pyroscope_profiles.bucket
    aws_region       = var.region
  })

  content_type = "application/x-yaml"

  tags = {
    Purpose = "Pyroscope Configuration"
    Service = "pyroscope"
  }
}
