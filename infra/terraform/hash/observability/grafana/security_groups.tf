# Security group for Grafana

resource "aws_security_group" "grafana" {
  name_prefix = "${local.prefix}-"
  vpc_id      = var.vpc.id

  # Allow inbound HTTP from ALB
  ingress {
    from_port   = local.grafana_port
    to_port     = local.grafana_port
    protocol    = "tcp"
    description = "Grafana HTTP from ALB"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound HTTPS for external resources (if needed)
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "HTTPS outbound"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow outbound HTTP for package downloads (SSL setup)
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    description = "HTTP outbound for package downloads"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow outbound HTTP for Tempo API
  egress {
    from_port   = var.tempo_api_port
    to_port     = var.tempo_api_port
    protocol    = "tcp"
    description = "Tempo API access"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound HTTP for Loki API
  egress {
    from_port   = var.loki_http_port
    to_port     = var.loki_http_port
    protocol    = "tcp"
    description = "Loki API access"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound gRPC for Loki live tail streaming
  egress {
    from_port   = var.loki_grpc_port
    to_port     = var.loki_grpc_port
    protocol    = "tcp"
    description = "Loki gRPC API for live tail streaming"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound PostgreSQL
  egress {
    from_port   = var.grafana_database_port
    to_port     = var.grafana_database_port
    protocol    = "tcp"
    description = "PostgreSQL database access"
    cidr_blocks = [var.vpc.cidr_block]
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
    Purpose = "Grafana security group"
  }
}