# Application Load Balancer for external access to observability services
# Provides HTTP and gRPC endpoints for applications to send telemetry data

resource "aws_lb" "observability" {
  name               = var.prefix
  load_balancer_type = "application"
  subnets            = var.subnets
  security_groups    = [aws_security_group.alb.id]
  internal           = true

  tags = {
    Name    = var.prefix
    Purpose = "Observability services load balancer"
  }
}

# Security group for the ALB
resource "aws_security_group" "alb" {
  name_prefix = "${var.prefix}-"
  vpc_id      = var.vpc.id

  # Allow inbound HTTPS for OTel (gRPC over HTTP/2)
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "HTTPS for OpenTelemetry receiver (external - HTTP and gRPC)"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow inbound HTTPS for OTel receiver internal (supports both gRPC and HTTP over HTTPS)
  ingress {
    from_port   = module.otel_collector.http_port
    to_port     = module.otel_collector.http_port
    protocol    = "tcp"
    description = "HTTPS for OpenTelemetry receiver (internal - HTTP)"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow all outbound traffic to reach ECS services
  egress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    description = "Allow outbound to ECS services"
    cidr_blocks = [var.vpc.cidr_block]
  }

  tags = {
    Name    = "${var.prefix}-sg"
    Purpose = "Observability ALB security group"
  }
}


# External HTTPS listener for telemetry.hash.ai (Cloudflare certificate)
resource "aws_lb_listener" "otel_external" {
  load_balancer_arn = aws_lb.observability.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = data.aws_acm_certificate.hash_wildcard_cert.arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Only OpenTelemetry gRPC and HTTP requests are allowed"
      status_code  = "400"
    }
  }

  tags = {
    Name = "${var.prefix}-otel-external-listener"
  }
}

# External listener routing rules
resource "aws_lb_listener_rule" "otel_external_http_routing" {
  listener_arn = aws_lb_listener.otel_external.arn

  action {
    type             = "forward"
    target_group_arn = module.otel_collector.http_target_group_arn
  }

  condition {
    http_header {
      http_header_name = "content-type"
      values           = ["application/json", "application/x-protobuf"]
    }
  }

  tags = {
    Name = "${var.prefix}-otel-external-http-routing"
  }
}

resource "aws_lb_listener_rule" "otel_external_grpc_routing" {
  listener_arn = aws_lb_listener.otel_external.arn

  action {
    type             = "forward"
    target_group_arn = module.otel_collector.grpc_target_group_arn
  }

  condition {
    http_header {
      http_header_name = "content-type"
      values           = ["application/grpc"]
    }
  }

  tags = {
    Name = "${var.prefix}-otel-external-grpc-routing"
  }
}

# Internal HTTP listener for app cluster OTel collector
resource "aws_lb_listener" "otel_internal" {
  load_balancer_arn = aws_lb.observability.arn
  port              = module.otel_collector.http_port
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = module.otel_collector.http_target_group_arn
  }

  tags = {
    Name = "${var.prefix}-otel-internal-listener"
  }
}
