/*
  This module contains the configuration for standing up a HASH instance in
  AWS using ECS Fargate.
*/

module "variables_hash" {
  source          = "../modules/variables"
  env             = terraform.workspace
  region          = var.region
  region_az_count = var.region_az_count
  project         = "hash"
}

// TODO: In order to have access to RDS we kept `temporal` in this project but this should be moved a separated
//       project folder and apply TF from the parent folder
//   see https://linear.app/hash/issue/H-54/split-internal-vs-external-services-in-terraform-config
module "variables_temporal" {
  source          = "../modules/variables"
  env             = terraform.workspace
  region          = var.region
  region_az_count = var.region_az_count
  project         = "temporal"
}

locals {
  env             = module.variables_hash.env
  region          = module.variables_hash.region
  prefix          = module.variables_hash.prefix
  param_prefix    = module.variables_hash.param_prefix
  region_az_names = module.variables_hash.region_az_names
}

provider "vault" {
  # Uses the VAULT_TOKEN environment variable OR ~/.vault-token file to authenticate.
  # This is using the vault at VAULT_ADDR
}

provider "cloudflare" {
  api_token = sensitive(data.vault_kv_secret_v2.secrets.data["cloudflare_api_token"])
}

data "vault_kv_secret_v2" "secrets" {
  mount = "automation"
  # Remove leading and trailing slashes from the path so we ensure it's a path and not a file
  name = "${trim(var.vault_kvv2_secret_path, "/ ")}/${local.env}"
}

module "vault_aws_auth" {
  source = "../modules/vault_aws_auth"
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
      region              = local.region
      environment         = local.env
      terraform_workspace = terraform.workspace
    }
  }
}

module "networking" {
  source          = "./networking"
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
  depends_on                                  = [module.networking]
  source                                      = "./postgres"
  prefix                                      = local.prefix
  subnets                                     = module.networking.snpriv
  vpc_id                                      = module.networking.vpc.id
  vpc_cidr_block                              = module.networking.vpc.cidr_block
  env                                         = local.env
  region                                      = local.region
  pg_port                                     = 5432
  instance_class                              = "db.t3.small"
  pg_superuser_username                       = "superuser"
  pg_superuser_password                       = sensitive(data.vault_kv_secret_v2.secrets.data["pg_superuser_password"])
  pagerduty_main_database_aws_integration_key = sensitive(data.vault_kv_secret_v2.secrets.data["pagerduty_main_database_aws_integration_key"])
}

module "temporal" {
  depends_on   = [module.networking, module.postgres]
  source       = "./temporal"
  prefix       = module.variables_temporal.prefix
  param_prefix = module.variables_temporal.param_prefix
  subnets      = module.networking.snpub
  vpc          = module.networking.vpc
  env          = local.env
  region       = local.region
  cpu          = 256
  memory       = 512
  # TODO: provide by the HASH variables.tf
  temporal_version    = "1.23.1.0"
  temporal_ui_version = "2.27.2"

  postgres_host          = module.postgres.pg_host
  postgres_port          = module.postgres.pg_port
  postgres_db            = "temporal"
  postgres_visibility_db = "temporal_visibility"
  postgres_user          = "temporal"
  postgres_password      = sensitive(data.vault_kv_secret_v2.secrets.data["pg_temporal_user_password_raw"])

  postgres_superuser          = "superuser"
  postgres_superuser_password = sensitive(data.vault_kv_secret_v2.secrets.data["pg_superuser_password"])
}

module "observability" {
  depends_on                            = [module.networking]
  source                                = "./observability"
  env                                   = local.env
  region                                = local.region
  vpc                                   = module.networking.vpc
  prefix                                = "h-${terraform.workspace}-observability"
  param_prefix                          = local.param_prefix
  subnets                               = module.networking.snpub
  grafana_database_host                 = module.postgres.pg_host
  grafana_database_port                 = module.postgres.pg_port
  grafana_database_password             = sensitive(data.vault_kv_secret_v2.secrets.data["pg_grafana_user_password_raw"])
  grafana_secret_key                    = sensitive(data.vault_kv_secret_v2.secrets.data["grafana_secret_key"])
  vpc_zone_id                           = aws_route53_zone.vpc.zone_id
  amazon_trust_ca_bundle                = local.amazon_trust_ca_bundle
  pagerduty_grafana_aws_integration_key = sensitive(data.vault_kv_secret_v2.secrets.data["pagerduty_grafana_aws_integration_key"])
}


