output "env" {
  value = module.variables_hash.env
}

output "region" {
  value = module.variables_hash.region
}

output "region_short" {
  value = module.variables_hash.region_short
}

output "prefix" {
  value = module.variables_hash.prefix
}

output "rds_hostname" {
  value = module.postgres.pg_host
}

output "temporal_hostname" {
  value = module.temporal.temporal_private_hostname
}

output "hash_application_ecs_iam_task_role_arn" {
  value = module.application.ecs_iam_task_role.arn
}

output "hash_application_ecs_iam_task_role_name" {
  value = module.application.ecs_iam_task_role.name
}

output "bastion_instance_id" {
  description = "The EC2 instance ID of the bastion host"
  value       = module.bastion.instance_id
}
