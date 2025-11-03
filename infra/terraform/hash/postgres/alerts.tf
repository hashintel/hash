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
  evaluation_periods  = 2                       # 10 minutes total
  datapoints_to_alarm = 2                       # Both datapoints must be low
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
  evaluation_periods  = 5   # 25 minutes total
  datapoints_to_alarm = 3   # 3 of 5 datapoints must be high (grace for spikes)
  threshold           = 80  # 80%
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"

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
  evaluation_periods  = 3                 # 15 minutes total
  datapoints_to_alarm = 2                 # 2 of 3 datapoints must be low (moderate grace)
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

# CloudWatch Alarm for RDS disk queue depth
resource "aws_cloudwatch_metric_alarm" "rds_disk_queue_depth_high" {
  alarm_name        = "${var.prefix}-rds-disk-queue-depth-high"
  alarm_description = "CRITICAL: RDS instance ${aws_db_instance.postgres.identifier} has high disk queue depth, indicating I/O bottleneck."

  # RDS I/O metrics
  metric_name         = "DiskQueueDepth"
  namespace           = "AWS/RDS"
  statistic           = "Average"
  period              = 300 # 5 minutes
  evaluation_periods  = 5   # 25 minutes total
  datapoints_to_alarm = 3   # 3 of 5 datapoints must be high (grace for I/O spikes)
  threshold           = 10  # operations
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }

  alarm_actions = [aws_sns_topic.database_alerts.arn]
  ok_actions    = [aws_sns_topic.database_alerts.arn]

  tags = {
    Name     = "${var.prefix}-rds-disk-queue-depth-high-alarm"
    Severity = "CRITICAL"
    Purpose  = "Alert when RDS disk queue depth indicates I/O contention"
  }
}

# CloudWatch Alarm for RDS read IOPS
resource "aws_cloudwatch_metric_alarm" "rds_read_iops_high" {
  alarm_name        = "${var.prefix}-rds-read-iops-high"
  alarm_description = "WARNING: RDS instance ${aws_db_instance.postgres.identifier} has high read IOPS."

  # RDS I/O metrics
  metric_name         = "ReadIOPS"
  namespace           = "AWS/RDS"
  statistic           = "Average"
  period              = 300 # 5 minutes
  evaluation_periods  = 5   # 25 minutes total
  datapoints_to_alarm = 3   # 3 of 5 datapoints must be high (grace for spikes)
  threshold           = 500 # IOPS
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }

  alarm_actions = [aws_sns_topic.database_alerts.arn]
  ok_actions    = [aws_sns_topic.database_alerts.arn]

  tags = {
    Name     = "${var.prefix}-rds-read-iops-high-alarm"
    Severity = "WARNING"
    Purpose  = "Alert when RDS read IOPS are consistently high"
  }
}

# CloudWatch Alarm for RDS write IOPS
resource "aws_cloudwatch_metric_alarm" "rds_write_iops_high" {
  alarm_name        = "${var.prefix}-rds-write-iops-high"
  alarm_description = "WARNING: RDS instance ${aws_db_instance.postgres.identifier} has high write IOPS."

  # RDS I/O metrics
  metric_name         = "WriteIOPS"
  namespace           = "AWS/RDS"
  statistic           = "Average"
  period              = 300 # 5 minutes
  evaluation_periods  = 5   # 25 minutes total
  datapoints_to_alarm = 3   # 3 of 5 datapoints must be high (grace for spikes)
  threshold           = 500 # IOPS
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }

  alarm_actions = [aws_sns_topic.database_alerts.arn]
  ok_actions    = [aws_sns_topic.database_alerts.arn]

  tags = {
    Name     = "${var.prefix}-rds-write-iops-high-alarm"
    Severity = "WARNING"
    Purpose  = "Alert when RDS write IOPS are consistently high"
  }
}

# CloudWatch Alarm for RDS database connections
resource "aws_cloudwatch_metric_alarm" "rds_database_connections_high" {
  alarm_name        = "${var.prefix}-rds-database-connections-high"
  alarm_description = "CRITICAL: RDS instance ${aws_db_instance.postgres.identifier} has high number of database connections. Max connections: ~225."

  # RDS connection metrics
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  statistic           = "Average"
  period              = 300 # 5 minutes
  evaluation_periods  = 3   # 15 minutes total
  datapoints_to_alarm = 2   # 2 of 3 datapoints must be high (moderate grace)
  threshold           = 180 # connections (~80% of max 225)
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }

  alarm_actions = [aws_sns_topic.database_alerts.arn]
  ok_actions    = [aws_sns_topic.database_alerts.arn]

  tags = {
    Name     = "${var.prefix}-rds-database-connections-high-alarm"
    Severity = "CRITICAL"
    Purpose  = "Alert when RDS database connections approach limit"
  }
}
