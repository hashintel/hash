module "variables" {
  source          = "../modules/variables"
  env             = terraform.workspace
  region          = var.region
  region_az_count = var.region_az_count
  project         = "hash" # this is just to get the right prefixes in place.
}

locals {
  env             = module.variables.env
  region          = module.variables.region
  prefix          = module.variables.prefix
  param_prefix    = module.variables.param_prefix
  region_az_names = module.variables.region_az_names
}

data "aws_vpc" "vpc" {
  filter {
    name   = "tag:Name"
    values = ["${local.prefix}-vpc"]
  }
}

data "aws_subnets" "snpriv" {
  tags = {
    Name = "${local.prefix}-snpriv"
  }
}

data "aws_subnets" "snpub" {
  tags = {
    Name = "${local.prefix}-snpub"
  }
}

module "migrate" {
  source   = "../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "migrate"
}

module "setup" {
  source   = "../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "setup"
}

module "temporal" {
  source                 = "../modules/temporal"
  prefix                 = local.prefix
  subnets                = data.aws_subnets.snpub.ids
  vpc                    = data.aws_vpc.vpc
  env                    = local.env
  region                 = local.region
  cpu                    = 512
  memory                 = 1024
  param_prefix           = "/h-temporal"
  temporal_migrate_image = module.migrate
  temporal_setup_image   = module.setup

}
