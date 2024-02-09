locals {
  temporal_worker_integration_service_name = "worker-integration"
  temporal_worker_integration_prefix       = "${var.prefix}-${local.temporal_worker_integration_service_name}"
  temporal_worker_integration_param_prefix = "${local.param_prefix}/worker/integration"
}

locals {
  temporal_worker_integration_service_container_def = {
    essential   = true
    name        = local.temporal_worker_integration_prefix
    image       = "${var.temporal_worker_integration_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    healthCheck = {
      command     = ["CMD", "/bin/sh", "-c", "curl -f http://localhost:4300/health || exit 1"]
      startPeriod = 10
      interval    = 10
      retries     = 10
      timeout     = 5
    }

    logConfiguration = {
      logDriver = "awslogs"
      options   = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.temporal_worker_integration_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = concat(
      [
        { name = "HASH_TEMPORAL_SERVER_HOST", value = var.temporal_host },
        { name = "HASH_TEMPORAL_SERVER_PORT", value = var.temporal_port },
        { name = "HASH_GRAPH_API_HOST", value = local.graph_container_port_dns },
        { name = "HASH_GRAPH_API_PORT", value = tostring(local.graph_container_port) },
      ],
    )

    essential = true
  }
}
