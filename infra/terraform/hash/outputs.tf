output "env" {
  value = module.variables.env
}

output "region" {
  value = module.variables.region
}

output "region_short" {
  value = module.variables.region_short
}

output "prefix" {
  value = module.variables.prefix
}

output "rds_hostname" {
  value = module.postgres.pg_host
}

output "temporal_hostname" {
  value = module.temporal.temporal_private_hostname
}
