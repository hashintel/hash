# S3 bucket for Tempo trace storage
# Stores distributed tracing data with lifecycle management

resource "aws_s3_bucket" "tempo_traces" {
  bucket = "${var.prefix}-tempo-traces"
  tags = {
    Purpose = "Tempo distributed tracing storage"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tempo_traces" {
  bucket = aws_s3_bucket.tempo_traces.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tempo_traces" {
  bucket = aws_s3_bucket.tempo_traces.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "tempo_traces" {
  bucket = aws_s3_bucket.tempo_traces.id

  rule {
    id     = "tempo_traces_lifecycle"
    status = "Enabled"

    # Delete traces after 7 days to manage storage costs
    expiration {
      days = 7
    }

    # Clean up incomplete multipart uploads
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
