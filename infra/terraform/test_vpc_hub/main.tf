locals {
  region = "us-east-1"
}

data "aws_vpc" "main" {
  id = "vpc-0e673c73d95ec2e70"
}

module "spoke" {
  source = "../modules/vpc_spoke_peer"
  region = local.region
  env    = "dev"
  vpc_id = data.aws_vpc.main.id
}