module "tunnel" {
  source              = "../modules/tunnel"
  use_ssm             = true
  bastion_instance_id = module.bastion.instance_id
  aws_region          = local.region
  tunnel_target_host  = module.postgres.pg_host
  tunnel_target_port  = 5432
  local_tunnel_port   = 45678
  # Set this to a rather high value to avoid the tunnel being terminated too early.
  # We've seen the tunnel being established after the first attempt, but it's not reliable.
  # In particular in CI, it sometimes takes a while to establish the tunnel and we've seen
  # waiting times of more than a minute.
  tunnel_max_attempts = 30
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
  source                = "./postgres_roles"
  pg_db_name            = module.postgres.pg_db_name
  pg_superuser_username = "superuser"
  pg_superuser_password = data.vault_kv_secret_v2.secrets.data["pg_superuser_password"]

  pg_kratos_user_password_hash   = data.vault_kv_secret_v2.secrets.data["pg_kratos_user_password_hash"]
  pg_hydra_user_password_hash    = data.vault_kv_secret_v2.secrets.data["pg_hydra_user_password_hash"]
  pg_graph_user_password_hash    = data.vault_kv_secret_v2.secrets.data["pg_graph_user_password_hash"]
  pg_temporal_user_password_hash = data.vault_kv_secret_v2.secrets.data["pg_temporal_user_password_hash"]
  pg_grafana_user_password_hash  = data.vault_kv_secret_v2.secrets.data["pg_grafana_user_password_hash"]
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
  depends_on         = [module.networking]
  source             = "../modules/container_cluster"
  prefix             = local.prefix
  ecs_name           = "ecs"
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
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

module "hydra_ecr" {
  source   = "../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "hydraecr"
}

module "api_ecr" {
  source   = "../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "apiecr"
}

module "temporal_worker_ai_ts_ecr" {
  source   = "../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "temporalworkeraits"
}

module "temporal_worker_integration_ecr" {
  source   = "../modules/container_registry"
  prefix   = local.prefix
  ecr_name = "temporalworkerintegration"
}

module "application" {
  depends_on                   = [module.networking, module.postgres]
  providers                    = { cloudflare = cloudflare }
  source                       = "./hash_application"
  subnets                      = module.networking.snpub
  cluster_arn                  = module.application_ecs.ecs_cluster_arn
  env                          = local.env
  region                       = local.region
  vpc                          = module.networking.vpc
  prefix                       = local.prefix
  param_prefix                 = local.param_prefix
  cpu                          = 2048
  memory                       = 4096
  worker_cpu                   = 256
  worker_memory                = 2048
  ses_verified_domain_identity = var.ses_verified_domain_identity
  graph_image                  = module.graph_ecr
  graph_migration_env_vars = concat(var.hash_graph_env_vars, [
    { name = "HASH_GRAPH_PG_USER", secret = false, value = "superuser" },
    {
      name  = "HASH_GRAPH_PG_PASSWORD", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["pg_superuser_password"])
    },
    { name = "HASH_GRAPH_PG_HOST", secret = false, value = module.postgres.pg_host },
    { name = "HASH_GRAPH_PG_PORT", secret = false, value = module.postgres.pg_port },
    { name = "HASH_GRAPH_PG_DATABASE", secret = false, value = "graph" },
    {
      name  = "HASH_GRAPH_SENTRY_DSN", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["graph_sentry_dsn"])
    },
    { name = "HASH_GRAPH_SENTRY_ENVIRONMENT", secret = false, value = "production" },
    { name = "HASH_GRAPH_SENTRY_EVENT_FILTER", secret = false, value = "debug" },
    { name = "HASH_GRAPH_SENTRY_SPAN_FILTER", secret = false, value = "trace" },
  ])
  graph_env_vars = concat(var.hash_graph_env_vars, [
    { name = "HASH_GRAPH_PG_USER", secret = false, value = "graph" },
    {
      name  = "HASH_GRAPH_PG_PASSWORD", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["pg_graph_user_password_raw"])
    },
    { name = "HASH_GRAPH_PG_HOST", secret = false, value = module.postgres.pg_host },
    { name = "HASH_GRAPH_PG_PORT", secret = false, value = module.postgres.pg_port },
    { name = "HASH_GRAPH_PG_DATABASE", secret = false, value = "graph" },
    { name = "HASH_GRAPH_RPC_ENABLED", secret = false, value = "true" },
    {
      name  = "HASH_GRAPH_SENTRY_DSN", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["graph_sentry_dsn"])
    },
    { name = "HASH_GRAPH_SENTRY_ENVIRONMENT", secret = false, value = "production" },
    { name = "HASH_GRAPH_SENTRY_EVENT_FILTER", secret = false, value = "debug" },
    { name = "HASH_GRAPH_SENTRY_SPAN_FILTER", secret = false, value = "trace" },
  ])
  # The type fetcher uses the same image as the graph right now
  type_fetcher_image = module.graph_ecr
  kratos_image       = module.kratos_ecr
  kratos_env_vars = concat(var.kratos_env_vars, [
    {
      name  = "SECRETS_COOKIE", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["kratos_secrets_cookie"])
    },
    {
      name  = "SECRETS_CIPHER", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["kratos_secrets_cipher"])
    },
    {
      name  = "DSN", secret = true,
      value = "postgres://kratos:${sensitive(data.vault_kv_secret_v2.secrets.data["pg_kratos_user_password_raw"])}@${module.postgres.pg_host}:${module.postgres.pg_port}/kratos"
    },
  ])
  hydra_image = module.hydra_ecr
  hydra_env_vars = concat(var.hydra_env_vars, [
    {
      name  = "DSN", secret = true,
      value = "postgres://hydra:${sensitive(data.vault_kv_secret_v2.secrets.data["pg_hydra_user_password_raw"])}@${module.postgres.pg_host}:${module.postgres.pg_port}/hydra"
    },
    {
      name  = "SECRETS_COOKIE", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_hydra_secrets_cookie"])
    },
    {
      name  = "SECRETS_SYSTEM", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_hydra_secrets_system"])
    },
  ])
  api_image              = module.api_ecr
  api_migration_env_vars = var.hash_api_migration_env_vars
  api_env_vars = concat(var.hash_api_env_vars, [
    {
      name  = "ACCESS_FORM_SLACK_WEBHOOK_URL", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["access_form_slack_webhook_url"])
    },
    {
      name  = "MAILCHIMP_API_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["mailchimp_api_key"])
    },
    {
      name  = "MAILCHIMP_LIST_ID", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["mailchimp_list_id"])
    },
    {
      name  = "USER_EMAIL_ALLOW_LIST", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["user_email_allow_list"])
    },
    { name = "AWS_REGION", secret = false, value = local.region },
    {
      name  = "AWS_S3_UPLOADS_ACCESS_KEY_ID", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["aws_s3_uploads_access_key_id"])
    },
    {
      name  = "AWS_S3_UPLOADS_BUCKET", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["aws_s3_uploads_bucket"])
    },
    {
      name  = "AWS_S3_UPLOADS_ENDPOINT", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["aws_s3_uploads_endpoint"])
    },
    {
      name  = "AWS_S3_UPLOADS_SECRET_ACCESS_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["aws_s3_uploads_secret_access_key"])
    },
    {
      name  = "BLOCK_PROTOCOL_API_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_block_protocol_api_key"])
    },
    {
      name  = "KRATOS_API_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["kratos_api_key"])
    },
    {
      name  = "HASH_API_RUDDERSTACK_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_api_rudderstack_key"])
    },
    {
      name  = "HASH_SEED_USERS", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_seed_users"])
    },
    { name = "HASH_REDIS_HOST", secret = false, value = module.redis.node.address },
    { name = "HASH_REDIS_PORT", secret = false, value = module.redis.node.port },
    { name = "HASH_REDIS_ENCRYPTED_TRANSIT", secret = false, value = "true" },
    { name = "HASH_INTEGRATION_QUEUE_NAME", secret = false, value = "integration" },
    { name = "HASH_RPC_ENABLED", secret = false, value = "true" },
    {
      name  = "HASH_VAULT_HOST", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_vault_host"])
    },
    {
      name  = "HASH_VAULT_PORT", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_vault_port"])
    },
    { name = "HASH_VAULT_MOUNT_PATH", secret = false, value = "secret" },
    {
      name  = "INTERNAL_API_HOST", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["internal_api_host"])
    },
    {
      name  = "INTERNAL_API_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["internal_api_key"])
    },
    #    { name = "LINEAR_CLIENT_ID", secret = true, value = sensitive(data.vault_kv_secret_v2.secrets.data["linear_client_id"]) },
    #    { name = "LINEAR_CLIENT_SECRET", secret = true, value = sensitive(data.vault_kv_secret_v2.secrets.data["linear_client_secret"]) },
    {
      name  = "LINEAR_WEBHOOK_SECRET", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["linear_webhook_secret"])
    },
    {
      name  = "NODE_API_SENTRY_DSN", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["node_api_sentry_dsn"])
    },
    {
      name  = "OPENAI_API_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_openai_api_key"])
    },
  ])
  temporal_worker_ai_ts_image = module.temporal_worker_ai_ts_ecr
  temporal_worker_ai_ts_env_vars = [
    { name = "LOG_LEVEL", secret = false, value = "debug" },
    {
      name  = "OPENAI_API_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_openai_api_key"])
    },
    {
      name  = "ANTHROPIC_API_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_anthropic_api_key"])
    },
    {
      # The name of the HASH App project in Google Cloud
      # Note that this is different to the project the service account and identity federation providers are in
      # Must have Vertex AI enabled
      name  = "GOOGLE_CLOUD_HASH_PROJECT_ID", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["google_cloud_hash_project_id"])
    },
    {
      # The name of the Google Cloud Storage bucket to use for uploads
      # The authenticated GCP user must have object write and read permissions on the bucket
      name  = "GOOGLE_CLOUD_STORAGE_BUCKET", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["google_cloud_storage_bucket"])
    },
    {
      # The JSON with the configuration for the AWS Identity Federation Provider, downloaded from GCP
      # This should detail a connected service account with VertexAI permissions on the HASH project, and bucket read/write access
      name  = "GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["google_cloud_workload_identity_federation_config_json"])
    },
    {
      name  = "INTERNAL_API_HOST", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["internal_api_host"])
    },
    {
      name  = "INTERNAL_API_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["internal_api_key"])
    },
    {
      name  = "HASH_VAULT_HOST", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_vault_host"])
    },
    {
      name  = "HASH_VAULT_PORT", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_vault_port"])
    },
    { name = "HASH_VAULT_MOUNT_PATH", secret = false, value = "secret" },
    {
      name  = "HASH_TEMPORAL_WORKER_AI_SENTRY_DSN", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_temporal_worker_ai_sentry_dsn"])
    },
    { name = "AWS_REGION", secret = false, value = local.region },
    {
      name  = "AWS_S3_UPLOADS_ACCESS_KEY_ID", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["aws_s3_uploads_access_key_id"])
    },
    {
      name  = "AWS_S3_UPLOADS_BUCKET", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["aws_s3_uploads_bucket"])
    },
    {
      name  = "AWS_S3_UPLOADS_ENDPOINT", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["aws_s3_uploads_endpoint"])
    },
    {
      name  = "AWS_S3_UPLOADS_SECRET_ACCESS_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["aws_s3_uploads_secret_access_key"])
    },
    {
      name  = "HASH_TEMPORAL_WORKER_AI_AWS_ACCESS_KEY_ID", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_temporal_worker_ai_aws_access_key_id"])
    },
    {
      name  = "HASH_TEMPORAL_WORKER_AI_AWS_SECRET_ACCESS_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_temporal_worker_ai_aws_secret_access_key"])
    }
  ]
  temporal_worker_integration_image = module.temporal_worker_integration_ecr
  temporal_worker_integration_env_vars = [
    { name = "AWS_REGION", secret = false, value = local.region },
    { name = "LOG_LEVEL", secret = false, value = "debug" },
    {
      name  = "HASH_VAULT_HOST", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_vault_host"])
    },
    {
      name  = "HASH_VAULT_PORT", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_vault_port"])
    },
    { name = "HASH_VAULT_MOUNT_PATH", secret = false, value = "secret" },
    {
      name  = "HASH_TEMPORAL_WORKER_INTEGRATION_SENTRY_DSN", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["hash_temporal_worker_integration_sentry_dsn"])
    },
    {
      name  = "AERO_API_KEY", secret = true,
      value = sensitive(data.vault_kv_secret_v2.secrets.data["aero_api_key"])
    }
  ]
  temporal_host = module.temporal.host
  temporal_port = module.temporal.port

  otel_exporter_otlp_endpoint = module.observability.otel_otlp_endpoint
  amazon_trust_ca_bundle      = local.amazon_trust_ca_bundle
}
