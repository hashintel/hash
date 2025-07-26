# OpenTelemetry Collector configuration
locals {
  otel_service_name            = "otel-collector"
  otel_http_container_port     = 4318
  otel_http_port_name          = "${local.otel_service_name}-http"
  otel_http_container_port_dns = "${local.otel_http_port_name}.${aws_service_discovery_private_dns_namespace.app.name}"
  otel_grpc_container_port     = 4317
  otel_grpc_port_name          = "${local.otel_service_name}-grpc"
  otel_grpc_container_port_dns = "${local.otel_grpc_port_name}.${aws_service_discovery_private_dns_namespace.app.name}"

  otel_collector_config = yamlencode({
    receivers = {
      otlp = {
        protocols = {
          grpc = {
            endpoint = "0.0.0.0:${local.otel_grpc_container_port}"
          }
          http = {
            endpoint = "0.0.0.0:${local.otel_http_container_port}"
          }
        }
      }
      # AWS ECS container metrics (current task only)
      awsecscontainermetrics = {
        collection_interval = "30s"
      }
    }
    processors = {
      batch = {}

      # Ory sets the `deployment.environment` attribute to an empty string
      resource = {
        attributes = [
          {
            key    = "deployment.environment"
            action = "delete"
          }
        ]
      }
    }
    exporters = {
      otlphttp = {
        endpoint = "http://${var.telemetry_endpoint_dns}:${var.telemetry_endpoint_http_port}"
        tls = {
          insecure = true
        }
      }
    }
    service = {
      pipelines = {
        traces = {
          receivers  = ["otlp"]
          processors = ["batch", "resource"]
          exporters  = ["otlphttp"]
        }
        metrics = {
          receivers  = ["otlp", "awsecscontainermetrics"]
          processors = ["batch"]
          exporters  = ["otlphttp"]
        }
        logs = {
          receivers  = ["otlp"]
          processors = ["batch"]
          exporters  = ["otlphttp"]
        }
      }
    }
  })
}

# Store configuration in S3
resource "aws_s3_object" "otel_collector_config" {
  bucket  = aws_s3_bucket.app_configs.bucket
  key     = "otelcol/config.yaml"
  content = local.otel_collector_config

  tags = {
    Name    = "${local.prefix}-otel-config"
    Purpose = "OpenTelemetry Collector configuration for app cluster"
  }
}

# ECS Task Definition for OpenTelemetry Collector
resource "aws_ecs_task_definition" "otel_collector" {
  family                   = "${local.prefix}-${local.otel_service_name}-${substr(sha256(aws_s3_object.otel_collector_config.content), 0, 8)}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    # Config downloader container
    {
      name  = "config-downloader"
      image = "amazon/aws-cli:latest"

      command = [
        "s3", "cp",
        "s3://${aws_s3_bucket.app_configs.bucket}/",
        "/etc/",
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
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "config-downloader"
        }
      }
    },

    # Main OpenTelemetry Collector container
    {
      name  = local.otel_service_name
      image = "otel/opentelemetry-collector-contrib:0.128.0"

      cpu    = 256
      memory = 512

      essential = true

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
          name          = local.otel_http_port_name
          containerPort = local.otel_http_container_port
          protocol      = "tcp"
        },
        {
          name          = local.otel_grpc_port_name
          containerPort = local.otel_grpc_container_port
          protocol      = "tcp"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = local.log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = local.otel_service_name
        }
      }
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
    Name    = "${local.prefix}-otel-collector-task"
    Purpose = "OpenTelemetry Collector task definition for app cluster"
  }
}

# Security group for OpenTelemetry Collector
resource "aws_security_group" "otel_collector" {
  name   = "${local.prefix}-otel-collector"
  vpc_id = var.vpc.id

  # Ingress: Allow connections from app services to OTel collector
  ingress {
    from_port   = local.otel_grpc_container_port
    to_port     = local.otel_grpc_container_port
    protocol    = "tcp"
    description = "Allow gRPC connections from app services"
    cidr_blocks = [var.vpc.cidr_block]
  }

  ingress {
    from_port   = local.otel_http_container_port
    to_port     = local.otel_http_container_port
    protocol    = "tcp"
    description = "Allow HTTP connections from app services"
    cidr_blocks = [var.vpc.cidr_block]
  }

  # Standard egress rule for ECS tasks
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "Allow HTTPS for AWS services, Docker Hub, and ECR"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress: Allow sending telemetry to observability cluster
  egress {
    from_port   = var.telemetry_endpoint_http_port
    to_port     = var.telemetry_endpoint_http_port
    protocol    = "tcp"
    description = "Allow sending telemetry to observability cluster"
    cidr_blocks = [var.vpc.cidr_block]
  }

  tags = {
    Name    = "${local.prefix}-otel-collector-sg"
    Purpose = "Security group for OpenTelemetry Collector in app cluster"
  }
}

# ECS Service for OpenTelemetry Collector
resource "aws_ecs_service" "otel_collector" {
  name            = "${var.prefix}-otel-collector"
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.otel_collector.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    security_groups  = [aws_security_group.otel_collector.id]
    assign_public_ip = true
  }

  health_check_grace_period_seconds = 60

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_private_dns_namespace.app.arn

    service {
      discovery_name = "${local.otel_service_name}-http"
      port_name      = local.otel_http_port_name

      client_alias {
        port = local.otel_http_container_port
      }
    }

    service {
      discovery_name = "${local.otel_service_name}-grpc"
      port_name      = local.otel_grpc_port_name

      client_alias {
        port = local.otel_grpc_container_port
      }
    }

    # Service discovery health check configuration
    log_configuration {
      log_driver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "service-connect"
      }
    }
  }

  tags = {
    Name    = "${local.prefix}-otel-collector-service"
    Purpose = "OpenTelemetry Collector service for app cluster to send telemetry to the observability cluster"
  }
}
