# Target group for Grafana service

resource "aws_lb_target_group" "grafana" {
  name        = "${local.prefix}-tg"
  port        = local.grafana_port
  protocol    = "HTTP"
  vpc_id      = var.vpc.id
  target_type = "ip"

  lifecycle {
    create_before_destroy = true
  }

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/api/health"
    matcher             = "200"
    port                = local.grafana_port
    protocol            = "HTTP"
  }

  tags = {
    Name    = "${local.prefix}-tg"
    Purpose = "Grafana target group"
  }
}