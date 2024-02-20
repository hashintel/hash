locals {
  hydra_service_name = "hydra"
  hydra_prefix       = "${var.prefix}-${local.hydra_service_name}"
  hydra_param_prefix = "${local.param_prefix}/${local.hydra_service_name}"
  hydra_public_port  = 4444
  hydra_private_port = 4445
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
        appProtocol   = "http"
        containerPort = local.hydra_public_port
        hostPort      = local.hydra_public_port
        protocol      = "tcp"
      },
      {
        appProtocol   = "http"
        containerPort = local.hydra_private_port
        hostPort      = local.hydra_private_port
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
