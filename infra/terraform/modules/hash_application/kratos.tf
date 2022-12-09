locals {
  kratos_service_name = "kratos"
  kratos_prefix       = "${var.prefix}-${local.kratos_service_name}"
  kratos_param_prefix = "${local.param_prefix}/${local.kratos_service_name}"
  kratos_public_port  = 4433
  kratos_private_port = 4434
}



resource "aws_ssm_parameter" "kratos_env_vars" {
  # Only put secrets into SSM
  for_each = { for env_var in var.kratos_env_vars : env_var.name => env_var if env_var.secret }

  name = "${local.kratos_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

locals {
  kratos_service_container_def = {
    name        = "${local.kratos_prefix}container"
    image       = "${var.kratos_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${local.kratos_public_port}/health/ready || exit 1"]
      retries     = 5
      startPeriod = 10
      interval    = 30
      timeout     = 5
    }
    portMappings = [
      {
        appProtocol   = "http"
        containerPort = local.kratos_public_port
        hostPort      = local.kratos_public_port
        protocol      = "tcp"
      },
      {
        appProtocol   = "http"
        containerPort = local.kratos_private_port
        hostPort      = local.kratos_private_port
        protocol      = "tcp"
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.kratos_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = [for env_var in var.kratos_env_vars :
    { name = env_var.name, value = env_var.value } if !env_var.secret]

    secrets = [for env_name, ssm_param in aws_ssm_parameter.kratos_env_vars :
    { name = env_name, valueFrom = ssm_param.arn }]

    essential = true
  }
}
