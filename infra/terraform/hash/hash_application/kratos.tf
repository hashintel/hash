locals {
  kratos_service_name           = "kratos"
  kratos_prefix                 = "${var.prefix}-${local.kratos_service_name}"
  kratos_param_prefix           = "${local.param_prefix}/${local.kratos_service_name}"
  kratos_public_port            = 4433
  kratos_private_port           = 4434
  kratos_public_http_port_name  = local.kratos_service_name
  kratos_public_http_port_dns   = "${local.kratos_public_http_port_name}.${aws_service_discovery_private_dns_namespace.app.name}"
  kratos_private_http_port_name = "${local.kratos_service_name}-private"
  kratos_private_http_port_dns  = "${local.kratos_private_http_port_name}.${aws_service_discovery_private_dns_namespace.app.name}"
  kratos_env_vars               = concat(var.kratos_env_vars, local.kratos_email_env_vars)
}


resource "aws_ssm_parameter" "kratos_env_vars" {
  # Only put secrets into SSM
  for_each = { for env_var in local.kratos_env_vars : env_var.name => env_var if env_var.secret }

  name = "${local.kratos_param_prefix}/${each.value.name}"
  # Still supports non-secret values
  type      = each.value.secret ? "SecureString" : "String"
  value     = each.value.secret ? sensitive(each.value.value) : each.value.value
  overwrite = true
  tags      = {}
}

resource "aws_security_group" "kratos" {
  name   = local.kratos_prefix
  vpc_id = var.vpc.id

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

  ingress {
    from_port   = local.kratos_public_port
    to_port     = local.kratos_public_port
    protocol    = "tcp"
    description = "Allow communication via HTTP"
    cidr_blocks = [var.vpc.cidr_block]
  }

  ingress {
    from_port   = local.kratos_private_port
    to_port     = local.kratos_private_port
    protocol    = "tcp"
    description = "Allow communication via HTTP"
    cidr_blocks = [var.vpc.cidr_block]
  }
}

resource "aws_ecs_task_definition" "kratos" {
  family                   = local.kratos_prefix
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  execution_role_arn       = aws_iam_role.execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn
  container_definitions    = jsonencode([for task_def in local.kratos_task_defs : task_def.task_def])
  tags = {}
}

resource "aws_ecs_service" "kratos" {
  depends_on             = [aws_iam_role.task_role]
  name                   = local.kratos_prefix
  cluster                = data.aws_ecs_cluster.ecs.arn
  task_definition        = aws_ecs_task_definition.kratos.arn
  enable_execute_command = true
  desired_count          = 1
  launch_type            = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    assign_public_ip = true
    security_groups  = [
      aws_security_group.kratos.id,
    ]
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_private_dns_namespace.app.arn

    service {
      port_name = local.kratos_public_http_port_name

      client_alias {
        port = local.kratos_public_port
      }
    }

    service {
      port_name = local.kratos_private_http_port_name

      client_alias {
        port = local.kratos_private_port
      }
    }
  }

  tags = { Service = "${local.prefix}svc" }
}

locals {
  kratos_migration_container_def = {
    name        = "${local.kratos_prefix}-migration"
    image       = "${var.kratos_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    command     = ["migrate", "sql", "-e", "--yes"]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.kratos_service_name
        "awslogs-region"        = var.region
      }
    }

    Environment = [for env_var in local.kratos_env_vars :
      { name = env_var.name, value = env_var.value } if !env_var.secret]

    secrets = [for env_name, ssm_param in aws_ssm_parameter.kratos_env_vars :
      { name = env_name, valueFrom = ssm_param.arn }]

    essential = false
  }
  kratos_service_container_def = {
    name        = "${local.kratos_prefix}container"
    image       = "${var.kratos_image.url}:latest"
    cpu         = 0 # let ECS divvy up the available CPU
    mountPoints = []
    volumesFrom = []
    dependsOn   = [
      { condition = "SUCCESS", containerName = local.kratos_migration_container_def.name },
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${local.kratos_public_port}/health/ready || exit 1"]
      retries     = 5
      startPeriod = 10
      interval    = 30
      timeout     = 5
    }
    portMappings = [
      {
        name          = local.kratos_public_http_port_name
        appProtocol   = "http"
        containerPort = local.kratos_public_port
        protocol      = "tcp"
      },
      {
        name          = local.kratos_private_http_port_name
        appProtocol   = "http"
        containerPort = local.kratos_private_port
        protocol      = "tcp"
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-create-group"  = "true"
        "awslogs-group"         = local.log_group_name
        "awslogs-stream-prefix" = local.kratos_service_name
        "awslogs-region"        = var.region
      }
    }
    Environment = [for env_var in local.kratos_env_vars :
    { name = env_var.name, value = env_var.value } if !env_var.secret]

    secrets = [for env_name, ssm_param in aws_ssm_parameter.kratos_env_vars :
    { name = env_name, valueFrom = ssm_param.arn }]

    essential = true
  }
}

locals {
  ses_identity = var.ses_verified_domain_identity
  ses_enabled  = local.ses_identity == "" ? 0 : 1
  kratos_email_env_vars = local.ses_enabled == 1 ? [
    {
      name   = "X-SES-SOURCE-ARN",
      secret = false,
      value  = data.aws_ses_domain_identity.domain.0.arn
    },
    {
      name   = "X-SES-FROM-ARN",
      secret = false,
      value  = data.aws_ses_domain_identity.domain.0.arn
    },
    {
      name   = "X-SES-RETURN-PATH-ARN",
      secret = false,
      value  = data.aws_ses_domain_identity.domain.0.arn
    },
    {
      name   = "COURIER_SMTP_CONNECTION_URI"
      secret = true,
      value  = sensitive("smtp://${aws_iam_access_key.email_access_key.0.id}:${aws_iam_access_key.email_access_key.0.ses_smtp_password_v4}@email-smtp.${var.region}.amazonaws.com:587/?skip_ssl_verify=true")
    }
  ] : []
}

# Below we create an IAM user with an access key to be used as a SMTP user.

data "aws_ses_domain_identity" "domain" {
  count  = local.ses_enabled
  domain = local.ses_identity
}

resource "aws_iam_user" "email_user" {
  count = local.ses_enabled
  name  = "${local.prefix}email"
}

resource "aws_iam_access_key" "email_access_key" {
  count = local.ses_enabled
  user  = aws_iam_user.email_user.0.name
}

data "aws_iam_policy_document" "email_policy_document" {
  count = local.ses_enabled
  statement {
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = data.aws_ses_domain_identity.domain.*.arn
  }
}

resource "aws_iam_policy" "email_policy" {
  count  = local.ses_enabled
  name   = "${local.prefix}emailpolicy"
  policy = data.aws_iam_policy_document.email_policy_document.0.json
}

resource "aws_iam_user_policy_attachment" "email_user_policy" {
  count      = local.ses_enabled
  user       = aws_iam_user.email_user.0.name
  policy_arn = aws_iam_policy.email_policy.0.arn
}
