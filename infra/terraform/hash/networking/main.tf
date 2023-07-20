module "base_network" {
  source          = "../../modules/base_network"
  region          = var.region
  prefix          = var.prefix
  region_az_names = var.region_az_names
}

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

# Allow private endpoint to fetch S3 content.
# Note that S3 Gateway endpoints are free to provision and use.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = module.base_network.vpc.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = [
    module.base_network.rtpriv.id
  ]

  tags = { Name = "${var.prefix}-vpces3" }
}
