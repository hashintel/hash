locals {
  alb_port = local.temporal_port
}

data "aws_subnets" "snpub" {
  tags = {
    Name = "${var.prefix}-snpub"
  }
}

resource "aws_lb" "net_alb" {
  name               = "${local.prefix}alb"
  load_balancer_type = "network"
  subnets            = data.aws_subnets.snpub.ids

  # security_groups = [aws_security_group.alb_sg.id]
  # Timeout is set to allow collab to use long polling and not closing after default 60 seconds.
  idle_timeout = 4000
}

resource "aws_lb_target_group" "app_tg" {
  depends_on  = [aws_lb.net_alb]
  name        = "${local.prefix}tg"
  port        = local.alb_port
  protocol    = "TCP"
  target_type = "ip"
  vpc_id      = var.vpc.id
}

resource "aws_lb_listener" "app_grpc" {
  depends_on        = [aws_lb_target_group.app_tg]
  load_balancer_arn = aws_lb.net_alb.arn
  port              = local.alb_port
  protocol          = "TCP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app_tg.arn
  }
}
