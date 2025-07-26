# ECS Task Definition and Service for Tempo

# Configuration hash for task definition versioning
locals {
  config_hash = sha256(jsonencode({
    tempo_config = aws_s3_object.tempo_config.content
  }))
}

# ECS Task Definition
resource "aws_ecs_task_definition" "tempo" {
  family                   = "${local.prefix}-${substr(local.config_hash, 0, 8)}"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 2048
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    # SSL certificates setup (shared configuration)
    var.ssl_config.init_container,

    # Tempo-specific config-downloader
    {
      name  = "config-downloader"
      image = "amazon/aws-cli:latest"

      command = [
        "s3", "cp",
        "s3://${var.config_bucket.id}/tempo/",
        "/etc/tempo/",
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
          "awslogs-stream-prefix" = "tempo-config-downloader"
        }
      }
    },

    # Main Tempo container
    {
      name  = "tempo"
      image = "grafana/tempo:2.8.1"

      command = [
        "-config.file=/etc/tempo/config.yaml"
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
          name          = local.otlp_grpc_port_name
          containerPort = local.otlp_port
          protocol      = "tcp"
        },
        {
          name          = local.api_port_name
          containerPort = local.api_port
          protocol      = "tcp"
        }
      ]

      healthCheck = {
        command     = ["CMD", "wget", "--spider", "-q", "http://localhost:${local.api_port}/status"]
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
          "awslogs-stream-prefix" = "tempo"
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
    Purpose = "Tempo ECS task definition"
  }
}

# ECS Service
resource "aws_ecs_service" "tempo" {
  name                   = local.service_name
  cluster                = var.cluster_arn
  task_definition        = aws_ecs_task_definition.tempo.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [aws_security_group.tempo.id]
  }

  service_connect_configuration {
    enabled   = true
    namespace = var.service_discovery_namespace_arn

    service {
      port_name = local.otlp_grpc_port_name

      client_alias {
        port = local.otlp_port
      }
    }

    service {
      port_name = local.api_port_name

      client_alias {
        port = local.api_port
      }
    }
  }

  tags = {
    Name    = local.service_name
    Purpose = "Tempo distributed tracing"
  }
}
