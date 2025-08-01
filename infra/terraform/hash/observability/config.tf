# S3 bucket for observability service configurations
# Shared by all observability services (otel_collector, tempo, loki, mimir, grafana)

resource "aws_s3_bucket" "configs" {
  bucket = "${var.prefix}-configs"
  tags = {
    Purpose = "Observability service configurations"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "configs" {
  bucket = aws_s3_bucket.configs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "configs" {
  bucket = aws_s3_bucket.configs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
