module "worker_task_ts" {
  source           = "../../modules/temporal_worker"
  prefix           = var.prefix
  param_prefix     = var.param_prefix
  subnets          = var.subnets
  vpc              = var.vpc
  env              = var.env
  region           = var.region
  cpu              = 256
  memory           = 512
  worker_name      = "aits"
  temporal_host    = var.temporal_host
  temporal_port    = var.temporal_port
  env_vars         = concat([{ name = "OPENAI_API_KEY", secret = true, value = var.openai_api_key }], var.api_env_vars)
  cluster_arn      = data.aws_ecs_cluster.ecs.arn
  ecs_health_check = ["CMD", "/bin/sh", "-c", "curl -f http://localhost:4100/health || exit 1"]
}

module "worker_task_py" {
  source           = "../../modules/temporal_worker"
  prefix           = var.prefix
  param_prefix     = var.param_prefix
  subnets          = var.subnets
  vpc              = var.vpc
  env              = var.env
  region           = var.region
  cpu              = 256
  memory           = 512
  worker_name      = "aipy"
  temporal_host    = var.temporal_host
  temporal_port    = var.temporal_port
  env_vars         = [{ name = "OPENAI_API_KEY", secret = true, value = var.openai_api_key }]
  cluster_arn      = data.aws_ecs_cluster.ecs.arn
  ecs_health_check = ["CMD", "/bin/sh", "-c", "curl -f http://localhost:4200/health || exit 1"]
}
