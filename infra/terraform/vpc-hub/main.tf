module "variables" {
  source          = "../modules/variables"
  env             = terraform.workspace
  region          = var.region
  region_az_count = var.region_az_count
  project         = "vpchub"
}

locals {
  env             = module.variables.env
  region          = module.variables.region
  prefix          = module.variables.prefix
  param_prefix    = module.variables.param_prefix
  region_az_names = module.variables.region_az_names
}

resource "aws_vpc" "main" {
  cidr_block           = "10.10.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.prefix}-vpc" }
}

# Flow logs in VPC
resource "aws_flow_log" "flow_log" {
  tags = { Name = "${local.prefix}-flowvpc" }

  iam_role_arn    = aws_iam_role.flow_log.arn
  log_destination = aws_cloudwatch_log_group.flow_log.arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id
}

resource "aws_cloudwatch_log_group" "flow_log" {
  name = "${local.prefix}-flowlogvpc"
}

resource "aws_iam_role" "flow_log" {
  name = "${local.prefix}-flowlogrole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "vpc-flow-logs.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
}

resource "aws_iam_role_policy" "flow_log" {
  name = "${local.prefix}-iamflowlog"
  role = aws_iam_role.flow_log.id

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ],
      "Effect": "Allow",
      "Resource": "*"
    }
  ]
}
EOF
}

resource "aws_subnet" "snpriv" {
  count  = length(local.region_az_names)
  vpc_id = aws_vpc.main.id

  # Turn into a 10.10.0.0/24
  # 10.10.x.0 - 10.10.x.255 (256 addresses)
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone = local.region_az_names[count.index]
  tags = {
    Name    = "${local.prefix}-snpriv"
    NameIdx = "${local.prefix}-snpriv${count.index + 1}"
    Tier    = "private"
  }
}

####################################
# PrivateLink interface endpoints
# Allows for services in private subnets to connect to particular AWS services
# For full list see: https://docs.aws.amazon.com/vpc/latest/privatelink/integrated-services-vpce-list.html
####################################

locals {
  # This is the list of CIDRs that the private link security group will allow
  # It's overly permissive as we may have Spoke VPCs that do not use a 10.x.0.0/16.
  # therefore we go with 10.0.0.0/8
  expected_cidr = ["10.0.0.0/8"]
}

# Security group that allows for private link interface endpoint connections
resource "aws_security_group" "vpce" {
  name        = "${local.prefix}-sgvpce"
  description = "VPC Endpoint"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    description = "Allow HTTP endpoint connections"
    cidr_blocks = local.expected_cidr
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "Allow HTTPS endpoint connections"
    cidr_blocks = local.expected_cidr
  }

  ingress {
    from_port   = 587
    to_port     = 587
    protocol    = "tcp"
    description = "Allow SMTP endpoint connections"
    cidr_blocks = local.expected_cidr
  }

  ingress {
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    description = "Allow DNS lookups"
    cidr_blocks = local.expected_cidr
  }

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    description = "Allow Redis connections"
    cidr_blocks = local.expected_cidr
  }

  tags = { Name = "${local.prefix}-sgvpce" }
}

locals {
  endpoints = {
    # Allow secrets to be fetched from the private subnet
    # SSM contain the Parameter Store, which stores secrets.
    ssm = {
      name        = "com.amazonaws.${var.region}.ssm"
      type        = "Interface"
      private_dns = false
      phz_name    = "ssm.${var.region}.amazonaws.com"
      alias       = [""]
    }
    # Allow Fargate Exec control messages
    ssmmessages = {
      name        = "com.amazonaws.${var.region}.ssmmessages"
      type        = "Interface"
      private_dns = false
      phz_name    = "ssmmessages.${var.region}.amazonaws.com"
      alias       = [""]
    }
    # Used for various Fargate related operations and Fargate Exec
    ec2messages = {
      name        = "com.amazonaws.${var.region}.ec2messages"
      type        = "Interface"
      private_dns = false
      phz_name    = "ec2messages.${var.region}.amazonaws.com"
      alias       = [""]
    }
    # Allow fetching ECR data within the private subnet from ECS
    # Used to pull OCI containers
    # See https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html#ecr-vpc-endpoint-considerations
    ecrdkr = {
      name        = "com.amazonaws.${var.region}.ecr.dkr"
      type        = "Interface"
      private_dns = false
      phz_name    = "dkr.ecr.${var.region}.amazonaws.com"
      # This alias, "*", allows us to request things on the AWS account namespace.
      alias = ["", "*"]
    }
    # Used to pull OCI containers
    ecrdkr = {
      name        = "com.amazonaws.${var.region}.ecr.api"
      type        = "Interface"
      private_dns = false
      phz_name    = "api.ecr.${var.region}.amazonaws.com"
      alias       = [""]
    }
    # Allows access to S3 buckets
    # Also required to pull OCI containers from ECS
    s3 = {
      name        = "com.amazonaws.${var.region}.s3"
      type        = "Interface"
      private_dns = false
      phz_name    = "s3.${var.region}.amazonaws.com"
      # This alias, "*", allows us to request by the bucket name without listing them all.
      # IAM rules would ensure only the correct buckets are accessible.
      alias = ["", "*"]
    }
  }
}

resource "aws_vpc_endpoint" "endpoint" {
  for_each          = local.endpoints
  vpc_id            = aws_vpc.main.id
  service_name      = each.value.name
  vpc_endpoint_type = each.value.type
  subnet_ids        = aws_subnet.snpriv[*].id
  security_group_ids = [
    aws_vpc.main.default_security_group_id,
    aws_security_group.vpce.id
  ]
  private_dns_enabled = each.value.private_dns
}

resource "aws_route53_zone" "private_hosted_zone" {
  name = "${local.prefix}-hubphz"

  vpc {
    vpc_id = aws_vpc.main.id
  }
}

locals {
  endpoint_aliases = flatten([
    for k, v in local.endpoints : [for alias in v.alias : merge(v, { alias = alias, endpoint = k })]
  ])
}

resource "aws_route53_record" "endpoint_record" {
  for_each = { for v in local.endpoint_aliases : "${v.name}${v.alias}" => v }

  zone_id = aws_route53_zone.private_hosted_zone.zone_id
  name    = each.value.alias
  type    = "A"

  alias {
    name                   = aws_vpc_endpoint.endpoint[each.value.endpoint].dns_entry[0].dns_name
    zone_id                = aws_vpc_endpoint.endpoint[each.value.endpoint].dns_entry[0].hosted_zone_id
    evaluate_target_health = true
  }
}
