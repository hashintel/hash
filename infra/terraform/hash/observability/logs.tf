# CloudWatch Log Group for all observability services
# Shared by otel_collector, tempo, loki, prometheus, grafana

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# KMS key for CloudWatch Log Group encryption
resource "aws_kms_key" "log_group" {
  description             = "KMS key for observability CloudWatch log group encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableIAMUserPermissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${data.aws_region.current.name}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          ArnEquals = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.prefix}"
          }
        }
      }
    ]
  })

  tags = {
    Purpose = "CloudWatch log group encryption for observability cluster"
  }
}

resource "aws_kms_alias" "log_group" {
  name          = "alias/${var.prefix}-logs"
  target_key_id = aws_kms_key.log_group.key_id
}

resource "aws_cloudwatch_log_group" "observability" {
  name              = "/ecs/${var.prefix}"
  retention_in_days = 7
  kms_key_id        = aws_kms_key.log_group.arn

  tags = {
    Purpose = "Observability services logs"
  }
}
