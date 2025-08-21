# Security group for OpenTelemetry Collector

resource "aws_security_group" "otel_collector" {
  name_prefix = "${local.prefix}-"
  vpc_id      = var.vpc.id

  # Allow inbound gRPC traffic - internal (service-to-service)
  ingress {
    from_port   = local.grpc_port_internal
    to_port     = local.grpc_port_internal
    protocol    = "tcp"
    description = "OpenTelemetry internal gRPC receiver"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow inbound HTTP traffic - internal (service-to-service)
  ingress {
    from_port   = local.http_port_internal
    to_port     = local.http_port_internal
    protocol    = "tcp"
    description = "OpenTelemetry internal HTTP receiver"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow inbound gRPC traffic - external (client applications via ALB)
  ingress {
    from_port   = local.grpc_port_external
    to_port     = local.grpc_port_external
    protocol    = "tcp"
    description = "OpenTelemetry external gRPC receiver"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow inbound HTTP traffic - external (client applications via ALB)
  ingress {
    from_port   = local.http_port_external
    to_port     = local.http_port_external
    protocol    = "tcp"
    description = "OpenTelemetry external HTTP receiver"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow health check traffic
  ingress {
    from_port   = local.health_port
    to_port     = local.health_port
    protocol    = "tcp"
    description = "OpenTelemetry health check"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound HTTPS for S3 config download
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "HTTPS for S3 config download"
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

  # Allow outbound DNS (TCP)
  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    description = "DNS resolution TCP"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow outbound DNS (UDP)
  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    description = "DNS resolution UDP"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow outbound traffic to Tempo OTLP gRPC
  egress {
    from_port   = var.tempo_otlp_grpc_port
    to_port     = var.tempo_otlp_grpc_port
    protocol    = "tcp"
    description = "OTLP gRPC to Tempo"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound traffic to Loki HTTP API
  egress {
    from_port   = var.loki_http_port
    to_port     = var.loki_http_port
    protocol    = "tcp"
    description = "OTLP HTTP to Loki"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound traffic to Mimir HTTP API
  egress {
    from_port   = var.mimir_http_port
    to_port     = var.mimir_http_port
    protocol    = "tcp"
    description = "OTLP HTTP to Mimir"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound traffic to Tempo API for metrics scraping
  egress {
    from_port   = var.tempo_api_port
    to_port     = var.tempo_api_port
    protocol    = "tcp"
    description = "HTTP to Tempo API for metrics scraping"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound traffic to Grafana for metrics scraping
  egress {
    from_port   = var.grafana_port
    to_port     = var.grafana_port
    protocol    = "tcp"
    description = "HTTP to Grafana for metrics scraping"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound traffic to Grafana Alloy for metrics scraping
  egress {
    from_port   = var.alloy_port
    to_port     = var.alloy_port
    protocol    = "tcp"
    description = "HTTP to Grafana Alloy for metrics scraping"
    cidr_blocks = [var.vpc.cidr_block]
  }

  tags = {
    Name    = "${local.prefix}-sg"
    Purpose = "OpenTelemetry Collector security group"
  }
}
