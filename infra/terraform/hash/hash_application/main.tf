locals {
  prefix                   = "${var.prefix}-app"
  log_group_name           = "${local.prefix}log"
  param_prefix             = "${var.param_prefix}/app"
  app_grace_period_seconds = 300
  spicedb_task_defs        = [
    {
      task_def = local.spicedb_migration_container_def
      env_vars = aws_ssm_parameter.spicedb_migration_env_vars
    },
    {
      task_def = local.spicedb_service_container_def
      env_vars = aws_ssm_parameter.spicedb_env_vars
    },
  ]
  graph_task_defs = [
    {
      task_def = local.graph_migration_container_def
      env_vars = aws_ssm_parameter.graph_migration_env_vars
      ecr_arn  = var.graph_image.ecr_arn
    },
    {
      task_def = local.graph_service_container_def
      env_vars = aws_ssm_parameter.graph_env_vars
      ecr_arn  = var.graph_image.ecr_arn
    },
    {
      task_def = local.type_fetcher_service_container_def
      env_vars = []
      ecr_arn  = var.type_fetcher_image.ecr_arn
    },
  ]
  task_defs = [
    {
      task_def = local.kratos_migration_container_def
      env_vars = aws_ssm_parameter.kratos_env_vars
      ecr_arn  = var.kratos_image.ecr_arn
    },
    {
      task_def = local.kratos_service_container_def
      env_vars = aws_ssm_parameter.kratos_env_vars
      ecr_arn  = var.kratos_image.ecr_arn
    },
    {
      task_def = local.hydra_migration_container_def
      env_vars = aws_ssm_parameter.hydra_env_vars
      ecr_arn  = var.hydra_image.ecr_arn
    },
    {
      task_def = local.hydra_service_container_def
      env_vars = aws_ssm_parameter.hydra_env_vars
      ecr_arn  = var.hydra_image.ecr_arn
    },
    {
      task_def = local.api_service_container_def
      env_vars = aws_ssm_parameter.api_env_vars
      ecr_arn  = var.api_image.ecr_arn
    },
    {
      task_def = local.api_migration_container_def
      env_vars = aws_ssm_parameter.api_migration_env_vars
      ecr_arn  = var.api_image.ecr_arn
    },
  ]
  worker_task_defs = [
    {
      task_def = local.temporal_worker_ai_ts_service_container_def
      env_vars = aws_ssm_parameter.temporal_worker_ai_ts_env_vars
      ecr_arn  = var.temporal_worker_ai_ts_image.ecr_arn
    },
    {
      task_def = local.temporal_worker_integration_service_container_def
      env_vars = aws_ssm_parameter.temporal_worker_integration_env_vars
      ecr_arn  = var.temporal_worker_integration_image.ecr_arn
    },
  ]
}

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

resource "aws_service_discovery_private_dns_namespace" "app" {
  name = local.prefix
  vpc  = var.vpc.id
}

data "aws_subnets" "snpub" {
  tags = {
    Name = "${var.prefix}-snpub"
  }
}

data "aws_vpc_endpoint" "s3" {
  tags = { Name = "${var.prefix}-vpces3" }
}

data "aws_ecs_cluster" "ecs" {
  cluster_name = "${var.prefix}-ecs"
}

data "cloudflare_ip_ranges" "cloudflare" {}

resource "aws_security_group" "alb_sg" {
  name   = "${var.prefix}-sgalb"
  vpc_id = var.vpc.id

  egress {
    from_port   = local.api_container_port
    to_port     = local.api_container_port
    protocol    = "tcp"
    description = "Allow connections to the Node API from the load balancer"
    cidr_blocks = [var.vpc.cidr_block]
  }

  ingress {
    from_port        = 443
    to_port          = 443
    protocol         = "TCP"
    description      = "Allow incoming traffic via Cloudflare IP ranges"
    cidr_blocks      = toset(data.cloudflare_ip_ranges.cloudflare.ipv4_cidr_blocks)
    ipv6_cidr_blocks = toset(data.cloudflare_ip_ranges.cloudflare.ipv6_cidr_blocks)
  }

  ingress {
    from_port   = 4455
    to_port     = 4455
    protocol    = "tcp"
    description = "Allow connections from the type fetcher"
    cidr_blocks = [var.vpc.cidr_block]
  }

  egress {
    from_port   = local.graph_container_port
    to_port     = local.graph_container_port
    protocol    = "tcp"
    description = "Allow connections to the graph from the load balancer"
    cidr_blocks = [var.vpc.cidr_block]
  }
}

