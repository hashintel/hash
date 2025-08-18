# ECS Task Definition and Service for Grafana Alloy

# Configuration hash for task definition versioning
locals {
  config_hash = sha256(jsonencode({
    alloy_config = aws_s3_object.alloy_config.content
  }))
}

# ECS Task Definition
resource "aws_ecs_task_definition" "alloy" {
  family                   = "${local.prefix}-${substr(local.config_hash, 0, 8)}"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    # CA certificates setup (shared configuration)
    var.ssl_config.init_container,

    # Config downloader
    {
      name  = "config-downloader"
      image = "amazon/aws-cli:latest"

      command = [
        "s3", "cp",
        "s3://${var.config_bucket.id}/alloy/",
        "/etc/alloy/",
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
          "awslogs-stream-prefix" = "alloy-config-downloader"
        }
      }
    },

    # Main Grafana Alloy container
    {
      name  = "alloy"
      image = "grafana/alloy:v1.10.1"

      command = ["run", "/etc/alloy/config.alloy", "--server.http.listen-addr=0.0.0.0:5000"]

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

      environment = concat([
        {
          name  = "AWS_REGION"
          value = var.region
        },
        {
          name  = "AWS_DEFAULT_REGION"
          value = var.region
        }
      ], var.ssl_config.environment_vars)

      portMappings = [
        {
          name          = local.http_port_name
          containerPort = local.http_port
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
    Purpose = "Grafana Alloy ECS task definition"
  }
}

# ECS Service
resource "aws_ecs_service" "alloy" {
  name                   = local.service_name
  cluster                = var.cluster_arn
  task_definition        = aws_ecs_task_definition.alloy.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [aws_security_group.alloy.id]
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
  }

  tags = {
    Name    = local.service_name
    Purpose = "Grafana Alloy CloudWatch metrics receiver"
  }
}
