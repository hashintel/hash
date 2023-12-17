locals {
  type_fetcher_service_name        = "typefetcher"
  type_fetcher_prefix              = "${var.prefix}-${local.type_fetcher_service_name}"
  type_fetcher_param_prefix        = "${local.param_prefix}/${local.type_fetcher_service_name}"
  type_fetcher_container_port      = 4444
  type_fetcher_container_port_name = local.type_fetcher_service_name
  type_fetcher_container_port_dns  = "localhost"
}

locals {
  type_fetcher_service_container_def = {
    name        = "${local.type_fetcher_prefix}container"
    image       = "${var.type_fetcher_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    command     = ["type-fetcher"]
    healthCheck = {
      command  = ["CMD", "/hash-graph", "type-fetcher", "--healthcheck"]
      retries  = 5
      interval = 20
      timeout  = 5

    }
    logConfiguration = {
      logDriver = "awslogs"
      options   = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.type_fetcher_service_name
        "awslogs-region"        = var.region
      }
    }

    Environment = [
      { name = "HASH_GRAPH_TYPE_FETCHER_HOST", value = "0.0.0.0" },
      { name = "HASH_GRAPH_TYPE_FETCHER_PORT", value = tostring(local.type_fetcher_container_port) },
    ]

    essential = true
  }
}
