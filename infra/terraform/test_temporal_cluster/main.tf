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

module "temporal" {
  source       = "../modules/temporal"
  prefix       = local.prefix
  subnets      = data.aws_subnets.snpub.ids
  vpc          = data.aws_vpc.vpc
  env          = local.env
  region       = local.region
  cpu          = 512
  memory       = 1024
  param_prefix = "/h-temporal"
}

module "worker_ecs" {
  source             = "../modules/container_cluster"
  prefix             = local.prefix
  ecs_name           = "temporalworkers"
  capacity_providers = ["FARGATE"]
}

module "worker_task" {
  source           = "../modules/temporal_worker"
  prefix           = local.prefix
  param_prefix     = "/h-worker"
  subnets          = data.aws_subnets.snpub.ids
  vpc              = data.aws_vpc.vpc
  env              = local.env
  region           = local.region
  cpu              = 512
  memory           = 1024
  worker_name      = "aiworkerts"
  temporal_host    = module.temporal.temporal_private_hostname
  env_vars         = [{ name = "OPENAI_API_KEY", secret = true, value = "imagine this is a secret from vault :)" }]
  cluster_arn      = module.worker_ecs.ecs_cluster_arn
  ecs_health_check = ["CMD-shell", "curl -f http://localhost:4100/health || exit 1"]
}
