locals {
  migrate_service_name  = "migrate"
  temporal_service_name = "server"
  setup_service_name    = "setup"
  ui_service_name       = "ui"

  temporal_port    = 7233
  temporal_ui_port = 8080

  task_definitions = [
    {
      readonlyRootFilesystem = true

      essential = false
      name      = "${local.prefix}-${local.migrate_service_name}"
      image     = "${module.migrate_ecr.url}:${var.temporal_version}"
      cpu       = 0 # let ECS divvy up the available CPU

      environment = concat(local.temporal_shared_env_vars, local.temporal_migration_env_vars)

      secrets = [
        for env_name, ssm_param in aws_ssm_parameter.temporal_setup_secrets :
        { name = env_name, valueFrom = ssm_param.arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options   = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-stream-prefix" = local.migrate_service_name
          "awslogs-region"        = var.region
        }
      }
    },
    {
      essential   = true
      name        = "${local.prefix}-${local.temporal_service_name}"
      image       = "temporalio/server:${var.temporal_version}"
      cpu         = 0 # let ECS divvy up the available CPU
      dependsOn   = [{ condition = "SUCCESS", containerName = "${local.prefix}-${local.migrate_service_name}" }]
      healthCheck = {
        command     = [
          "CMD", "/bin/sh", "-c", "temporal operator cluster health --address $(hostname):7233 | grep -q SERVING"
        ]
        startPeriod = 10
        interval    = 5
        retries     = 10
        timeout     = 5
      }

      environment = concat(local.temporal_shared_env_vars, local.temporal_env_vars)

      secrets = [
        for env_name, ssm_param in aws_ssm_parameter.temporal_secrets :
        { name = env_name, valueFrom = ssm_param.arn }
      ]

      portMappings = [
        {
          appProtocol   = "grpc"
          containerPort = local.temporal_port
          hostPort      = local.temporal_port
          protocol      = "tcp"
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options   = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-stream-prefix" = local.temporal_service_name
          "awslogs-region"        = var.region
        }
      }
    },
    {
      readonlyRootFilesystem = true

      essential = false
      name      = "${local.prefix}-${local.setup_service_name}"
      image     = "${module.setup_ecr.url}:${var.temporal_version}"
      cpu       = 0 # let ECS divvy up the available CPU
      dependsOn = [
        { condition = "START", containerName = "${local.prefix}-${local.temporal_service_name}" },
      ]

      environment = concat(
        local.temporal_shared_env_vars,
        local.temporal_migration_env_vars,
        [
          # Adjust when setting up the cluster
          { name = "TEMPORAL_BROADCAST_ADDRESS", value = "127.0.0.1" },
        ]
      )

      secrets = [
        for env_name, ssm_param in aws_ssm_parameter.temporal_setup_secrets :
        { name = env_name, valueFrom = ssm_param.arn }
      ]


      logConfiguration = {
        logDriver = "awslogs"
        options   = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-stream-prefix" = local.setup_service_name
          "awslogs-region"        = var.region
        }
      }
    },
    {
      readonlyRootFilesystem = false

      essential = false
      name      = "${local.prefix}-${local.ui_service_name}"
      image       = "temporalio/ui:${var.temporal_ui_version}"
      cpu       = 0 # let ECS divvy up the available CPU
      dependsOn = [
        { condition = "HEALTHY", containerName = "${local.prefix}-${local.temporal_service_name}" },
      ]

      environment = [
        { name = "TEMPORAL_ADDRESS", value = "${aws_lb.net_alb.dns_name}:${local.temporal_port}" }
      ]

      portMappings = [
        {
          appProtocol   = "http"
          containerPort = 8080
          hostPort      = local.temporal_ui_port
          protocol      = "tcp"
        },
      ]

      healthCheck = {
        command     = ["CMD", "/bin/sh", "-c", "nc -z $(hostname) 8080"]
        startPeriod = 10
        interval    = 5
        retries     = 10
        timeout     = 5
      }

      logConfiguration = {
        logDriver = "awslogs"
        options   = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-stream-prefix" = local.ui_service_name
          "awslogs-region"        = var.region
        }
      }
    },
  ]

  temporal_shared_env_vars = [
    { name = "DB", value = "postgres12" }, # For PostgreSQL v12 and later, see https://docs.temporal.io/cluster-deployment-guide#postgresql

    { name = "POSTGRES_SEEDS", value = var.postgres_host },
    { name = "DB_PORT", value = tostring(var.postgres_port) },
    { name = "DBNAME", value = var.postgres_db },
    { name = "VISIBILITY_DBNAME", value = var.postgres_visibility_db },
  ]

  temporal_migration_env_vars = [
    { name = "POSTGRES_USER", value = var.postgres_superuser },
  ]

  temporal_env_vars = [
    { name = "POSTGRES_USER", value = var.postgres_user },
  ]

  temporal_migration_secrets = [
    { name = "POSTGRES_PWD", value = var.postgres_superuser_password },
  ]

  temporal_secrets = [
    { name = "POSTGRES_PWD", value = var.postgres_password },
  ]
}

resource "aws_ssm_parameter" "temporal_secrets" {
  # Only put secrets into SSM
  for_each = { for env_var in local.temporal_secrets : env_var.name => env_var }

  name = "${local.param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = "SecureString"
  value     = sensitive(each.value.value)
  overwrite = true
  tags      = {}
}

resource "aws_ssm_parameter" "temporal_setup_secrets" {
  # Only put secrets into SSM
  for_each = { for env_var in local.temporal_migration_secrets : env_var.name => env_var }

  name = "${local.param_prefix}/migration/${each.value.name}"
  # Still supports non-secret values
  type      = "SecureString"
  value     = sensitive(each.value.value)
  overwrite = true
  tags      = {}
}
