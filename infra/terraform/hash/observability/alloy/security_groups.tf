# Security group for Grafana Alloy

resource "aws_security_group" "alloy" {
  name_prefix = "${local.prefix}-"
  vpc_id      = var.vpc.id

  # Allow inbound HTTP from OTEL Collector for metrics scraping
  ingress {
    from_port   = local.http_port
    to_port     = local.http_port
    protocol    = "tcp"
    description = "Grafana Alloy metrics endpoint"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow inbound HTTP for profile ingestion
  ingress {
    from_port   = local.profile_port_internal
    to_port     = local.profile_port_internal
    protocol    = "tcp"
    description = "Grafana Alloy profile ingestion endpoint"
    cidr_blocks = [var.vpc.cidr_block]
  }
  ingress {
    from_port   = local.profile_port_external
    to_port     = local.profile_port_external
    protocol    = "tcp"
    description = "Grafana Alloy profile ingestion endpoint"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound HTTPS for CloudWatch API calls and S3 config download
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "HTTPS for CloudWatch API and S3 access"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow outbound DNS
  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    description = "DNS resolution"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    description = "DNS resolution"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow outbound HTTP to Mimir for OTLP metrics forwarding
  egress {
    from_port   = var.mimir_http_port
    to_port     = var.mimir_http_port
    protocol    = "tcp"
    description = "HTTP to Mimir for OTLP metrics forwarding"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound HTTP to Pyroscope for profile forwarding
  egress {
    from_port   = var.pyroscope_http_port
    to_port     = var.pyroscope_http_port
    protocol    = "tcp"
    description = "HTTP to Pyroscope for profile forwarding"
    cidr_blocks = [var.vpc.cidr_block]
  }

  tags = {
    Name    = "${local.prefix}-sg"
    Purpose = "Grafana Alloy security group"
  }
}
