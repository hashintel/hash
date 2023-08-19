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
