# Internal Application Load Balancer for internal telemetry collection
# Provides HTTP and gRPC endpoints for applications to send telemetry data

resource "aws_lb" "observability_internal" {
  name               = "${var.prefix}-internal"
  load_balancer_type = "application"
  subnets            = var.subnets
  security_groups    = [aws_security_group.alb_internal.id]
  internal           = true

  tags = {
    Name    = "${var.prefix}-internal"
    Purpose = "Internal observability services load balancer"
  }
}

# Security group for the internal ALB
resource "aws_security_group" "alb_internal" {
  name_prefix = "${var.prefix}-internal-"
  vpc_id      = var.vpc.id

  # Allow inbound HTTP for OTel receiver internal
  ingress {
    from_port   = module.otel_collector.http_port_internal
    to_port     = module.otel_collector.http_port_internal
    protocol    = "tcp"
    description = "HTTP for OpenTelemetry receiver (internal)"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow inbound gRPC for OTel receiver internal
  ingress {
    from_port   = module.otel_collector.grpc_port_internal
    to_port     = module.otel_collector.grpc_port_internal
    protocol    = "tcp"
    description = "gRPC for OpenTelemetry receiver (internal)"
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
    Name    = "${var.prefix}-internal-sg"
    Purpose = "Internal observability ALB security group"
  }
}


# Get Cloudflare IP ranges for security group restrictions
data "cloudflare_ip_ranges" "cloudflare" {}

# External Application Load Balancer for public access
# Provides HTTPS access to Grafana and external telemetry endpoints

resource "aws_lb" "observability_external" {
  name               = "${var.prefix}-external"
  load_balancer_type = "application"
  subnets            = var.subnets
  security_groups    = [aws_security_group.alb_external.id]
  internal           = false

  tags = {
    Name    = "${var.prefix}-external"
    Purpose = "External observability services load balancer"
  }
}

# Security group for the external ALB
resource "aws_security_group" "alb_external" {
  name_prefix = "${var.prefix}-external-"
  vpc_id      = var.vpc.id

  # Allow inbound HTTPS from internet
  ingress {
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    description      = "HTTPS from internet for Grafana and external telemetry"
    cidr_blocks      = toset(data.cloudflare_ip_ranges.cloudflare.ipv4_cidr_blocks)
    ipv6_cidr_blocks = toset(data.cloudflare_ip_ranges.cloudflare.ipv6_cidr_blocks)
  }

  # Allow outbound to Grafana containers
  egress {
    from_port   = module.grafana.grafana_port
    to_port     = module.grafana.grafana_port
    protocol    = "tcp"
    description = "Allow outbound to Grafana containers"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound to OTel Collector for external telemetry
  egress {
    from_port   = module.otel_collector.http_port_external
    to_port     = module.otel_collector.http_port_external
    protocol    = "tcp"
    description = "Allow outbound to OTel Collector for external telemetry"
    cidr_blocks = [var.vpc.cidr_block]
  }

  egress {
    from_port   = module.otel_collector.grpc_port_external
    to_port     = module.otel_collector.grpc_port_external
    protocol    = "tcp"
    description = "Allow outbound to OTel Collector for external telemetry"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Allow outbound to OTel Collector health check port
  egress {
    from_port   = module.otel_collector.health_port
    to_port     = module.otel_collector.health_port
    protocol    = "tcp"
    description = "Allow health checks to OTel Collector"
    cidr_blocks = [var.vpc.cidr_block]
  }

  tags = {
    Name    = "${var.prefix}-external-sg"
    Purpose = "External observability ALB security group"
  }
}

# External HTTPS listener for grafana.hash.ai and telemetry.hash.ai
resource "aws_lb_listener" "external_https" {
  load_balancer_arn = aws_lb.observability_external.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-Res-2021-06"
  certificate_arn   = data.aws_acm_certificate.hash_wildcard_cert.arn

  # Default action - return 404 for unknown hosts
  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }

  tags = {
    Name = "${var.prefix}-external-https-listener"
  }
}

# Grafana routing rule for grafana.hash.ai
resource "aws_lb_listener_rule" "grafana_routing" {
  listener_arn = aws_lb_listener.external_https.arn
  priority     = 50

  action {
    type             = "forward"
    target_group_arn = module.grafana.target_group_arn
  }

  condition {
    host_header {
      values = ["grafana.internal.hash.ai"]
    }
  }

  tags = {
    Name = "${var.prefix}-grafana-routing"
  }
}

# External telemetry routing rules for telemetry.hash.ai
resource "aws_lb_listener_rule" "telemetry_external_http_routing" {
  listener_arn = aws_lb_listener.external_https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = module.otel_collector.http_external_target_group_arn
  }

  condition {
    host_header {
      values = ["telemetry.hash.ai"]
    }
  }

  condition {
    http_header {
      http_header_name = "content-type"
      values           = ["application/json", "application/x-protobuf"]
    }
  }

  tags = {
    Name = "${var.prefix}-telemetry-external-http-routing"
  }
}

resource "aws_lb_listener_rule" "telemetry_external_grpc_routing" {
  listener_arn = aws_lb_listener.external_https.arn
  priority     = 101

  action {
    type             = "forward"
    target_group_arn = module.otel_collector.grpc_external_target_group_arn
  }

  condition {
    host_header {
      values = ["telemetry.hash.ai"]
    }
  }

  condition {
    http_header {
      http_header_name = "content-type"
      values           = ["application/grpc"]
    }
  }

  tags = {
    Name = "${var.prefix}-telemetry-external-grpc-routing"
  }
}

# Internal HTTP listener for app cluster OTel collector
resource "aws_lb_listener" "otel_internal_http" {
  load_balancer_arn = aws_lb.observability_internal.arn
  port              = module.otel_collector.http_port_internal
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = module.otel_collector.http_internal_target_group_arn
  }

  tags = {
    Name = "${var.prefix}-otel-internal-http-listener"
  }
}
