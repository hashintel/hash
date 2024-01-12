locals {
  task_definitions = [
    {
      essential   = true
      name        = local.prefix
      image       = "${module.worker.url}:latest"
      cpu         = 0 # let ECS divvy up the available CPU
      healthCheck = {
        command     = var.ecs_health_check
        startPeriod = 10
        interval    = 10
        retries     = 10
        timeout     = 5
      }

      environment = concat([
        { name = "HASH_TEMPORAL_SERVER_HOST", value = var.temporal_host },
        { name = "HASH_TEMPORAL_SERVER_PORT", value = var.temporal_port },
      ],
        [for env_var in var.env_vars : { name = env_var.name, value = env_var.value } if !env_var.secret]
      )

      secrets = [
        for env_name, ssm_param in aws_ssm_parameter.secret_env_vars :
        { name = env_name, valueFrom = ssm_param.arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options   = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-stream-prefix" = var.worker_name
          "awslogs-region"        = var.region
        }
      }
    },
  ]

  shared_env_vars = [
    { name = "HASH_TEMPORAL_SERVER_HOST", value = var.temporal_host },
    { name = "HASH_TEMPORAL_SERVER_PORT", value = var.temporal_port },
  ]

  shared_secrets = [
    for env_name, ssm_param in aws_ssm_parameter.secret_env_vars :
    { name = env_name, valueFrom = ssm_param.arn }
  ]
}


resource "aws_ssm_parameter" "secret_env_vars" {
  # Only put secrets into SSM
  for_each = {for env_var in var.env_vars : env_var.name => env_var if env_var.secret}

  name      = "${local.param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = "SecureString"
  value     = sensitive(each.value.value)
  overwrite = true
  tags      = {}
}
