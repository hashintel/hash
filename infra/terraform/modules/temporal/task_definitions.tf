locals {
  migrate_service_name  = "migrate"
  temporal_service_name = "server"
  setup_service_name    = "setup"
  ui_service_name       = "ui"

  temporal_port    = 7233
  temporal_ui_port = 8080

  task_definitions = [
    {

      # To remove, only for testing.
      essential = true
      name      = "${local.prefix}pgtemporary"
      image     = "postgres:15"
      environment = [
        { name = "POSTGRES_DB", value = "temporal" },
        { name = "POSTGRES_USER", value = "postgres" },
        { name = "POSTGRES_PASSWORD", value = "postgres" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-stream-prefix" = "pg"
          "awslogs-region"        = var.region
        }
      }
      portMappings = [
        {
          appProtocol   = "http"
          containerPort = 5432
          hostPort      = 5432
          protocol      = "tcp"
        },
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "pg_isready"]
        startPeriod = 10
        interval    = 5
        retries     = 10
        timeout     = 5
      }

    },
    {
      readonlyRootFilesystem = true

      essential = false
      name      = "${local.prefix}${local.migrate_service_name}"
      image     = "${module.migrate.url}:${local.temporal_version}"
      cpu       = 0 # let ECS divvy up the available CPU
      dependsOn = [
        # to delete
        { condition = "HEALTHY", containerName = "${local.prefix}pgtemporary" },
      ]

      environment = concat(local.shared_env_vars,
        # container specific env vars go here
        [
          { name = "SKIP_DB_CREATE", value = "true" },
          { name = "SKIP_VISIBILITY_DB_CREATE", value = "false" },
        ]
      )

      secrets = local.shared_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-stream-prefix" = local.migrate_service_name
          "awslogs-region"        = var.region
        }
      }
    },
    {
      essential = true
      name      = "${local.prefix}${local.temporal_service_name}"
      image     = "temporalio/server:${local.temporal_version}"
      cpu       = 0 # let ECS divvy up the available CPU
      dependsOn = [{ condition = "SUCCESS", containerName = "${local.prefix}${local.migrate_service_name}" }]
      healthCheck = {
        # If we just want to for when the socket accepts connections, we can use this:
        # command     = ["CMD", "/bin/sh", "-c", "nc -z $(hostname) 7233"]

        # This checks that the server is up and running
        command     = ["CMD", "/bin/sh", "-c", "temporal operator cluster health --address $(hostname):7233 | grep -q SERVING"]
        startPeriod = 10
        interval    = 5
        retries     = 10
        timeout     = 5
      }

      environment = concat(local.shared_env_vars,
        # container specific env vars go here
        [
        ]
      )

      secrets = local.shared_secrets

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
        options = {
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
      name      = "${local.prefix}${local.setup_service_name}"
      image     = "${module.migrate.url}:${local.temporal_version}"
      cpu       = 0 # let ECS divvy up the available CPU
      dependsOn = [
        { condition = "START", containerName = "${local.prefix}${local.temporal_service_name}" },
      ]

      environment = concat(local.shared_env_vars,
        # container specific env vars go here
        [
        ]
      )

      secrets = local.shared_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-stream-prefix" = local.setup_service_name
          "awslogs-region"        = var.region
        }
      }
    },
  ]

  shared_env_vars = [
    { name = "DB", value = "postgres12" },
    { name = "DB_PORT", value = "5432" },
    { name = "DBNAME", value = "temporal" },
    { name = "VISIBILITY_DBNAME", value = "high_vis" },
  ]

  secret_raw_vars = [
    # TODO: parameterize module
    { name = "POSTGRES_USER", value = "postgres" },
    { name = "POSTGRES_PWD", value = "postgres" },
    { name = "POSTGRES_SEEDS", value = "localhost" },
  ]

  shared_secrets = [for env_name, ssm_param in aws_ssm_parameter.secret_env_vars :
  { name = env_name, valueFrom = ssm_param.arn }]
}


resource "aws_ssm_parameter" "secret_env_vars" {
  # Only put secrets into SSM
  for_each = { for env_var in local.secret_raw_vars : env_var.name => env_var }

  name = "${local.param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = "SecureString"
  value     = sensitive(each.value.value)
  overwrite = true
  tags      = {}
}
