# CloudWatch Log Group for all observability services
# Shared by otel_collector, tempo, loki, prometheus, grafana

# KMS key for CloudWatch Log Group encryption
resource "aws_kms_key" "log_group" {
  description             = "KMS key for observability CloudWatch log group encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

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
