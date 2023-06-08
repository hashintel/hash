locals {
  type_fetcher_service_name = "typefetcher"
  type_fetcher_prefix       = "${var.prefix}-${local.type_fetcher_service_name}"
  type_fetcher_param_prefix = "${local.param_prefix}/${local.type_fetcher_service_name}"
}

resource "aws_ssm_parameter" "type_fetcher_env_vars" {
  # Only put secrets into SSM
  for_each = { for env_var in var.type_fetcher_env_vars : env_var.name => env_var if env_var.secret }

  name = "${local.type_fetcher_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

locals {
  type_fetcher_service_container_def = {
    name        = "${local.type_fetcher_prefix}container"
    image       = "${var.type_fetcher_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    command     = ["type-fetcher"]
    healthCheck = {
      command  = ["CMD", "/hash-graph", "type-fetcher", "--healthcheck"]
      retries  = 5
      interval = 20
      timeout  = 5

    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.type_fetcher_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = [for env_var in var.type_fetcher_env_vars :
    { name = env_var.name, value = env_var.value } if !env_var.secret]

    secrets = [for env_name, ssm_param in aws_ssm_parameter.type_fetcher_env_vars :
    { name = env_name, valueFrom = ssm_param.arn }]

    essential = true
  }
}
