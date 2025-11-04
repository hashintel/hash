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
