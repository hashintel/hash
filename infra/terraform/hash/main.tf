/*
  This module contains the configuration for standing up a HASH instance in 
  AWS using ECS Fargate. 
*/

module "variables" {
  source          = "git@github.com:hashintel/infra-modules.git//terraform/variables?ref=v0.0.1"
  env             = terraform.workspace
  region          = var.region
  region_az_count = var.region_az_count
  project         = "hash"
}

locals {
  env             = module.variables.env
  region          = module.variables.region
  prefix          = module.variables.prefix
  param_prefix    = module.variables.param_prefix
  region_az_names = module.variables.region_az_names
}

provider "vault" {
  # Uses the VAULT_TOKEN environment variable OR ~/.vault-token file to authenticate.
  # The using the vault at VAULT_ADDR
}

data "vault_kv_secret_v2" "secrets" {
  mount = "automation"
  # Remove leading and trailing slashes from the path so we ensure it's a path and not a file
  name = "${trim(var.vault_kvv2_secret_path, "/ ")}/${local.env}"
}

module "vault_aws_auth" {
  source = "git@github.com:hashintel/infra-modules.git//terraform/vault_aws_auth?ref=v0.0.1"
  region = local.region
  env    = local.env
}

provider "aws" {
  region     = local.region
  access_key = module.vault_aws_auth.access_key
  secret_key = module.vault_aws_auth.secret_key
  token      = module.vault_aws_auth.token

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
  source     = "git@github.com:hashintel/infra-modules.git//terraform/bastion?ref=v0.0.1"
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
  pg_superuser_password = sensitive(data.vault_kv_secret_v2.secrets.data["pg_superuser_password"])
}


module "tunnel" {
  source             = "git@github.com:hashintel/infra-modules.git//terraform/tunnel?ref=v0.0.1"
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
  password  = sensitive(data.vault_kv_secret_v2.secrets.data["pg_superuser_password"])
  superuser = false
}

module "postgres_roles" {
  depends_on            = [module.postgres, module.bastion, module.tunnel.host]
  providers             = { postgresql = postgresql }
  source                = "../modules/postgres_roles"
  pg_db_name            = module.postgres.pg_db_name
  pg_superuser_username = "superuser"
  pg_superuser_password = data.vault_kv_secret_v2.secrets.data["pg_superuser_password"]

  pg_kratos_user_password_hash = data.vault_kv_secret_v2.secrets.data["pg_kratos_user_password_hash"]
  pg_graph_user_password_hash  = data.vault_kv_secret_v2.secrets.data["pg_graph_user_password_hash"]
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
  source   = "git@github.com:hashintel/infra-modules.git//terraform/container_registry?ref=v0.0.1"
  prefix   = local.prefix
  ecr_name = "graphecr"
}

module "kratos_ecr" {
  source   = "git@github.com:hashintel/infra-modules.git//terraform/container_registry?ref=v0.0.1"
  prefix   = local.prefix
  ecr_name = "kratosecr"
}

module "api_ecr" {
  source   = "git@github.com:hashintel/infra-modules.git//terraform/container_registry?ref=v0.0.1"
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
    { name = "HASH_GRAPH_PG_PASSWORD", secret = true, value = sensitive(data.vault_kv_secret_v2.secrets.data["pg_graph_user_password_raw"]) },
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
    { name = "SECRETS_COOKIE", secret = true, value = sensitive(data.vault_kv_secret_v2.secrets.data["kratos_secrets_cookie"]) },
    { name = "SECRETS_CIPHER", secret = true, value = sensitive(data.vault_kv_secret_v2.secrets.data["kratos_secrets_cipher"]) },
    { name = "DSN", secret = true, value = "postgres://kratos:${sensitive(data.vault_kv_secret_v2.secrets.data["pg_kratos_user_password_raw"])}@${module.postgres.pg_host}:${module.postgres.pg_port}/kratos" },
  ])
  api_image = module.api_ecr
  api_env_vars = concat(var.hash_api_env_vars, [
    { name = "AWS_REGION", secret = false, value = local.region },
    { name = "SYSTEM_USER_PASSWORD", secret = true, value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_system_user_password"]) },
    { name = "BLOCK_PROTOCOL_API_KEY", secret = true, value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_block_protocol_api_key"]) },
    { name = "KRATOS_API_KEY", secret = true, value = sensitive(data.vault_kv_secret_v2.secrets.data["kratos_api_key"]) },
    { name = "HASH_SEED_USERS", secret = true, value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_seed_users"]) },
    { name = "HASH_REDIS_HOST", secret = false, value = module.redis.node.address },
    { name = "HASH_REDIS_PORT", secret = false, value = module.redis.node.port },
  ])
}
