# S3 bucket for Pyroscope log storage
# Stores profile data with lifecycle management

resource "aws_s3_bucket" "pyroscope_profiles" {
  bucket = "${var.prefix}-pyroscope-profiles"
  tags = {
    Purpose = "Pyroscope profile storage"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pyroscope_profiles" {
  bucket = aws_s3_bucket.pyroscope_profiles.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "pyroscope_profiles" {
  bucket = aws_s3_bucket.pyroscope_profiles.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "pyroscope_profiles" {
  bucket = aws_s3_bucket.pyroscope_profiles.id

  rule {
    id     = "pyroscope_profiles_lifecycle"
    status = "Enabled"

    # Delete profiles after 7 days to manage storage costs
    expiration {
      days = 7
    }

    # Clean up incomplete multipart uploads
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
