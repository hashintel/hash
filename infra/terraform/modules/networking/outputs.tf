output "vpc" {
  description = "The main VPC"
  value       = aws_vpc.main
}

output "snpriv" {
  value       = aws_subnet.snpriv[*].id
  description = "IDs of the private subnets"
}

output "snpub" {
  value       = aws_subnet.snpub[*].id
  description = "IDs of the public subnets"
}

