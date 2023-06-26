locals {
  prefix = "${var.prefix}-temporal"
}

module "application_ecs" {
  depends_on         = [module.networking]
  source             = "../container_cluster"
  prefix             = local.prefix
  ecs_name           = "ecs"
  capacity_providers = ["FARGATE"]
}


resource "aws_iam_role_policy_attachment" "execution_role_exe" {
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
  container_definitions    = jsonencode([])
  tags                     = {}
}

resource "aws_ecs_service" "svc" {
  depends_on             = [aws_iam_role.task_role]
  name                   = "${local.prefix}svc"
  cluster                = data.aws_ecs_cluster.ecs.arn
  task_definition        = aws_ecs_task_definition.task.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"
  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups = [
      aws_security_group.app_sg.id,
    ]
  }

  tags = { Service = "${local.prefix}svc" }
  # @todo: consider using deployment_circuit_breaker
}


resource "aws_security_group" "app_sg" {
  name   = "${var.prefix}-sgapp"
  vpc_id = var.vpc.id
}
