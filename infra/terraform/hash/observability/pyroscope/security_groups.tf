# Security group for Pyroscope

resource "aws_security_group" "pyroscope" {
  name_prefix = "${local.prefix}-"
  vpc_id      = var.vpc.id

  # Allow inbound HTTP API from OpenTelemetry Collector and Grafana
  ingress {
    from_port   = local.http_port
    to_port     = local.http_port
    protocol    = "tcp"
    description = "Pyroscope HTTP API for log ingestion and queries"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow inbound gRPC API for live tail streaming from Grafana
  ingress {
    from_port   = local.grpc_port
    to_port     = local.grpc_port
    protocol    = "tcp"
    description = "Pyroscope gRPC API for live tail streaming"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound HTTPS for S3 log storage and config download
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
    Purpose = "Pyroscope security group"
  }
}
