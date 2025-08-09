# CloudWatch backup alerting for Grafana service health
# This provides independent alerting when Grafana itself is down
# Uses shared critical alerts SNS topic with Lambda transformer

# CloudWatch Alarm for Grafana ALB target health
resource "aws_cloudwatch_metric_alarm" "grafana_service_down" {
  alarm_name        = "${var.prefix}-grafana-service-down"
  alarm_description = "CRITICAL: Grafana has no healthy targets. All Grafana-based alerting is offline."

  # ALB Target Group metrics (much more reliable than ECS)
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  statistic           = "Average"
  period              = 60 # 1 minute
  evaluation_periods  = 3  # Must be down for 3 minutes total
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    TargetGroup  = aws_lb_target_group.grafana.arn_suffix
    LoadBalancer = var.external_load_balancer_arn_suffix
  }

  # Send to shared critical alerts topic (Lambda → Slack)
  alarm_actions = [var.critical_alerts_topic_arn]
  ok_actions    = [var.critical_alerts_topic_arn]

  tags = {
    Name     = "${var.prefix}-grafana-service-down-alarm"
    Severity = "CRITICAL"
    Purpose  = "Backup alerting for monitoring infrastructure failure"
  }
}
