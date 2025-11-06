# OpenTelemetry-based observability stack with dedicated ECS cluster
# Provides traces, metrics, and logs collection with Grafana stack

# ACM certificate for HTTPS listener
data "aws_acm_certificate" "hash_wildcard_cert" {
  domain      = "*.hash.ai"
  statuses    = ["ISSUED"]
  most_recent = true
}

# Dedicated ECS cluster for observability stack
resource "aws_ecs_cluster" "observability" {
  name = var.prefix

  setting {
    name  = "containerInsights"
    value = "enhanced"
  }

  service_connect_defaults {
    namespace = aws_service_discovery_private_dns_namespace.observability.arn
  }

  tags = {}
}

resource "aws_ecs_cluster_capacity_providers" "observability" {
  cluster_name       = aws_ecs_cluster.observability.name
  capacity_providers = ["FARGATE"]
}

# SSL configurations for different service requirements
locals {
  # AWS-specific CA bundle for S3/AWS services
  aws_ca_ssl_config = {
    init_container = {
      name  = "ca-setup"
      image = "busybox:latest"

      command = [
        "sh", "-c",
        "cat > /shared-ssl/ca-certificates.crt << 'EOF'\n${var.amazon_trust_ca_bundle}\nEOF"
      ]

      mountPoints = [
        {
          sourceVolume  = "ssl-certs"
          containerPath = "/shared-ssl"
        }
      ]

      essential = false

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.observability.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "ca-setup"
        }
      }
    }

    volume = {
      name = "ssl-certs"
    }

    mount_point = {
      sourceVolume  = "ssl-certs"
      containerPath = "/usr/local/ssl"
      readOnly      = true
    }

    environment_vars = [
      {
        name  = "SSL_CERT_FILE"
        value = "/usr/local/ssl/ca-certificates.crt"
      }
    ]
  }

  # Full system CA bundle for external HTTPS calls
  full_ca_ssl_config = {
    init_container = {
      name  = "ssl-setup"
      image = "debian:bookworm-slim"

      command = [
        "sh", "-c",
        "apt-get update && apt-get install -y ca-certificates && cp -r /etc/ssl/certs/* /shared-ssl/"
      ]

      mountPoints = [
        {
          sourceVolume  = "ssl-certs"
          containerPath = "/shared-ssl"
        }
      ]

      essential = false

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.observability.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "ssl-setup"
        }
      }
    }

    volume = {
      name = "ssl-certs"
    }

    mount_point = {
      sourceVolume  = "ssl-certs"
      containerPath = "/usr/local/ssl"
      readOnly      = true
    }

    environment_vars = [
      {
        name  = "SSL_CERT_DIR"
        value = "/usr/local/ssl"
      },
      {
        name  = "SSL_CERT_FILE"
        value = "/usr/local/ssl/ca-certificates.crt"
      }
    ]
  }
}

# OpenTelemetry Collector service
module "otel_collector" {
  source                           = "./otel_collector"
  prefix                           = var.prefix
  cluster_arn                      = aws_ecs_cluster.observability.arn
  vpc                              = var.vpc
  subnets                          = var.subnets
  config_bucket                    = aws_s3_bucket.configs
  log_group_name                   = aws_cloudwatch_log_group.observability.name
  region                           = var.region
  service_discovery_namespace_arn  = aws_service_discovery_private_dns_namespace.observability.arn
  service_discovery_namespace_name = aws_service_discovery_private_dns_namespace.observability.name
  tempo_otlp_grpc_dns              = module.tempo.otlp_grpc_dns
  tempo_otlp_grpc_port             = module.tempo.otlp_grpc_port
  loki_http_dns                    = module.loki.http_dns
  loki_http_port                   = module.loki.http_port
  mimir_http_dns                   = module.mimir.http_dns
  mimir_http_port                  = module.mimir.http_port
  grafana_dns                      = module.grafana.grafana_dns
  grafana_port                     = module.grafana.grafana_port
  tempo_api_dns                    = module.tempo.api_dns
  tempo_api_port                   = module.tempo.api_port
  pyroscope_http_dns               = module.pyroscope.http_dns
  pyroscope_http_port              = module.pyroscope.http_port
  alloy_dns                        = module.alloy.http_port_dns
  alloy_port                       = module.alloy.http_port

  ssl_config = local.aws_ca_ssl_config
}

# Tempo service for distributed tracing
module "tempo" {
  source                           = "./tempo"
  prefix                           = var.prefix
  cluster_arn                      = aws_ecs_cluster.observability.arn
  vpc                              = var.vpc
  subnets                          = var.subnets
  config_bucket                    = aws_s3_bucket.configs
  log_group_name                   = aws_cloudwatch_log_group.observability.name
  region                           = var.region
  service_discovery_namespace_arn  = aws_service_discovery_private_dns_namespace.observability.arn
  service_discovery_namespace_name = aws_service_discovery_private_dns_namespace.observability.name
  mimir_http_dns                   = module.mimir.http_dns
  mimir_http_port                  = module.mimir.http_port

