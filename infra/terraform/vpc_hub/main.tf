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
  cidr_block           = var.vpc_hub_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.prefix}-vpc", Group = "vpc-hub" }
}

/* Disabled  as we don't want to include flow logs in the VPC Hub for now.
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
*/

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

module "endpoints" {
  source = "../modules/privatelink_endpoints"
  region = local.region
}

locals {
  endpoints = module.endpoints.endpoints
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

  tags = { Name = "${local.prefix}-${each.key}" }
}

resource "aws_route53_zone" "private_hosted_zone" {
  for_each = local.endpoints
  name     = each.value.phz_name

  vpc {
    vpc_id = aws_vpc.main.id

    # Similarly to how we set this association up in the public zone, we need to
    # associate each VPC Spoke with each private hosted zone for every endpoint.

    # resource "aws_route53_zone_association" "main_vpc_assoc" {
    #   for_each = local.endpoints # or fetched through a data source by the group tag
    #   zone_id  = aws_route53_zone.private_hosted_zone[each.key].zone_id
    #   vpc_id   = ..
    # }
  }

  comment = "VPC hub Private hosted zone for ${each.key} managed by Terraform"

  tags = {
    Group = "vpc-hub"
  }

  # Ignore VPCs as the Spokes will be dynamically added elsewhere
  lifecycle {
    ignore_changes = [vpc]
  }

}

locals {
  endpoint_aliases = flatten([
    for k, v in local.endpoints : [for alias in v.alias : merge(v, { alias = alias, endpoint = k })]
  ])
}

resource "aws_route53_record" "endpoint_record" {
  for_each = { for v in local.endpoint_aliases : "${v.name}.${v.alias}" => v }

  zone_id = aws_route53_zone.private_hosted_zone[each.value.endpoint].id
  name    = each.value.alias
  type    = "A"

  alias {
    name                   = aws_vpc_endpoint.endpoint[each.value.endpoint].dns_entry[0].dns_name
    zone_id                = aws_vpc_endpoint.endpoint[each.value.endpoint].dns_entry[0].hosted_zone_id
    evaluate_target_health = true
  }

  # ignore changes to alias. AWS interprets the wildcard "*" as ASCII "\052", which causes
  # Terraform to think the value has changed when it hasn't.
  lifecycle {
    ignore_changes = [alias["name"]]
  }
}
