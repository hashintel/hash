# ECS Task Definition and Service for OpenTelemetry Collector

# ECS Task Definition
resource "aws_ecs_task_definition" "otel_collector" {
  family                   = "${local.prefix}-${substr(sha256(aws_s3_object.otel_collector_config.content), 0, 8)}"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    # Shared config-downloader from parent module
    var.config_downloader_container,

    # Main OpenTelemetry Collector container
    {
      name  = "otel-collector"
      image = "otel/opentelemetry-collector-contrib:0.128.0"

      command = [
        "--config=/etc/otelcol/config.yaml"
      ]

      dependsOn = [
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
        }
      ]

      portMappings = [
        {
          name          = local.grpc_port_name
          containerPort = local.grpc_port
          protocol      = "tcp"
        },
        {
          name          = local.http_port_name
          containerPort = local.http_port
          protocol      = "tcp"
        },
        {
          name          = local.health_port_name
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

  load_balancer {
    target_group_arn = aws_lb_target_group.http.arn
    container_name   = local.service_name
    container_port   = local.http_port
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.grpc.arn
    container_name   = local.service_name
    container_port   = local.grpc_port
  }

  service_connect_configuration {
    enabled   = true
    namespace = var.service_discovery_namespace

    service {
      port_name = local.grpc_port_name

      client_alias {
        port = local.grpc_port
      }
    }

    service {
      port_name = local.http_port_name

      client_alias {
        port = local.http_port
      }
    }
  }

  tags = {
    Name    = local.service_name
    Purpose = "OpenTelemetry Collector"
  }
}
