# Target groups for OpenTelemetry Collector endpoints
# These are attached to the parent module's load balancer

# Target group for OpenTelemetry Collector HTTP endpoint
resource "aws_lb_target_group" "http" {
  name        = "${var.prefix}-otel-http"
  port        = local.http_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/"
    port                = tostring(local.health_port)
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name    = "${var.prefix}-otel-http"
    Purpose = "OpenTelemetry Collector HTTP target group"
  }
}

# Target group for OpenTelemetry Collector gRPC endpoint
resource "aws_lb_target_group" "grpc" {
  name             = "${var.prefix}-otel-grpc"
  port             = local.grpc_port
  protocol         = "HTTP"
  protocol_version = "GRPC"
  target_type      = "ip"
  vpc_id           = var.vpc.id

  # TODO: Enable gRPC health check once it's supported by the collector
  #   see https://github.com/open-telemetry/opentelemetry-collector/issues/3040
  # health_check {
  #   enabled             = true
  #   healthy_threshold   = 2
  #   interval            = 30
  #   matcher             = "0"
  #   path                = "/grpc.health.v1.Health/Check"
  #   port                = tostring(module.otel_collector.grpc_port)
  #   protocol            = "HTTP"
  #   timeout             = 5
  #   unhealthy_threshold = 2
  # }

  tags = {
    Name    = "${var.prefix}-otel-grpc"
    Purpose = "OpenTelemetry Collector gRPC target group"
  }
}