  ssl_config = local.aws_ca_ssl_config
}

# Loki service for log aggregation
module "loki" {
  source                           = "./loki"
  prefix                           = var.prefix
  cluster_arn                      = aws_ecs_cluster.observability.arn
  vpc                              = var.vpc
  subnets                          = var.subnets
  config_bucket                    = aws_s3_bucket.configs
  log_group_name                   = aws_cloudwatch_log_group.observability.name
  region                           = var.region
  service_discovery_namespace_arn  = aws_service_discovery_private_dns_namespace.observability.arn
  service_discovery_namespace_name = aws_service_discovery_private_dns_namespace.observability.name

  ssl_config = local.aws_ca_ssl_config
}

# Mimir service for metrics storage
module "mimir" {
  source                           = "./mimir"
  prefix                           = var.prefix
  cluster_arn                      = aws_ecs_cluster.observability.arn
  vpc                              = var.vpc
  subnets                          = var.subnets
  config_bucket                    = aws_s3_bucket.configs
  log_group_name                   = aws_cloudwatch_log_group.observability.name
  region                           = var.region
  service_discovery_namespace_arn  = aws_service_discovery_private_dns_namespace.observability.arn
  service_discovery_namespace_name = aws_service_discovery_private_dns_namespace.observability.name

  ssl_config = local.aws_ca_ssl_config
}

# Pyroscope service for metrics storage
module "pyroscope" {
  source                           = "./pyroscope"
  prefix                           = var.prefix
  cluster_arn                      = aws_ecs_cluster.observability.arn
  vpc                              = var.vpc
  subnets                          = var.subnets
  config_bucket                    = aws_s3_bucket.configs
  log_group_name                   = aws_cloudwatch_log_group.observability.name
  region                           = var.region
  service_discovery_namespace_arn  = aws_service_discovery_private_dns_namespace.observability.arn
  service_discovery_namespace_name = aws_service_discovery_private_dns_namespace.observability.name

  ssl_config = local.aws_ca_ssl_config
}

# Grafana service for distributed tracing visualization
module "grafana" {
  source                                = "./grafana"
  prefix                                = var.prefix
  cluster_arn                           = aws_ecs_cluster.observability.arn
  vpc                                   = var.vpc
  subnets                               = var.subnets
  config_bucket                         = aws_s3_bucket.configs
  log_group_name                        = aws_cloudwatch_log_group.observability.name
  region                                = var.region
  root_url                              = "https://${cloudflare_dns_record.cname_grafana_internal.name}.hash.ai"
  service_discovery_namespace_arn       = aws_service_discovery_private_dns_namespace.observability.arn
  service_discovery_namespace_name      = aws_service_discovery_private_dns_namespace.observability.name
  grafana_database_host                 = var.grafana_database_host
  grafana_database_port                 = var.grafana_database_port
  grafana_database_password             = var.grafana_database_password
  grafana_secret_key                    = var.grafana_secret_key
  tempo_api_dns                         = module.tempo.api_dns
  tempo_api_port                        = module.tempo.api_port
  loki_http_dns                         = module.loki.http_dns
  loki_http_port                        = module.loki.http_port
  mimir_http_dns                        = module.mimir.http_dns
  mimir_http_port                       = module.mimir.http_port
  pyroscope_http_dns                    = module.pyroscope.http_dns
  pyroscope_http_port                   = module.pyroscope.http_port
  external_load_balancer_arn_suffix     = aws_lb.observability_external.arn_suffix
  pagerduty_grafana_aws_integration_key = var.pagerduty_grafana_aws_integration_key

  ssl_config = local.full_ca_ssl_config
}

# Grafana Alloy service for CloudWatch metrics
module "alloy" {
  source                           = "./alloy"
  prefix                           = var.prefix
  cluster_arn                      = aws_ecs_cluster.observability.arn
  vpc                              = var.vpc
  subnets                          = var.subnets
  config_bucket                    = aws_s3_bucket.configs
  log_group_name                   = aws_cloudwatch_log_group.observability.name
  region                           = var.region
  service_discovery_namespace_arn  = aws_service_discovery_private_dns_namespace.observability.arn
  service_discovery_namespace_name = aws_service_discovery_private_dns_namespace.observability.name
  mimir_http_dns                   = module.mimir.http_dns
  mimir_http_port                  = module.mimir.http_port
  pyroscope_http_dns               = module.pyroscope.http_dns
  pyroscope_http_port              = module.pyroscope.http_port

  ssl_config = local.aws_ca_ssl_config
}
