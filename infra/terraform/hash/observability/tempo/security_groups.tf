# Security group for Tempo

resource "aws_security_group" "tempo" {
  name_prefix = "${local.prefix}-"
  vpc_id      = var.vpc.id

  # Allow inbound OTLP gRPC traces from OpenTelemetry Collector
  ingress {
    from_port   = local.otlp_port
    to_port     = local.otlp_port
    protocol    = "tcp"
    description = "Tempo OTLP gRPC receiver for traces"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow inbound API queries from Grafana
  ingress {
    from_port   = local.api_port
    to_port     = local.api_port
    protocol    = "tcp"
    description = "Tempo API for Grafana queries"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound HTTPS for S3 trace storage and config download
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "HTTPS for S3 access"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow outbound HTTP for package downloads during SSL setup
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    description = "HTTP outbound for package downloads"
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

  tags = {
    Name    = "${local.prefix}-sg"
    Purpose = "Tempo security group"
  }
}
