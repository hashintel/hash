locals {
  spicedb_service_name        = "spicedb"
  spicedb_prefix              = "${var.prefix}-${local.spicedb_service_name}"
  spicedb_param_prefix        = "${local.param_prefix}/${local.spicedb_service_name}"
  spicedb_container_http_port = 8443
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

resource "aws_ssm_parameter" "spicedb_migration_env_vars" {
  # Only put secrets into SSM
  for_each = {for env_var in var.spicedb_migration_env_vars : env_var.name => env_var if env_var.secret}

  name      = "${local.spicedb_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
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
        appProtocol   = "http"
        containerPort = local.spicedb_container_http_port
        hostPort      = local.spicedb_container_http_port
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
