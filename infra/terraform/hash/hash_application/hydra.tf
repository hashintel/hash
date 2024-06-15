locals {
  hydra_service_name = "hydra"
  hydra_prefix       = "${var.prefix}-${local.hydra_service_name}"
  hydra_param_prefix = "${local.param_prefix}/${local.hydra_service_name}"
  hydra_public_port  = 4444
  hydra_private_port = 4445
  hydra_public_http_port_name  = local.hydra_service_name
  hydra_public_http_port_dns   = "${local.hydra_public_http_port_name}.${aws_service_discovery_private_dns_namespace.app.name}"
  hydra_private_http_port_name = "${local.hydra_service_name}-private"
  hydra_private_http_port_dns  = "${local.hydra_private_http_port_name}.${aws_service_discovery_private_dns_namespace.app.name}"
}


resource "aws_ssm_parameter" "hydra_env_vars" {
  # Only put secrets into SSM
  for_each = { for env_var in var.hydra_env_vars : env_var.name => env_var if env_var.secret }

  name = "${local.hydra_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

resource "aws_security_group" "hydra" {
  name   = local.hydra_prefix
  vpc_id = var.vpc.id

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "Fargate tasks must have outbound access to allow outgoing traffic and access Amazon ECS endpoints."
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
    from_port   = local.hydra_public_port
    to_port     = local.hydra_public_port
    protocol    = "tcp"
    description = "Allow communication via HTTP"
    cidr_blocks = [var.vpc.cidr_block]
  }

  ingress {
    from_port   = local.hydra_private_port
    to_port     = local.hydra_private_port
    protocol    = "tcp"
    description = "Allow communication via HTTP"
    cidr_blocks = [var.vpc.cidr_block]
  }
}

resource "aws_ecs_task_definition" "hydra" {
  family                   = local.hydra_prefix
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn
  container_definitions    = jsonencode([for task_def in local.hydra_task_defs : task_def.task_def])
  tags = {}
}

resource "aws_ecs_service" "hydra" {
  depends_on             = [aws_iam_role.task_role]
  name                   = local.hydra_prefix
  cluster                = data.aws_ecs_cluster.ecs.arn
  task_definition        = aws_ecs_task_definition.hydra.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [
      aws_security_group.hydra.id,
    ]
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_private_dns_namespace.app.arn

    service {
      port_name = local.hydra_public_http_port_name

      client_alias {
        port = local.hydra_public_port
      }
    }

    service {
      port_name = local.hydra_private_http_port_name

      client_alias {
        port = local.hydra_private_port
      }
    }
  }

  tags = { Service = "${local.prefix}svc" }
}

locals {
  hydra_migration_container_def = {
    name        = "${local.hydra_prefix}-migration"
    image       = "${var.hydra_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    command     = ["migrate", "sql", "-e", "--yes"]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.hydra_service_name
        "awslogs-region"        = var.region
      }
    }

    Environment = [for env_var in var.hydra_env_vars :
      { name = env_var.name, value = env_var.value } if !env_var.secret]

    secrets = [for env_name, ssm_param in aws_ssm_parameter.hydra_env_vars :
      { name = env_name, valueFrom = ssm_param.arn }]

    essential = false
  }
  hydra_service_container_def = {
    name        = "${local.hydra_prefix}container"
    image       = "${var.hydra_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    dependsOn   = [
      { condition = "SUCCESS", containerName = local.hydra_migration_container_def.name },
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${local.hydra_public_port}/health/ready || exit 1"]
      retries     = 5
      startPeriod = 10
      interval    = 30
      timeout     = 5
    }
    portMappings = [
      {
        name          = local.hydra_public_http_port_name
        appProtocol   = "http"
        containerPort = local.hydra_public_port
        protocol      = "tcp"
      },
      {
        name          = local.hydra_private_http_port_name
        appProtocol   = "http"
        containerPort = local.hydra_private_port
        protocol      = "tcp"
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.hydra_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = [for env_var in var.hydra_env_vars :
    { name = env_var.name, value = env_var.value } if !env_var.secret]

    secrets = [for env_name, ssm_param in aws_ssm_parameter.hydra_env_vars :
    { name = env_name, valueFrom = ssm_param.arn }]

    essential = true
  }
}
