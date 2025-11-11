# CloudWatch backup alerting for Grafana service health
# This provides independent alerting when Grafana itself is down
# Uses shared critical alerts SNS topic with Lambda transformer


resource "aws_sns_topic" "grafana_alerts" {
  name = "${var.prefix}-grafana-alerts"

  tags = {
    Name    = "${var.prefix}-grafana-alerts"
    Service = "grafana"
    Purpose = "Grafana service health alerts"
  }
}

# PagerDuty subscription
resource "aws_sns_topic_subscription" "pagerduty" {
  topic_arn = aws_sns_topic.grafana_alerts.arn
  protocol  = "https"
  endpoint  = "https://events.pagerduty.com/integration/${var.pagerduty_grafana_aws_integration_key}/enqueue"
}


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

  alarm_actions = [aws_sns_topic.grafana_alerts.arn]
  ok_actions    = [aws_sns_topic.grafana_alerts.arn]

  tags = {
    Name     = "${var.prefix}-grafana-service-down-alarm"
    Severity = "CRITICAL"
    Purpose  = "Backup alerting for monitoring infrastructure failure"
  }
}
