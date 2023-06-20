output "instance_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_instance.citus1.public_ip
}

output "ecr_repo_url" {
  description = "URL of the ECR repository for the Citus image"
  value       = aws_ecr_repository.citus.repository_url
}

output "ecr_repo_name" {
  description = "Name of the ECR repository for the Citus image"
  value       = regex("^.*/(.*)$", aws_ecr_repository.citus.repository_url)[0]
}
