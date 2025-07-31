# S3 buckets for Mimir metrics storage
# Stores metrics data with lifecycle management

# Main metrics blocks storage
resource "aws_s3_bucket" "mimir_blocks" {
  bucket = "${var.prefix}-mimir-blocks"
  tags = {
    Purpose = "Mimir metrics blocks storage"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "mimir_blocks" {
  bucket = aws_s3_bucket.mimir_blocks.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "mimir_blocks" {
  bucket = aws_s3_bucket.mimir_blocks.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "mimir_blocks" {
  bucket = aws_s3_bucket.mimir_blocks.id

  rule {
    id     = "mimir_blocks_lifecycle"
    status = "Enabled"

    expiration {
      days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket" "mimir_alertmanager" {
  bucket = "${var.prefix}-mimir-alertmanager"
  tags = {
    Purpose = "Mimir alertmanager storage"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "mimir_alertmanager" {
  bucket = aws_s3_bucket.mimir_alertmanager.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "mimir_alertmanager" {
  bucket = aws_s3_bucket.mimir_alertmanager.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "mimir_ruler" {
  bucket = "${var.prefix}-mimir-ruler"
  tags = {
    Purpose = "Mimir ruler storage"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "mimir_ruler" {
  bucket = aws_s3_bucket.mimir_ruler.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "mimir_ruler" {
  bucket = aws_s3_bucket.mimir_ruler.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
