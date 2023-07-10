locals {
  prefix         = "${var.prefix}-worker-${var.worker_name}"
  log_group_name = "${local.prefix}-log"
  param_prefix   = "${var.param_prefix}/worker/${var.worker_name}"
}

module "worker" {
  source   = "../container_registry"
  prefix   = local.prefix
  ecr_name = "ecr"
}

resource "aws_iam_role" "execution_role" {
  name = "${local.prefix}-exerole"
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
  name = "${local.prefix}-taskrole"
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
  family                   = "${local.prefix}-taskdef"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn
  container_definitions    = jsonencode(local.task_definitions)

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
}

resource "aws_ecs_service" "svc" {
  depends_on             = [aws_iam_role.task_role]
  name                   = "${local.prefix}-svc"
  cluster                = var.cluster_arn
  task_definition        = aws_ecs_task_definition.task.arn
  enable_execute_command = true
  desired_count          = var.desired_count
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups = [
      aws_security_group.app_sg.id,
    ]
  }

  tags = { Service = "${local.prefix}-svc" }
}


resource "aws_security_group" "app_sg" {
  name   = "${local.prefix}sg"
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
    from_port   = 7233
    to_port     = 7233
    protocol    = "tcp"
    description = "Allow outbound GRPC connections to Temporal"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # NOTE: if you need to connect to other serivces, there must be more egress rules to allow that.
}
