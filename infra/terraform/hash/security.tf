# AWS GuardDuty configuration
# Provides threat detection and continuous security monitoring

resource "aws_guardduty_detector" "main" {
  enable = true

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }

  tags = {
    Name    = "${local.prefix}-guardduty-detector"
    Service = "security"
    Purpose = "Threat detection and intrusion monitoring"
  }
}

# SNS Topic for GuardDuty findings
resource "aws_sns_topic" "guardduty_findings" {
  name = "${local.prefix}-guardduty-findings"

  tags = {
    Name    = "${local.prefix}-guardduty-findings"
    Service = "security"
    Purpose = "GuardDuty findings notifications"
  }
}

# PagerDuty subscription for GuardDuty findings
resource "aws_sns_topic_subscription" "guardduty_pagerduty" {
  topic_arn = aws_sns_topic.guardduty_findings.arn
  protocol  = "https"
  endpoint  = "https://events.pagerduty.com/integration/${sensitive(data.vault_kv_secret_v2.secrets.data["pagerduty_infrastructure_security_aws_integration_key"])}/enqueue"
}

# EventBridge rule to capture GuardDuty findings
resource "aws_cloudwatch_event_rule" "guardduty_findings" {
  name        = "${local.prefix}-guardduty-findings"
  description = "Capture all GuardDuty findings"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
  })

  tags = {
    Name    = "${local.prefix}-guardduty-findings-rule"
    Service = "security"
    Purpose = "Route GuardDuty findings to SNS"
  }
}

# EventBridge target to send findings to SNS
resource "aws_cloudwatch_event_target" "guardduty_sns" {
  rule      = aws_cloudwatch_event_rule.guardduty_findings.name
  target_id = "SendToSNS"
  arn       = aws_sns_topic.guardduty_findings.arn
}

# SNS topic policy to allow EventBridge to publish
resource "aws_sns_topic_policy" "guardduty_findings" {
  arn = aws_sns_topic.guardduty_findings.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgeToPublish"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.guardduty_findings.arn
      }
    ]
  })
}
