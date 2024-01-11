output "setup_ecr" {
  description = "ECR repository for the setup image"
  value       = module.setup_ecr
}

output "migrate_ecr" {
  description = "ECR repository for the migrate image"
  value       = module.migrate_ecr
}

output "temporal_private_hostname" {
  description = "The private hostname of the Temporal server used with Service Discovery"
  value       = aws_lb.net_alb.dns_name
}

output "host_dns" {
  description = "The hostname of the Temporal cluster to connect to."
  value       = aws_lb.net_alb.dns_name
}

output "port" {
  description = "The port of the Temporal cluster to connect to."
  value       = local.temporal_port
}

output "temporal_ui_port" {
  description = "The port of the Temporal cluster to connect to."
  value       = local.temporal_ui_port
}
