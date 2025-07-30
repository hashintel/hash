# ECS Task Definition and Service for Loki

# Configuration hash for task definition versioning
locals {
  config_hash = sha256(jsonencode({
    loki_config = aws_s3_object.loki_config.content
  }))
}

# ECS Task Definition
resource "aws_ecs_task_definition" "loki" {
  family                   = "${local.prefix}-${substr(local.config_hash, 0, 8)}"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 1024
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    # SSL certificates setup (shared configuration)
    var.ssl_config.init_container,

    # Loki-specific config-downloader
    {
      name  = "config-downloader"
      image = "amazon/aws-cli:latest"

      command = [
        "s3", "cp",
        "s3://${var.config_bucket.id}/loki/",
        "/etc/loki/",
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
          "awslogs-stream-prefix" = "loki-config-downloader"
        }
      }
    },

    # Main Loki container
    {
      name  = "loki"
      image = "grafana/loki:3.5.2"

      command = [
        "-config.file=/etc/loki/config.yaml"
      ]

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
          readOnly      = true
        },
        var.ssl_config.mount_point
      ]

      environment = var.ssl_config.environment_vars

      portMappings = [
        {
          name          = local.api_port_name
          containerPort = local.api_port
          protocol      = "tcp"
        }
      ]

      healthCheck = {
        command     = ["CMD", "wget", "--spider", "-q", "http://localhost:${local.api_port}/ready"]
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
          "awslogs-stream-prefix" = "loki"
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

  tags = {
    Name    = "${local.prefix}-task-definition"
    Purpose = "Loki ECS task definition"
  }
}

# ECS Service
resource "aws_ecs_service" "loki" {
  name                   = local.service_name
  cluster                = var.cluster_arn
  task_definition        = aws_ecs_task_definition.loki.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [aws_security_group.loki.id]
  }

  service_connect_configuration {
    enabled   = true
    namespace = var.service_discovery_namespace_arn

    service {
      port_name = local.api_port_name

      client_alias {
        port = local.api_port
      }
    }
  }

  tags = {
    Name    = local.service_name
    Purpose = "Loki log aggregation"
  }
}