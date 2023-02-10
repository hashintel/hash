locals {
  graph_service_name   = "graph"
  graph_prefix         = "${var.prefix}-${local.graph_service_name}"
  graph_param_prefix   = "${local.param_prefix}/${local.graph_service_name}"
  graph_container_port = 4000
}


resource "aws_ssm_parameter" "graph_env_vars" {
  # Only put secrets into SSM
  for_each = { for env_var in var.graph_env_vars : env_var.name => env_var if env_var.secret }

  name = "${local.graph_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

locals {
  graph_service_container_def = {
    name        = "${local.graph_prefix}container"
    image       = "${var.graph_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    healthCheck = {
      command  = ["CMD", "/hash-graph", "server", "--healthcheck"]
      retries  = 5
      interval = 20
      timeout  = 5

    }
    portMappings = [{
      appProtocol   = "http"
      containerPort = local.graph_container_port
      hostPort      = local.graph_container_port
      protocol      = "tcp"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.graph_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = [for env_var in var.graph_env_vars :
    { name = env_var.name, value = env_var.value } if !env_var.secret]

    secrets = [for env_name, ssm_param in aws_ssm_parameter.graph_env_vars :
    { name = env_name, valueFrom = ssm_param.arn }]

    essential = true
  }
}
