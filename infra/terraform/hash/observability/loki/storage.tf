# S3 bucket for Loki log storage
# Stores log data with lifecycle management

resource "aws_s3_bucket" "loki_logs" {
  bucket = "${var.prefix}-loki-logs"
  tags = {
    Purpose = "Loki log storage"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "loki_logs" {
  bucket = aws_s3_bucket.loki_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "loki_logs" {
  bucket = aws_s3_bucket.loki_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "loki_logs" {
  bucket = aws_s3_bucket.loki_logs.id

  rule {
    id     = "loki_logs_lifecycle"
    status = "Enabled"

    # Delete logs after 7 days to manage storage costs (same as Tempo)
    expiration {
      days = 7
    }

    # Clean up incomplete multipart uploads
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}