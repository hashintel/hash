# ECS Task Definition and Service for OpenTelemetry Collector

# Configuration hash for task definition versioning
locals {
  config_hash = sha256(jsonencode({
    otel_collector_config = aws_s3_object.otel_collector_config.content
  }))
}

# ECS Task Definition
resource "aws_ecs_task_definition" "otel_collector" {
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

    # OpenTelemetry Collector-specific config-downloader
    {
      name  = "config-downloader"
      image = "amazon/aws-cli:latest"

      command = [
        "s3", "cp",
        "s3://${var.config_bucket.id}/otelcol/",
        "/etc/otelcol/",
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
          "awslogs-stream-prefix" = "otelcol-config-downloader"
        }
      }
    },

    # Main OpenTelemetry Collector container
    {
      name  = "otel-collector"
      image = "otel/opentelemetry-collector-contrib:0.128.0"

      command = [
        "--config=/etc/otelcol/config.yaml"
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
        # Internal ports with names for Service Connect
        {
          name          = local.grpc_port_name_internal
          containerPort = local.grpc_port_internal
          protocol      = "tcp"
        },
        {
          name          = local.http_port_name_internal
          containerPort = local.http_port_internal
          protocol      = "tcp"
        },

        # External ports without names (ALB only)
        {
          containerPort = local.grpc_port_external
          protocol      = "tcp"
        },
        {
          containerPort = local.http_port_external
          protocol      = "tcp"
        },
        {
          containerPort = local.health_port
          protocol      = "tcp"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "otel-collector"
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
    Name    = local.service_name
    Purpose = "OpenTelemetry Collector"
  }
}

# ECS Service
resource "aws_ecs_service" "otel_collector" {
  name                   = local.service_name
  cluster                = var.cluster_arn
  task_definition        = aws_ecs_task_definition.otel_collector.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [aws_security_group.otel_collector.id]
  }

  service_connect_configuration {
    enabled   = true
    namespace = var.service_discovery_namespace_arn

    # Only internal ports are exposed via Service Connect
    service {
      port_name = local.grpc_port_name_internal

      client_alias {
        port = local.grpc_port_internal
      }
    }

    service {
      port_name = local.http_port_name_internal

      client_alias {
        port = local.http_port_internal
      }
    }
  }

  # Internal ALB target groups
  load_balancer {
    target_group_arn = aws_lb_target_group.http_internal.arn
    container_name   = "otel-collector"
    container_port   = local.http_port_internal
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.grpc_internal.arn
    container_name   = "otel-collector"
    container_port   = local.grpc_port_internal
  }

  # External ALB target groups
  load_balancer {
    target_group_arn = aws_lb_target_group.http_external.arn
    container_name   = "otel-collector"
    container_port   = local.http_port_external
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.grpc_external.arn
    container_name   = "otel-collector"
    container_port   = local.grpc_port_external
  }

  tags = {
    Name    = local.service_name
    Purpose = "OpenTelemetry Collector"
  }
}
