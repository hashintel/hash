# Internal HTTP target group for profiles
resource "aws_lb_target_group" "profile_internal" {
  name        = "${var.prefix}-profile-int"
  port        = local.profile_port_internal
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/"
    port                = tostring(local.http_port)
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name    = "${var.prefix}-profile-int"
    Purpose = "Alloy internal profile target group"
  }
}

# External HTTP target group for profiles
resource "aws_lb_target_group" "profile_external" {
  name        = "${var.prefix}-profile-ext"
  port        = local.profile_port_external
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/"
    port                = tostring(local.http_port)
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name    = "${var.prefix}-profile-ext"
    Purpose = "Alloy external profile target group"
  }
}
