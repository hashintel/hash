# ECS Task Definition and Service for Grafana

# Configuration hash for task definition versioning
locals {
  config_hash = sha256(jsonencode({
    grafana_config   = aws_s3_object.grafana_config.content
    tempo_datasource = aws_s3_object.grafana_tempo_datasource.content
  }))
}

# SSM Parameters for Grafana secrets
resource "aws_ssm_parameter" "grafana_env_vars" {
  for_each = {
    "GF_DATABASE_PASSWORD"   = var.grafana_database_password
    "GF_SECURITY_SECRET_KEY" = var.grafana_secret_key
  }

  name      = "/${var.prefix}/grafana/${each.key}"
  type      = "SecureString"
  value     = sensitive(each.value)
  overwrite = true
  tags      = {}
}

# ECS Task Definition
resource "aws_ecs_task_definition" "grafana" {
  family                   = "${local.prefix}-${substr(local.config_hash, 0, 8)}"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    # SSL certificates setup (shared configuration)
    var.ssl_config.init_container,

    # Grafana-specific config-downloader
    {
      name  = "config-downloader"
      image = "amazon/aws-cli:latest"

      command = [
        "s3", "cp",
        "s3://${var.config_bucket.id}/${local.service_name}/",
        "/etc/grafana/",
        "--recursive"
      ]

      mountPoints = [
        {
          sourceVolume  = "config"
          containerPath = "/etc"
        }
      ]

      essential = false

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "grafana-config-downloader"
        }
      }
    },

    # Main Grafana container
    {
      name  = "grafana"
      image = "grafana/grafana:12.1.0"

      dependsOn = [
        {
          containerName = "ssl-setup"
          condition     = "SUCCESS"
        },
        {
          containerName = "config-downloader"
          condition     = "SUCCESS"
        }
      ]

      mountPoints = [
        {
          sourceVolume  = "config"
          containerPath = "/etc"
          readOnly      = false
        },
        var.ssl_config.mount_point
      ]

      environment = var.ssl_config.environment_vars

      secrets = [
        for env_name, ssm_param in aws_ssm_parameter.grafana_env_vars :
        { name = env_name, valueFrom = ssm_param.arn }
      ]

      portMappings = [
        {
          name          = local.grafana_port_name
          containerPort = local.grafana_port
          protocol      = "tcp"
        }
      ]

      healthCheck = {
        command     = ["CMD", "curl", "-f", "http://localhost:${local.grafana_port}/api/health"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      readonlyRootFilesystem   = false
      allowPrivilegeEscalation = false

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = local.service_name
        }
      }

      essential = true
    }
  ])

  volume {
    name = "config"
  }

  dynamic "volume" {
    for_each = [var.ssl_config.volume]
    content {
      name = volume.value.name
    }
  }

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  tags = {
    Name    = "${local.prefix}-task-definition"
    Purpose = "Grafana ECS task definition"
  }
}

# ECS Service
resource "aws_ecs_service" "grafana" {
  name                   = local.service_name
  cluster                = var.cluster_arn
  task_definition        = aws_ecs_task_definition.grafana.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [aws_security_group.grafana.id]
  }

  service_connect_configuration {
    enabled   = true
    namespace = var.service_discovery_namespace_arn

    service {
      port_name = local.grafana_port_name

      client_alias {
        port = local.grafana_port
      }
    }
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.grafana.arn
    container_name   = "grafana"
    container_port   = local.grafana_port
  }

  tags = {
    Name    = local.service_name
    Purpose = "Grafana observability dashboard"
  }
}
