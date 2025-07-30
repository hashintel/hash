# Target groups for OpenTelemetry Collector endpoints
# Internal target groups for service-to-service communication

# Internal HTTP target group (port 4318)
resource "aws_lb_target_group" "http_internal" {
  name        = "${var.prefix}-http-int"
  port        = local.http_port_internal
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
    Name    = "${var.prefix}-http-int"
    Purpose = "OpenTelemetry Collector internal HTTP target group"
  }
}

# Internal gRPC target group (port 4317)
resource "aws_lb_target_group" "grpc_internal" {
  name             = "${var.prefix}-grpc-int"
  port             = local.grpc_port_internal
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
  #   port                = tostring(local.grpc_port_internal)
  #   protocol            = "HTTP"
  #   timeout             = 5
  #   unhealthy_threshold = 2
  # }

  tags = {
    Name    = "${var.prefix}-grpc-int"
    Purpose = "OpenTelemetry Collector internal gRPC target group"
  }
}

# External target groups for client applications

# External HTTP target group (port 4320)
resource "aws_lb_target_group" "http_external" {
  name        = "${var.prefix}-http-ext"
  port        = local.http_port_external
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
    Name    = "${var.prefix}-http-ext"
    Purpose = "OpenTelemetry Collector external HTTP target group"
  }
}

# External gRPC target group (port 4319)
resource "aws_lb_target_group" "grpc_external" {
  name             = "${var.prefix}-grpc-ext"
  port             = local.grpc_port_external
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
  #   port                = tostring(local.grpc_port_external)
  #   protocol            = "HTTP"
  #   timeout             = 5
  #   unhealthy_threshold = 2
  # }

  tags = {
    Name    = "${var.prefix}-grpc-ext"
    Purpose = "OpenTelemetry Collector external gRPC target group"
  }
}
