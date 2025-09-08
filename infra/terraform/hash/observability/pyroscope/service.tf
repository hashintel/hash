# ECS Task Definition and Service for Pyroscope

# Configuration hash for task definition versioning
locals {
  config_hash = sha256(jsonencode({
    pyroscope_config = aws_s3_object.pyroscope_config.content
  }))
}

# ECS Task Definition
resource "aws_ecs_task_definition" "pyroscope" {
  family                   = "${local.prefix}-${substr(local.config_hash, 0, 8)}"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 1024
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    # CA certificates setup (shared configuration)
    var.ssl_config.init_container,

    # Pyroscope-specific config-downloader
    {
      name  = "config-downloader"
      image = "amazon/aws-cli:latest"

      command = [
        "s3", "cp",
        "s3://${var.config_bucket.id}/pyroscope/",
        "/etc/pyroscope/",
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
          "awslogs-stream-prefix" = "pyroscope-config-downloader"
        }
      }
    },

    # Main Pyroscope container
    {
      name  = "pyroscope"
      image = "grafana/pyroscope:1.14.1"

      command = [
        "-config.file=/etc/pyroscope/config.yaml"
      ]

      dependsOn = [
        {
          containerName = var.ssl_config.init_container.name
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
          name          = local.http_port_name
          containerPort = local.http_port
          protocol      = "tcp"
        },
        {
          name          = local.grpc_port_name
          containerPort = local.grpc_port
          protocol      = "tcp"
        }
      ]

      readonlyRootFilesystem   = false
      allowPrivilegeEscalation = false

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "pyroscope"
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
    Purpose = "Pyroscope ECS task definition"
  }
}

# ECS Service
resource "aws_ecs_service" "pyroscope" {
  name                   = local.service_name
  cluster                = var.cluster_arn
  task_definition        = aws_ecs_task_definition.pyroscope.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [aws_security_group.pyroscope.id]
  }

  service_connect_configuration {
    enabled   = true
    namespace = var.service_discovery_namespace_arn

    service {
      port_name = local.http_port_name

      client_alias {
        port = local.http_port
      }
    }

    service {
      port_name = local.grpc_port_name

      client_alias {
        port = local.grpc_port
      }
    }
  }

  tags = {
    Name    = local.service_name
    Purpose = "Pyroscope continuous profiling"
  }
}
