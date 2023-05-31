module "base_network" {
  source          = "../../modules/base_network"
  region          = var.region
  prefix          = var.prefix
  region_az_names = var.region_az_names
}

# TODO: Remove `moved` blocks after applying changes to _all_ environments
moved {
  from = aws_vpc.main
  to   = module.base_network.aws_vpc.main
}
moved {
  from = aws_cloudwatch_log_group.flow_log
  to   = module.base_network.aws_cloudwatch_log_group.flow_log
}
moved {
  from = aws_flow_log.flow_log
  to   = module.base_network.aws_flow_log.flow_log
}
moved {
  from = aws_iam_role.flow_log
  to   = module.base_network.aws_iam_role.flow_log
}
moved {
  from = aws_iam_role_policy.flow_log
  to   = module.base_network.aws_iam_role_policy.flow_log
}
moved {
  from = aws_internet_gateway.igw
  to   = module.base_network.aws_internet_gateway.igw
}
moved {
  from = aws_route_table.rtpriv
  to   = module.base_network.aws_route_table.rtpriv
}
moved {
  from = aws_route_table.rtpub
  to   = module.base_network.aws_route_table.rtpub
}
moved {
  from = aws_subnet.snpriv
  to   = module.base_network.aws_subnet.snpriv
}
moved {
  from = aws_subnet.snpub
  to   = module.base_network.aws_subnet.snpub
}
moved {
  from = aws_route_table_association.snpriv
  to   = module.base_network.aws_route_table_association.snpriv
}
moved {
  from = aws_route_table_association.snpub
  to   = module.base_network.aws_route_table_association.snpub
}
# END OF TODO: Remove `moved` blocks after applying changes to _all_ environments


####################################
# PrivateLink interface endpoints
# Allows for services in private subnets to connect to particular AWS services
# For full list see: https://docs.aws.amazon.com/vpc/latest/privatelink/integrated-services-vpce-list.html
####################################

# Security group that allows for private link interface endpoint connections
resource "aws_security_group" "vpce" {
  name        = "${var.prefix}-sgvpce"
  description = "VPC Endpoint"
  vpc_id      = module.base_network.vpc.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    description = "Allow endpoint connections"
    cidr_blocks = [module.base_network.vpc.cidr_block]
  }

  ingress {
    from_port   = 587
    to_port     = 587
    protocol    = "tcp"
    description = "Allow smtp endpoint connections"
    cidr_blocks = [module.base_network.vpc.cidr_block]
  }

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    description = "Allow Redis connections"
    cidr_blocks = [module.base_network.vpc.cidr_block]
  }

  tags = { Name = "${var.prefix}-sgvpce" }
}

# Allow private endpoint to fetch S3 content
# This is very important, as ECR layers are stored in S3
# Beware that this endpoint must be a Gateway endpoint and not an interface!
# https://docs.aws.amazon.com/AmazonS3/latest/userguide/privatelink-interface-endpoints.html
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = module.base_network.vpc.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = [
    module.base_network.rtpriv.id
  ]

  tags = { Name = "${var.prefix}-vpces3" }
}

# Allow fetching EC2 API access within the private subnet
# Used for various Fargate related operations (required)
resource "aws_vpc_endpoint" "ec2" {
  vpc_id              = module.base_network.vpc.id
  service_name        = "com.amazonaws.${var.region}.ec2"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.base_network.snpriv[*].id
  private_dns_enabled = true
  security_group_ids = [
    module.base_network.vpc.default_security_group_id,
    aws_security_group.vpce.id
  ]
}

# Allow fetching ECR data within the private subnet
# Used to pull OCI containers
resource "aws_vpc_endpoint" "ecrdkr" {
  vpc_id              = module.base_network.vpc.id
  service_name        = "com.amazonaws.${var.region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.base_network.snpriv[*].id
  private_dns_enabled = true
  security_group_ids = [
    module.base_network.vpc.default_security_group_id,
    aws_security_group.vpce.id
  ]
}

# Allow fetching ECR data within the private subnet
# Used to pull OCI containers
resource "aws_vpc_endpoint" "ecrapi" {
  vpc_id              = module.base_network.vpc.id
  service_name        = "com.amazonaws.${var.region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.base_network.snpriv[*].id
  private_dns_enabled = true
  security_group_ids = [
    module.base_network.vpc.default_security_group_id,
    aws_security_group.vpce.id
  ]
}

# Allow CloudWatch as a logging endpoint.
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = module.base_network.vpc.id
  service_name        = "com.amazonaws.${var.region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.base_network.snpriv[*].id
  private_dns_enabled = true
  security_group_ids = [
    module.base_network.vpc.default_security_group_id,
    aws_security_group.vpce.id
  ]
}

# Allow secrets to be fetched from the private subnet
# SSM contain the Parameter Store, which stores secrets.
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = module.base_network.vpc.id
  service_name        = "com.amazonaws.${var.region}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.base_network.snpriv[*].id
  private_dns_enabled = true
  security_group_ids = [
    module.base_network.vpc.default_security_group_id,
    aws_security_group.vpce.id
  ]
}

# Allow RDS connections
resource "aws_vpc_endpoint" "rds" {
  vpc_id              = module.base_network.vpc.id
  service_name        = "com.amazonaws.${var.region}.rds"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.base_network.snpriv[*].id
  private_dns_enabled = true
  security_group_ids = [
    module.base_network.vpc.default_security_group_id,
    aws_security_group.vpce.id
  ]
}

# Allow Redis connections from the private subnet
# Used by both private subnet containers (realtime and search-loader)
resource "aws_vpc_endpoint" "elasticache" {
  vpc_id              = module.base_network.vpc.id
  service_name        = "com.amazonaws.${var.region}.elasticache"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [module.base_network.snpriv[0].id, module.base_network.snpub[1].id]
  private_dns_enabled = true
  security_group_ids = [
    module.base_network.vpc.default_security_group_id,
    aws_security_group.vpce.id
  ]
}

# Allow SES from containers in the public subnet
resource "aws_vpc_endpoint" "email" {
  vpc_id              = module.base_network.vpc.id
  service_name        = "com.amazonaws.${var.region}.email-smtp"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.base_network.snpriv[*].id
  private_dns_enabled = true
  security_group_ids = [
    module.base_network.vpc.default_security_group_id,
    aws_security_group.vpce.id
  ]
}
