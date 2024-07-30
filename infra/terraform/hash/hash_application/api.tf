locals {
  api_service_name   = "api"
  api_prefix         = "${var.prefix}-${local.api_service_name}"
  api_param_prefix   = "${local.param_prefix}/${local.api_service_name}"
  api_container_port = 5001
}

resource "aws_ssm_parameter" "api_migration_env_vars" {
  # Only put secrets into SSM
  for_each = {for env_var in var.api_migration_env_vars : env_var.name => env_var if env_var.secret}

  name      = "${local.api_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

resource "aws_ssm_parameter" "api_env_vars" {
  # Only put secrets into SSM
  for_each = {for env_var in var.api_env_vars : env_var.name => env_var if env_var.secret}

  name      = "${local.api_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

locals {
  api_migration_container_def = {
    name             = "${local.api_prefix}-migration"
    image            = "${var.api_image.url}:latest"
    cpu              = 0 # let ECS divvy up the available CPU
    mountPoints      = []
    volumesFrom      = []
    command          = ["start:migrate"]
    dependsOn   = [
      { condition = "HEALTHY", containerName = local.kratos_service_container_def.name },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options   = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.graph_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = concat([
      for env_var in var.api_migration_env_vars :
      { name = env_var.name, value = env_var.value } if !env_var.secret
    ],
      [
        { name = "HASH_TEMPORAL_SERVER_HOST", value = var.temporal_host },
        { name = "HASH_TEMPORAL_SERVER_PORT", value = var.temporal_port },
        { name = "HASH_GRAPH_API_HOST", value = local.graph_container_port_dns },
        { name = "HASH_GRAPH_API_PORT", value = tostring(local.graph_container_port) },
      ])

    secrets = [
      for env_name, ssm_param in aws_ssm_parameter.api_migration_env_vars :
      { name = env_name, valueFrom = ssm_param.arn }
    ]

    essential = false
  }
  api_service_container_def = {
    name        = local.api_prefix
    image       = "${var.api_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    dependsOn   = [
      { condition = "SUCCESS", containerName = local.api_migration_container_def.name },
      { condition = "HEALTHY", containerName = local.hydra_service_container_def.name },
      { condition = "HEALTHY", containerName = local.kratos_service_container_def.name },
    ]
    healthCheck = {
      command = [
        "CMD", "/bin/sh", "-c",
        "curl -f http://localhost:${local.api_container_port}/health-check || exit 1"
      ]
      startPeriod = local.app_grace_period_seconds
      retries     = 5
      interval    = 20
      timeout     = 5
    }
    portMappings = [
      {
        appProtocol   = "http"
        containerPort = local.api_container_port
        hostPort      = local.api_container_port
        protocol      = "tcp"
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options   = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.api_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = concat([
      for env_var in var.api_env_vars :
      { name = env_var.name, value = env_var.value } if !env_var.secret
    ],
      [
        { name = "HASH_TEMPORAL_SERVER_HOST", value = var.temporal_host },
        { name = "HASH_TEMPORAL_SERVER_PORT", value = var.temporal_port },
        { name = "HASH_GRAPH_API_HOST", value = local.graph_container_port_dns },
        { name = "HASH_GRAPH_API_PORT", value = tostring(local.graph_container_port) },
      ])

    secrets = [
      for env_name, ssm_param in aws_ssm_parameter.api_env_vars :
      { name = env_name, valueFrom = ssm_param.arn }
    ]

    essential = true
  }
}