resource "aws_lb" "app_alb" {
  depends_on         = [aws_security_group.alb_sg]
  name               = "${var.prefix}-alb"
  load_balancer_type = "application"
  subnets            = data.aws_subnets.snpub.ids

  security_groups = [aws_security_group.alb_sg.id]
  # Timeout is set to allow collab to use long polling and not closing after default 60 seconds.
  idle_timeout    = 4000
}

resource "aws_lb_target_group" "app_tg" {
  depends_on  = [aws_lb.app_alb]
  name        = "${var.prefix}-tg"
  port        = local.api_container_port
  protocol    = "HTTP" # @todo: switch to HTTPS (requires cert?)
  target_type = "ip"
  vpc_id      = var.vpc.id
  health_check {
    healthy_threshold   = 3
    interval            = 30
    matcher             = "200"
    path                = "/health-check"
    timeout             = 10
    unhealthy_threshold = 3
  }
  slow_start           = 30
  # Time between demoting state from 'draining' to 'unused'.
  # The default, 300s, makes it so we have multiple services running for 5 whole minutes.
  deregistration_delay = 30
  # @todo: can we enable preserve_client_ip? (may not be supported by Fargate)
  #   Without this, the IP address of requests received by the API container will
  #   be that of the load balancer, and not the original client. This will affect
  #   IP address logging. See:
  #   app_https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-target-groups.html#client-ip-preservation
  # @todo: what protocol version do we want. HTTP/1 is the default
}

resource "aws_lb_listener" "app_http" {
  depends_on        = [aws_lb_target_group.app_tg]
  load_balancer_arn = aws_lb.app_alb.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app_tg.arn
  }
}

data "aws_acm_certificate" "hash_wildcard_cert" {
  domain   = "*.hash.ai"
  statuses = ["ISSUED"]
}


# The load balancer will allow HTTPS connections that come through
# this is only when the SSL Certificate ARN is defined when applying the
# Terraform scripts. The target group is the same for HTTPS
#
# The load balancer will terminate SSL.
resource "aws_lb_listener" "app_https" {
  depends_on        = [aws_lb_target_group.app_tg]
  load_balancer_arn = aws_lb.app_alb.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = data.aws_acm_certificate.hash_wildcard_cert.arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app_tg.arn
  }
}

# IAM role which allows ECS to pull the API Docker image from ECR
resource "aws_iam_role" "execution_role" {
  name               = "${local.prefix}exerole"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
  inline_policy {
    name   = "policy"
    # Allow fetching images from ECR, publishing logs and getting secrets
    policy = jsonencode({
      Version   = "2012-10-17"
      Statement = flatten([
        [
          {
            Effect   = "Allow"
            Action   = ["logs:CreateLogGroup"]
            Resource = ["*"]
          }
        ],
        [
          {
            Effect   = "Allow"
            Action   = ["ssm:GetParameters"]
            Resource = concat(
              flatten([for def in local.task_defs : [for _, env_var in def.env_vars : env_var.arn]])
            )
          }
        ],
        [
          {
            Effect   = "Allow"
            Action   = ["ssm:GetParameters"]
            Resource = concat(
              flatten([
                for def in local.spicedb_task_defs : [for _, env_var in def.env_vars : env_var.arn]
              ])
            )
          }
        ],
        [
          {
            Effect   = "Allow"
            Action   = ["ssm:GetParameters"]
            Resource = concat(
              flatten([
                for def in local.graph_task_defs : [for _, env_var in def.env_vars : env_var.arn]
              ])
            )
          }
        ],
        [
          {
            Effect   = "Allow"
            Action   = ["ssm:GetParameters"]
            Resource = concat(
              flatten([
                for def in local.worker_task_defs : [for _, env_var in def.env_vars : env_var.arn]
              ])
            )
          }
        ],
      ])
    })
  }
  tags = {}
}
/*
https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
Contains:
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
*/
resource "aws_iam_role_policy_attachment" "execution_role_exe" {
  role       = aws_iam_role.execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM role for the running task
resource "aws_iam_role" "task_role" {
  name               = "${local.prefix}taskrole"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      },
    ]
  })
  inline_policy {
    name   = "policy"
    policy = jsonencode({
      Version   = "2012-10-17"
      Statement = [
        {
          # @todo: we can restrict the FROM address and more
          # see: app_https://docs.aws.amazon.com/ses/latest/DeveloperGuide/control-user-access.html
          Action = [
            "ses:SendEmail",
            "ses:SendRawEmail"
          ]
          Effect   = "Allow"
          Resource = "*"
        },
        # Enable SSM
        {
          Action = [
            "ssmmessages:CreateControlChannel",
            "ssmmessages:CreateDataChannel",
            "ssmmessages:OpenControlChannel",
            "ssmmessages:OpenDataChannel"
          ],
          Effect   = "Allow",
          Resource = "*"
        },
      ]
    })
  }

  tags = {}
}

