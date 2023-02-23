/*
  This module contains the configuration for standing up a HASH instance in 
  AWS using ECS Fargate. 
*/

module "variables" {
  source          = "../modules/variables"
  env             = terraform.workspace
  region          = var.region
  region_az_count = var.region_az_count
}

locals {
  env             = module.variables.env
  region          = module.variables.region
  prefix          = module.variables.prefix
  param_prefix    = module.variables.param_prefix
  region_az_names = module.variables.region_az_names
}

provider "aws" {
  profile = "default"
  region  = var.region

  default_tags {
    tags = {
      project             = "hash"
      region              = "${local.region}"
      environment         = "${local.env}"
      terraform_workspace = "${terraform.workspace}"
    }
  }
}

module "networking" {
  source          = "../modules/networking"
  region          = var.region
  prefix          = local.prefix
  region_az_names = local.region_az_names
}

module "bastion" {
  source     = "../modules/bastion"
  region     = var.region
  env        = local.env
  prefix     = local.prefix
  vpc_id     = module.networking.vpc.id
  subnet_ids = module.networking.snpub
}

module "postgres" {
  depends_on            = [module.networking]
  source                = "../modules/postgres"
  prefix                = local.prefix
  subnets               = module.networking.snpriv
  vpc_id                = module.networking.vpc.id
  vpc_cidr_block        = module.networking.vpc.cidr_block
  env                   = local.env
  region                = local.region
  pg_port               = 5432
  instance_class        = "db.t3.small"
  pg_superuser_username = "superuser"
  pg_superuser_password = sensitive(var.pg_superuser_password)
}


module "tunnel" {
  source             = "../modules/tunnel"
  ssh_host           = module.bastion.ssh_info.host
  ssh_port           = 22
  ssh_user           = module.bastion.ssh_info.user
  ssh_private_key    = module.bastion.ssh_info.private_key
  tunnel_target_host = module.postgres.pg_host
  tunnel_target_port = 5432
}

# This provider is accessed through the bastion host using the above SSH tunnel
provider "postgresql" {
  scheme    = "postgres"
  host      = module.tunnel.host
  username  = "superuser"
  port      = module.tunnel.port
  password  = sensitive(var.pg_superuser_password)
  superuser = false
}

module "postgres_roles" {
  depends_on            = [module.postgres, module.bastion, module.tunnel.host]
  providers             = { postgresql = postgresql }
  source                = "../modules/postgres_roles"
  pg_db_name            = module.postgres.pg_db_name
  pg_superuser_username = "superuser"
  pg_superuser_password = var.pg_superuser_password

  pg_kratos_user_password_hash = var.pg_kratos_user_password.hash
  pg_graph_user_password_hash  = var.pg_graph_user_password.hash
}

module "redis" {
  depends_on      = [module.networking]
  source          = "../modules/redis"
  prefix          = local.prefix
  node_type       = "cache.t3.micro"
  vpc_id          = module.networking.vpc.id
  vpc_cidr_block  = module.networking.vpc.cidr_block
  subnet_ids      = module.networking.snpriv
  region_az_names = local.region_az_names
}

module "application_ecs" {
  depends_on = [module.networking]
  source     = "../modules/container_cluster"
  prefix     = local.prefix
  ecs_name   = "ecs"
}

module "graph_ecr" {
  source   = "../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "graphecr"
}

module "kratos_ecr" {
  source   = "../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "kratosecr"
}

module "api_ecr" {
  source   = "../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "apiecr"
}

module "application" {
  depends_on                   = [module.networking, module.postgres]
  source                       = "../modules/hash_application"
  subnets                      = module.networking.snpub
  env                          = local.env
  region                       = local.region
  vpc                          = module.networking.vpc
  prefix                       = local.prefix
  param_prefix                 = local.param_prefix
  cpu                          = 1024
  memory                       = 2048
  ses_verified_domain_identity = var.ses_verified_domain_identity
  graph_image                  = module.graph_ecr
  graph_env_vars = concat(var.hash_graph_env_vars, [
    { name = "HASH_GRAPH_TYPE_FETCHER_HOST", secret = false, value = "127.0.0.1" },
    { name = "HASH_GRAPH_TYPE_FETCHER_PORT", secret = false, value = "4444" },
    { name = "HASH_GRAPH_PG_USER", secret = false, value = "graph" },
    { name = "HASH_GRAPH_PG_PASSWORD", secret = true, value = sensitive(var.pg_graph_user_password.raw) },
    { name = "HASH_GRAPH_PG_HOST", secret = false, value = module.postgres.pg_host },
    { name = "HASH_GRAPH_PG_PORT", secret = false, value = module.postgres.pg_port },
    { name = "HASH_GRAPH_PG_DATABASE", secret = false, value = "graph" },
  ])
  # The type fetcher uses the same image as the graph right now
  type_fetcher_image = module.graph_ecr
  # we reuse the same non-secret env vars as the graph. Stuff like logging
  type_fetcher_env_vars = concat(var.hash_graph_env_vars, [
    { name = "HASH_GRAPH_TYPE_FETCHER_HOST", secret = false, value = "127.0.0.1" },
    { name = "HASH_GRAPH_TYPE_FETCHER_PORT", secret = false, value = "4444" },
  ])
  kratos_image = module.kratos_ecr
  kratos_env_vars = concat(var.kratos_env_vars, [
    { name = "SECRETS_COOKIE", secret = true, value = sensitive(var.kratos_secrets_cookie) },
    { name = "SECRETS_CIPHER", secret = true, value = sensitive(var.kratos_secrets_cipher) },
    { name = "DSN", secret = true, value = "postgres://kratos:${sensitive(var.pg_kratos_user_password.raw)}@${module.postgres.pg_host}:${module.postgres.pg_port}/kratos" },
  ])
  api_image = module.api_ecr
  api_env_vars = concat(var.hash_api_env_vars, [
    { name = "AWS_REGION", secret = false, value = local.region },
    { name = "SYSTEM_USER_PASSWORD", secret = true, value = sensitive(var.hash_system_user_password) },
    { name = "BLOCK_PROTOCOL_API_KEY", secret = true, value = sensitive(var.hash_block_protocol_api_key) },
    { name = "KRATOS_API_KEY", secret = true, value = sensitive(var.kratos_api_key) },
    { name = "HASH_SEED_USERS", secret = true, value = sensitive(jsonencode(var.hash_seed_users)) },
    { name = "HASH_REDIS_HOST", secret = false, value = module.redis.node.address },
    { name = "HASH_REDIS_PORT", secret = false, value = module.redis.node.port },
  ])
}
