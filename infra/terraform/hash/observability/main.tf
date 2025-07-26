# OpenTelemetry-based observability stack with dedicated ECS cluster
# Provides traces, metrics, and logs collection with Grafana stack

# ACM certificate for HTTPS listener
data "aws_acm_certificate" "hash_wildcard_cert" {
  domain      = "*.hash.ai"
  statuses    = ["ISSUED"]
  most_recent = true
}

locals {
  # Shared config-downloader container definition for all services
  config_downloader_container = {
    name  = "config-downloader"
    image = "amazon/aws-cli:latest"

    command = [
      "s3", "cp",
      "s3://${aws_s3_bucket.configs.id}/",
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
        "awslogs-group"         = aws_cloudwatch_log_group.observability.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "config-downloader"
      }
    }
  }
}

# Dedicated ECS cluster for observability stack
resource "aws_ecs_cluster" "observability" {
  name = var.prefix

  service_connect_defaults {
    namespace = aws_service_discovery_private_dns_namespace.observability.arn
  }

  tags = {}
}

resource "aws_ecs_cluster_capacity_providers" "observability" {
  cluster_name       = aws_ecs_cluster.observability.name
  capacity_providers = ["FARGATE"]
}

# OpenTelemetry Collector service
module "otel_collector" {
  source                      = "./otel_collector"
  prefix                      = var.prefix
  cluster_arn                 = aws_ecs_cluster.observability.arn
  vpc                         = var.vpc
  subnets                     = var.subnets
  config_bucket               = aws_s3_bucket.configs
  log_group_name              = aws_cloudwatch_log_group.observability.name
  region                      = var.region
  config_downloader_container = local.config_downloader_container
  service_discovery_namespace = aws_service_discovery_private_dns_namespace.observability.arn
}
