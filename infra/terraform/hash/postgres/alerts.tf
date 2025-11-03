# CloudWatch alerts for RDS database monitoring
# Provides alerting for critical database metrics

# SNS Topic for database alerts
resource "aws_sns_topic" "database_alerts" {
  name = "${var.prefix}-database-alerts"

  tags = {
    Name    = "${var.prefix}-database-alerts"
    Service = "postgres"
    Purpose = "RDS database health and performance alerts"
  }
}

# PagerDuty subscription for database alerts
resource "aws_sns_topic_subscription" "pagerduty" {
  topic_arn = aws_sns_topic.database_alerts.arn
  protocol  = "https"
  endpoint  = "https://events.pagerduty.com/integration/${var.pagerduty_main_database_aws_integration_key}/enqueue"
}

# CloudWatch Alarm for RDS free storage space
resource "aws_cloudwatch_metric_alarm" "rds_free_storage_space" {
  alarm_name        = "${var.prefix}-rds-free-storage-space-low"
  alarm_description = "CRITICAL: RDS instance ${aws_db_instance.postgres.identifier} has low free storage space. Storage: ${aws_db_instance.postgres.allocated_storage}GB total."

  # RDS storage metrics
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  statistic           = "Minimum"
  period              = 300                     # 5 minutes
  evaluation_periods  = 2                       # Must be low for 10 minutes total
  threshold           = 10 * 1024 * 1024 * 1024 # 10GB in bytes
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }

  alarm_actions = [aws_sns_topic.database_alerts.arn]
  ok_actions    = [aws_sns_topic.database_alerts.arn]

  tags = {
    Name     = "${var.prefix}-rds-free-storage-space-low-alarm"
    Severity = "CRITICAL"
    Purpose  = "Alert when RDS free storage space is critically low"
  }
}

# CloudWatch Alarm for RDS CPU utilization
resource "aws_cloudwatch_metric_alarm" "rds_cpu_utilization_high" {
  alarm_name        = "${var.prefix}-rds-cpu-utilization-high"
  alarm_description = "WARNING: RDS instance ${aws_db_instance.postgres.identifier} has high CPU utilization."

  # RDS CPU metrics
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  statistic           = "Average"
  period              = 300 # 5 minutes
  evaluation_periods  = 2   # Must be high for 10 minutes total
  threshold           = 80  # 80%
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }

  alarm_actions = [aws_sns_topic.database_alerts.arn]
  ok_actions    = [aws_sns_topic.database_alerts.arn]

  tags = {
    Name     = "${var.prefix}-rds-cpu-utilization-high-alarm"
    Severity = "WARNING"
    Purpose  = "Alert when RDS CPU utilization is consistently high"
  }
}

# CloudWatch Alarm for RDS freeable memory
resource "aws_cloudwatch_metric_alarm" "rds_freeable_memory_low" {
  alarm_name        = "${var.prefix}-rds-freeable-memory-low"
  alarm_description = "CRITICAL: RDS instance ${aws_db_instance.postgres.identifier} has low freeable memory."

  # RDS memory metrics
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  statistic           = "Minimum"
  period              = 300               # 5 minutes
  evaluation_periods  = 2                 # Must be low for 10 minutes total
  threshold           = 256 * 1024 * 1024 # 256MB in bytes
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }

  alarm_actions = [aws_sns_topic.database_alerts.arn]
  ok_actions    = [aws_sns_topic.database_alerts.arn]

  tags = {
    Name     = "${var.prefix}-rds-freeable-memory-low-alarm"
    Severity = "CRITICAL"
    Purpose  = "Alert when RDS freeable memory is critically low"
  }
}
