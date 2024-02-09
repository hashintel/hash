locals {
  spicedb_service_name             = "spicedb"
  spicedb_prefix                   = "${var.prefix}-${local.spicedb_service_name}"
  spicedb_param_prefix             = "${local.param_prefix}/${local.spicedb_service_name}"
  spicedb_container_http_port      = 8443
  spicedb_container_http_port_name = local.spicedb_service_name
  spicedb_container_http_port_dns  = "${local.spicedb_service_name}.${aws_service_discovery_private_dns_namespace.app.name}"
}


resource "aws_ssm_parameter" "spicedb_migration_env_vars" {
  # Only put secrets into SSM
  for_each = {for env_var in var.spicedb_migration_env_vars : env_var.name => env_var if env_var.secret}

  name      = "${local.spicedb_param_prefix}/migration/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

resource "aws_ssm_parameter" "spicedb_env_vars" {
  # Only put secrets into SSM
  for_each = {for env_var in var.spicedb_env_vars : env_var.name => env_var if env_var.secret}

  name      = "${local.spicedb_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

resource "aws_security_group" "spicedb" {
  name   = local.spicedb_prefix
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
    from_port   = local.spicedb_container_http_port
    to_port     = local.spicedb_container_http_port
    protocol    = "tcp"
    description = "Allow communication via HTTP"
    cidr_blocks = [var.vpc.cidr_block]
  }
}

resource "aws_ecs_task_definition" "spicedb" {
  family                   = local.spicedb_prefix
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn
  container_definitions    = jsonencode([for task_def in local.spicedb_task_defs : task_def.task_def])
  tags                     = {}
}

resource "aws_ecs_service" "spicedb" {
  depends_on             = [aws_iam_role.task_role]
  name                   = local.spicedb_prefix
  cluster                = data.aws_ecs_cluster.ecs.arn
  task_definition        = aws_ecs_task_definition.spicedb.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [
      aws_security_group.spicedb.id,
    ]
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_private_dns_namespace.app.arn

    service {
      port_name = local.spicedb_container_http_port_name

      client_alias {
        port = local.spicedb_container_http_port
      }
    }
  }

  tags = { Service = "${local.prefix}svc" }
  # @todo: consider using deployment_circuit_breaker
}

locals {
  spicedb_migration_container_def = {
    name             = "${local.spicedb_prefix}-migration"
    image            = "${var.spicedb_image.name}:v${var.spicedb_image.version}"
    cpu              = 0 # let ECS divvy up the available CPU
    mountPoints      = []
    volumesFrom      = []
    command          = ["migrate", "head"]
    logConfiguration = {
      logDriver = "awslogs"
      options   = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.spicedb_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = [
      for env_var in var.spicedb_migration_env_vars :
      { name = env_var.name, value = env_var.value } if !env_var.secret
    ]

    secrets = [
      for env_name, ssm_param in aws_ssm_parameter.spicedb_migration_env_vars :
      { name = env_name, valueFrom = ssm_param.arn }
    ]

    essential = false
  }
  spicedb_service_container_def = {
    name        = "${local.spicedb_prefix}container"
    image       = "${var.spicedb_image.name}:v${var.spicedb_image.version}"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    dependsOn   = [
      { condition = "SUCCESS", containerName = local.spicedb_migration_container_def.name },
    ]
    command     = ["serve"]
    healthCheck = {
      command  = ["CMD", "grpc_health_probe", "-addr=localhost:50051"]
      retries  = 5
      interval = 20
      timeout  = 5

    }
    portMappings = [
      {
        name          = local.spicedb_container_http_port_name
        appProtocol   = "http"
        containerPort = local.spicedb_container_http_port
        protocol      = "tcp"
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options   = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.spicedb_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = [
      for env_var in var.spicedb_env_vars :
      { name = env_var.name, value = env_var.value } if !env_var.secret
    ]

    secrets = [
      for env_name, ssm_param in aws_ssm_parameter.spicedb_env_vars :
      { name = env_name, valueFrom = ssm_param.arn }
    ]

    essential = true
  }
}
