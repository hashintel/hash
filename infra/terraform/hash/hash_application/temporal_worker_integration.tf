locals {
  temporal_worker_integration_service_name   = "worker-integration"
  temporal_worker_integration_prefix         = "${var.prefix}-${local.temporal_worker_integration_service_name}"
  temporal_worker_integration_param_prefix   = "${local.param_prefix}/worker/integration"
}

resource "aws_ssm_parameter" "temporal_worker_integration_env_vars" {
  # Only put secrets into SSM
  for_each = { for env_var in var.temporal_worker_integration_env_vars : env_var.name => env_var if env_var.secret }

  name = "${local.temporal_worker_integration_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

locals {
  temporal_worker_integration_service_container_def = {
    essential = true
    name      = local.temporal_worker_integration_prefix
    image     = "${var.temporal_worker_integration_image.url}:latest"
    cpu       = 0 # let ECS divvy up the available CPU
    healthCheck = {
      command     = ["CMD", "/bin/sh", "-c", "curl -f http://localhost:4300/health || exit 1"]
      startPeriod = 10
      interval    = 10
      retries     = 10
      timeout     = 5
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.temporal_worker_integration_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = concat(
      [
        { name = "HASH_TEMPORAL_HOST", value = var.temporal_host },
        { name = "HASH_TEMPORAL_PORT", value = var.temporal_port },
      ],
      [for env_var in var.temporal_worker_integration_env_vars : { name = env_var.name, value = env_var.value } if !env_var.secret]
    )

    secrets = [for env_name, ssm_param in aws_ssm_parameter.temporal_worker_integration_env_vars :
      { name = env_name, valueFrom = ssm_param.arn }]

    essential = true
  }
}
