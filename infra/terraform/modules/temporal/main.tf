locals {
  prefix           = "${var.prefix}-temporal"
  log_group_name   = "${local.prefix}log"
  param_prefix     = "${var.param_prefix}/temporal"
  temporal_version = var.temporal_version
}

module "migrate" {
  source   = "../container_registry"
  prefix   = var.prefix
  ecr_name = "temporalmigrate"
}

module "setup" {
  source   = "../container_registry"
  prefix   = var.prefix
  ecr_name = "temporalsetup"
}

module "temporal_ecs" {
  source             = "../container_cluster"
  prefix             = var.prefix
  ecs_name           = "temporalserver"
  capacity_providers = ["FARGATE"]
}

resource "aws_iam_role" "execution_role" {
  name = "${local.prefix}exerole"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
  inline_policy {
    name = "policy"
    # Allow publishing logs and getting secrets
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = flatten([
        [
          {
            Effect   = "Allow"
            Action   = ["logs:CreateLogGroup"]
            Resource = ["*"]
          }
        ],
        length(local.shared_secrets) > 0 ? [{
          Effect   = "Allow"
          Action   = ["ssm:GetParameters"]
          Resource = [for _, env_var in local.shared_secrets : env_var.valueFrom]
        }] : []
      ])
    })
  }
  tags = {}
}

resource "aws_iam_role_policy_attachment" "execution_role" {
  role       = aws_iam_role.execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM role for the running task
resource "aws_iam_role" "task_role" {
  name = "${local.prefix}taskrole"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      },
    ]
  })
  inline_policy {
    name = "policy"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
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
        }
      ]
    })
  }

  tags = {}
}

resource "aws_ecs_task_definition" "task" {
  family                   = "${local.prefix}taskdef"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn
  container_definitions    = jsonencode(local.task_definitions)
}

resource "aws_ecs_service" "svc" {
  depends_on             = [aws_iam_role.task_role]
  name                   = "${local.prefix}svc"
  cluster                = module.temporal_ecs.ecs_cluster_arn
  task_definition        = aws_ecs_task_definition.task.arn
  enable_execute_command = true
  desired_count          = 0
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups = [
      aws_security_group.app_sg.id,
    ]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app_tg.arn
    container_name   = "${local.prefix}${local.temporal_service_name}"
    container_port   = local.temporal_port
  }


  tags = { Service = "${local.prefix}svc" }
}


resource "aws_security_group" "app_sg" {
  name   = "${var.prefix}-sgtemporal"
  vpc_id = var.vpc.id

  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    description = "Allow outbound DNS lookups"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "Allow outbound HTTPS connections"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    description = "Allow connections to Postgres within the VPC"
    cidr_blocks = [var.vpc.cidr_block]
  }

  ingress {
    from_port   = 7233
    to_port     = 7233
    protocol    = "tcp"
    description = "Allow connections to Temporal from anywhere (rely on authentication to restrict access)"
    # TODO: Consider changing this to `var.vpc.cidr_block`
    cidr_blocks = ["0.0.0.0/0"]
  }
}
