locals {
  prefix           = var.prefix
  log_group_name   = "${local.prefix}-log"
  param_prefix     = var.param_prefix
}

module "migrate_ecr" {
  source   = "../../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "migrate"
}

module "setup_ecr" {
  source   = "../../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "setup"
}

module "cluster" {
  source             = "../../modules/container_cluster"
  prefix             = local.prefix
  ecs_name           = "ecs"
  capacity_providers = ["FARGATE"]
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
        [
          {
            Effect   = "Allow"
            Action   = ["ssm:GetParameters"]
            Resource = [for _, env_var in aws_ssm_parameter.temporal_setup_secrets : env_var.arn]
          }
        ],
        [
          {
            Effect   = "Allow"
            Action   = ["ssm:GetParameters"]
            Resource = [for _, env_var in aws_ssm_parameter.temporal_secrets : env_var.arn]
          }
        ],
        [
          # Allow assigning tags to clusters, services etc – https://docs.aws.amazon.com/AmazonECS/latest/developerguide/supported-iam-actions-tagging.html
          {
            Action: [
              "ecs:TagResource"
            ],
            Effect: "Allow",
            Resource: "*",
          }
        ]
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
}

resource "aws_ecs_service" "svc" {
  depends_on             = [aws_iam_role.task_role]
  name                   = "${local.prefix}-svc"
  cluster                = module.cluster.ecs_cluster_arn
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

  load_balancer {
    target_group_arn = aws_lb_target_group.app_tg.arn
    container_name   = "${local.prefix}-${local.temporal_service_name}"
    container_port   = local.temporal_port
  }


  tags = { Service = "${local.prefix}-svc" }
}


resource "aws_security_group" "app_sg" {
  name   = "${var.prefix}-sg"
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
    from_port   = local.temporal_port
    to_port     = local.temporal_port
    protocol    = "tcp"
    description = "Allow connections to Temporal server within the VPC"
    # TODO: Consider changing this to `"0.0.0.0/0"` and setup authentication
    # description = "Allow connections to Temporal from anywhere (rely on authentication to restrict access)"
    cidr_blocks = [var.vpc.cidr_block]
  }

  egress {
    from_port   = local.temporal_port
    to_port     = local.temporal_port
    protocol    = "tcp"
    description = "Allow connections from Temporal server within the VPC"
    cidr_blocks = [var.vpc.cidr_block]
    # To make UI available from the web:
    # cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = local.temporal_ui_port
    to_port     = local.temporal_ui_port
    protocol    = "tcp"
    description = "Allow connections to Temporal UI within the VPC"
    # TODO: Consider changing this to `"0.0.0.0/0"` and setup authentication
    # description = "Allow connections to Temporal from anywhere (rely on authentication to restrict access)"
    cidr_blocks = [var.vpc.cidr_block]
    # To make UI available from the web:
    # cidr_blocks = ["0.0.0.0/0"]
  }
}
