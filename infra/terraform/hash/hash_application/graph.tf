locals {
  graph_service_name        = "graph"
  graph_prefix              = "${var.prefix}-${local.graph_service_name}"
  graph_param_prefix        = "${local.param_prefix}/${local.graph_service_name}"
  graph_container_port      = 4000
  graph_container_port_name = local.graph_service_name
  graph_container_port_dns  = "${local.graph_container_port_name}.${aws_service_discovery_private_dns_namespace.app.name}"
}


resource "aws_ssm_parameter" "graph_migration_env_vars" {
  # Only put secrets into SSM
  for_each = {for env_var in var.graph_migration_env_vars : env_var.name => env_var if env_var.secret}

  name      = "${local.graph_param_prefix}/migration/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

resource "aws_ssm_parameter" "graph_env_vars" {
  # Only put secrets into SSM
  for_each = {for env_var in var.graph_env_vars : env_var.name => env_var if env_var.secret}

  name      = "${local.graph_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

resource "aws_security_group" "graph" {
  name   = local.graph_prefix
  vpc_id = var.vpc.id

  egress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    description     = "Allow Fargate to pull images from the private registry"
    prefix_list_ids = [data.aws_vpc_endpoint.s3.prefix_list_id]
  }
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "Fargate tasks must have outbound access to allow outgoing traffic and access Amazon ECS endpoints."
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    description = "Allow connections to Postgres within the VPC"
    cidr_blocks = [var.vpc.cidr_block]
  }
  egress {
    from_port   = 4444
    to_port     = 4444
    protocol    = "tcp"
    description = "Allow connections with the type fetcher"
    cidr_blocks = [var.vpc.cidr_block]
  }

  egress {
    from_port   = local.spicedb_container_http_port
    to_port     = local.spicedb_container_http_port
    protocol    = "tcp"
    description = "Allow communication to SpiceDB"
    cidr_blocks = [var.vpc.cidr_block]
  }

  egress {
    from_port   = var.temporal_port
    to_port     = var.temporal_port
    protocol    = "tcp"
    description = "Allow outbound gRPC connections to Temporal"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = local.graph_container_port
    to_port     = local.graph_container_port
    protocol    = "tcp"
    description = "Allow communication with the graph"
    cidr_blocks = [var.vpc.cidr_block]
  }
}

resource "aws_ecs_task_definition" "graph" {
  family                   = local.graph_prefix
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn
  container_definitions    = jsonencode([for task_def in local.graph_task_defs : task_def.task_def])
  tags                     = {}
}

resource "aws_ecs_service" "graph" {
  depends_on             = [aws_iam_role.task_role]
  name                   = local.graph_prefix
  cluster                = data.aws_ecs_cluster.ecs.arn
  task_definition        = aws_ecs_task_definition.graph.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [
      aws_security_group.graph.id,
    ]
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_private_dns_namespace.app.arn

    service {
      port_name = local.graph_container_port_name

      client_alias {
        port = local.graph_container_port
      }
    }
  }
}

locals {
  graph_migration_container_def = {
    name             = "${local.graph_prefix}-migration"
    image            = "${var.graph_image.url}:latest"
    cpu              = 0 # let ECS divvy up the available CPU
    mountPoints      = []
    volumesFrom      = []
    command          = ["migrate"]
    logConfiguration = {
      logDriver = "awslogs"
      options   = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.graph_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = [
      for env_var in var.graph_migration_env_vars :
      { name = env_var.name, value = env_var.value } if !env_var.secret
    ]

    secrets = [
      for env_name, ssm_param in aws_ssm_parameter.graph_migration_env_vars :
      { name = env_name, valueFrom = ssm_param.arn }
    ]

    essential = false
  }
  graph_service_container_def = {
    name        = local.graph_prefix
    image       = "${var.graph_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    dependsOn   = [
      { condition = "SUCCESS", containerName = local.graph_migration_container_def.name },
    ]
    command     = ["server"]
    healthCheck = {
      command  = ["CMD", "/hash-graph", "server", "--healthcheck"]
      retries  = 5
      interval = 20
      timeout  = 5

    }
    portMappings = [
      {
        name          = local.graph_container_port_name
        appProtocol   = "http"
        containerPort = local.graph_container_port
        protocol      = "tcp"
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options   = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.graph_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = concat([
      for env_var in var.graph_env_vars :
      { name = env_var.name, value = env_var.value } if !env_var.secret
    ],
      [
        { name = "HASH_GRAPH_API_HOST", value = "0.0.0.0" },
        { name = "HASH_GRAPH_API_PORT", value = tostring(local.graph_container_port) },
        { name = "HASH_GRAPH_TYPE_FETCHER_HOST", value = local.type_fetcher_container_port_dns },
        { name = "HASH_GRAPH_TYPE_FETCHER_PORT", value = tostring(local.type_fetcher_container_port) },
        { name = "HASH_SPICEDB_HOST", value = "http://${local.spicedb_container_http_port_dns}" },
        { name = "HASH_SPICEDB_HTTP_PORT", value = tostring(local.spicedb_container_http_port) },
        { name = "HASH_TEMPORAL_SERVER_HOST", value = var.temporal_host },
        { name = "HASH_TEMPORAL_SERVER_PORT", value = var.temporal_port },
      ]
    )

    secrets = [
      for env_name, ssm_param in aws_ssm_parameter.graph_env_vars :
      { name = env_name, valueFrom = ssm_param.arn }
    ]

    essential = true
  }
}