resource "aws_ecs_task_definition" "task" {
  family                   = "${local.prefix}-app-taskdef"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn
  container_definitions    = jsonencode([for task_def in local.task_defs : task_def.task_def])
  tags                     = {}
}

resource "aws_ecs_task_definition" "worker_task" {
  family                   = "${local.prefix}-worker-taskdef"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn
  container_definitions    = jsonencode([
    for task_def in local.worker_task_defs : task_def.task_def
  ])
  tags = {}
}

resource "aws_ecs_service" "svc" {
  depends_on                        = [aws_iam_role.task_role, aws_ecs_service.graph]
  name                              = "${local.prefix}svc"
  cluster                           = data.aws_ecs_cluster.ecs.arn
  task_definition                   = aws_ecs_task_definition.task.arn
  enable_execute_command            = true
  desired_count                     = 1
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = local.app_grace_period_seconds
  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [
      aws_security_group.app_sg.id,
    ]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app_tg.arn
    container_name   = local.api_service_container_def.name
    container_port   = local.api_container_port
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_private_dns_namespace.app.arn
  }

  tags = { Service = "${local.prefix}svc" }
  # @todo: consider using deployment_circuit_breaker
}

resource "aws_ecs_service" "worker" {
  depends_on             = [aws_iam_role.task_role, aws_ecs_service.graph]
  name                   = "${local.prefix}worker-svc"
  cluster                = data.aws_ecs_cluster.ecs.arn
  task_definition        = aws_ecs_task_definition.worker_task.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"
  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [
      aws_security_group.app_sg.id,
    ]
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_private_dns_namespace.app.arn
  }

  tags = { Service = "${local.prefix}worker-svc" }
  # @todo: consider using deployment_circuit_breaker
}


resource "aws_security_group" "app_sg" {
  name   = "${var.prefix}-sgapp"
  vpc_id = var.vpc.id

  egress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    description     = "Allow Fargate to pull images from the private registry"
    prefix_list_ids = [data.aws_vpc_endpoint.s3.prefix_list_id]
  }
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "Allow endpoint connections"
    cidr_blocks = [var.vpc.cidr_block]
  }
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "Allow outgoing requests to fetch types"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    description = "Allow outgoing requests to fetch types"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    description = "Allow connections to Postgres within the VPC"
    cidr_blocks = [var.vpc.cidr_block]
  }
  egress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    description = "Allow connections to Redis within the VPC"
    cidr_blocks = [var.vpc.cidr_block]
  }
  egress {
    from_port   = 587
    to_port     = 587
    protocol    = "tcp"
    description = "Allow connections to AWS SES"
    cidr_blocks = [var.vpc.cidr_block]
  }
  egress {
    from_port   = var.temporal_port
    to_port     = var.temporal_port
    protocol    = "tcp"
    description = "Allow outbound gRPC connections to Temporal"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = local.graph_container_port
    to_port     = local.graph_container_port
    protocol    = "tcp"
    description = "Allow connections to the graph"
    cidr_blocks = [var.vpc.cidr_block]
  }

  ingress {
    from_port   = local.api_container_port
    to_port     = local.api_container_port
    protocol    = "tcp"
    description = "Allow connections from the ALB to the Node API"
    cidr_blocks = [var.vpc.cidr_block]
  }
}
