# Security group for OpenTelemetry Collector

resource "aws_security_group" "otel_collector" {
  name_prefix = "${local.prefix}-"
  vpc_id      = var.vpc.id

  # Allow inbound gRPC traffic
  ingress {
    from_port   = local.grpc_port
    to_port     = local.grpc_port
    protocol    = "tcp"
    description = "OpenTelemetry gRPC receiver"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow inbound HTTP traffic
  ingress {
    from_port   = local.http_port
    to_port     = local.http_port
    protocol    = "tcp"
    description = "OpenTelemetry HTTP receiver"
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

  # Allow outbound DNS
  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    description = "DNS resolution"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${local.prefix}-sg"
    Purpose = "OpenTelemetry Collector security group"
  }
}
