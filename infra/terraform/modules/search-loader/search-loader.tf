locals {
  container_name  = "${local.prefix}-searchloadermain"
  container_port  = 5001
  log_group_name  = "${local.prefix}-searchloaderlog"
  redis_nodes     = data.terraform_remote_state.redis.outputs.redis_nodes
  opensearch_arn  = data.terraform_remote_state.opensearch.outputs.opensearch_arn
  opensearch_host = data.terraform_remote_state.opensearch.outputs.opensearch_vpc_endpoint
  ecr_arn         = data.terraform_remote_state.base.outputs.searchloader_ecr_arn
  ecr_url         = data.terraform_remote_state.base.outputs.searchloader_ecr_url
  vpc_id          = data.terraform_remote_state.base.outputs.vpc_id
}


resource "aws_ssm_parameter" "pg_password" {
  name        = "${local.prefix}-searchloaderpgpassword"
  description = "Postgres password for the SearchLoader's database user"
  type        = "SecureString"
  value       = var.pg_password
  overwrite   = true
  tags        = {}
}

# IAM role which allows ECS to pull the search-loader Docker image from ECR
resource "aws_iam_role" "execution_role" {
  name = "${local.prefix}-searchloaderexecution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      },
    ]
  })
  inline_policy {
    name = "policy"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage",
          ]
          Resource = [local.ecr_arn]
        },
        {
          Effect = "Allow"
          Action = [
            "ecr:GetAuthorizationToken",
          ]
          Resource = ["*"]
        },
        {
          Effect = "Allow"
          Action = [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ]
          Resource = ["*"]
        },
        {
          Effect = "Allow"
          Action = ["ssm:GetParameters"]
          Resource = [
            aws_ssm_parameter.pg_password.arn,
          ]
        },
      ]
    })
  }
}

resource "aws_iam_role" "task_role" {
  name = "${local.prefix}-searchloadertask"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      },
    ]
  })
  inline_policy {
    name = "policy"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            # @todo: restrict actions to only those required
            # https://docs.aws.amazon.com/opensearch-service/latest/developerguide/ac.html
            "es:*"
          ]
          Resource = "${local.opensearch_arn}/*"
        },
        {
          Effect = "Allow"
          Action = ["ssm:GetParameters"]
          Resource = [
            aws_ssm_parameter.pg_password.arn,
          ]
        }
      ]
    })
  }
}

resource "aws_ecs_task_definition" "task" {
  family                   = "${local.prefix}-searchloadertask"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024 # @todo: set as variable
  memory                   = 2048 # @todo: set as variable
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn
  container_definitions = jsonencode([{
    name  = local.container_name
    image = "${local.ecr_url}:${var.image_tag}"
    portMappings = [
      {
        containerPort = local.container_port
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = "searchloader"
        "awslogs-region"        = var.region
      }
    }
    environment = [
      {
        name  = "NODE_ENV"
        value = "production"
      },
      {
        name  = "HTTPS_ENABLED"
        value = "1"
      },
      {
        name  = "HASH_PG_HOST"
        value = var.pg_host
      },
      {
        name  = "HASH_PG_PORT"
        value = tostring(var.pg_port)
      },
      {
        name  = "HASH_PG_DATABASE"
        value = var.pg_database
      },
      {
        name  = "HASH_PG_USER"
        value = var.pg_user
      },
      {
        # value must match the same environment variable in the realtime service
        name  = "HASH_SEARCH_QUEUE_NAME"
        value = "search"
      },
      {
        name  = "HASH_REDIS_HOST"
        value = local.redis_nodes[0].address
      },
      {
        name  = "HASH_REDIS_PORT"
        value = tostring(local.redis_nodes[0].port)
      },
      {
        name = "HASH_REDIS_ENCRYPTED_TRANSIT",
        value = "true"
      },
      {
        name  = "HASH_OPENSEARCH_ENABLED"
        value = "true"
      },
      {
        name  = "HASH_OPENSEARCH_HOST"
        value = local.opensearch_host
      },
      {
        name = "HASH_OPENSEARCH_PORT"
        // OpenSearch is port 80 or 443 on AWS, not 9200.
        value = "443"
      },
      {
        name  = "HASH_OPENSEARCH_HTTPS_ENABLED"
        value = "1"
      },
      {
        name  = "SYSTEM_ACCOUNT_NAME"
        value = "HASH"
      },
      {
        name  = "SYSTEM_ACCOUNT_SHORTNAME"
        value = "hash"
      },
    ]
    secrets = [
      {
        name      = "HASH_PG_PASSWORD"
        valueFrom = aws_ssm_parameter.pg_password.arn
      },
    ]
  }])
  tags = {}
}

resource "aws_security_group" "vpc_only" {
  name   = "${local.prefix}-searchloader1"
  vpc_id = local.vpc_id

  ingress {
    from_port = local.container_port
    to_port   = local.container_port
    protocol  = "tcp"

    # Allow connections only from within the VPC
    cidr_blocks = [
      data.terraform_remote_state.base.outputs.vpc_cidr_block
    ]
  }
  egress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    # See https://docs.aws.amazon.com/opensearch-service/latest/developerguide/supported-resources.html for more info on
    # why it's port 443
    description = "Allow connections to OpenSearch within the VPC"
    cidr_blocks = [data.terraform_remote_state.base.outputs.vpc_cidr_block]
  }
  egress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    description     = "Allow Fargate to pull images from the private registry"
    prefix_list_ids = [data.terraform_remote_state.base.outputs.s3_endpoint_prefix_list]
  }
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    description = "Allow connections to Postgres within the VPC"
    cidr_blocks = [data.terraform_remote_state.base.outputs.vpc_cidr_block]
  }
  tags = {
    Environment = "dev"
  }
}

resource "aws_ecs_service" "svc" {
  name            = "${local.prefix}-searchloadersvc"
  cluster         = data.terraform_remote_state.base.outputs.ecs_cluster_arn
  task_definition = aws_ecs_task_definition.task.arn
  desired_count   = 1 # @todo: set as variable
  launch_type     = "FARGATE"
  network_configuration {
    subnets = [
      data.terraform_remote_state.base.outputs.subnet_priv1_id,
      data.terraform_remote_state.base.outputs.subnet_priv2_id,
    ]
    security_groups = [
      aws_security_group.vpc_only.id,
      data.terraform_remote_state.base.outputs.vpc_default_security_group_id
    ]
  }
  # @todo: consider using deployment_circuit_breaker
}

