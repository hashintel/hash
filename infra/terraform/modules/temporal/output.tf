output "setup_ecr" {
  description = "ECR repository for the setup image"
  value       = module.setup
}

output "migrate_ecr" {
  description = "ECR repository for the migrate image"
  value       = module.migrate
}
