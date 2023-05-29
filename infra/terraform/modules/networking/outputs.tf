output "vpc" {
  description = "The main VPC"
  value       = module.base_network.vpc
}

output "snpriv" {
  value       = module.base_network.snpriv[*].id
  description = "IDs of the private subnets"
}

output "snpub" {
  value       = module.base_network.snpub[*].id
  description = "IDs of the public subnets"
}

