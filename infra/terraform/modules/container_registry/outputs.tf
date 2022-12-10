output "ecr_arn" {
  description = "The ARN of the ECR repository"
  value       = aws_ecr_repository.ecr.arn
}

output "url" {
  description = "The URL of the ECR repository"
  value       = aws_ecr_repository.ecr.repository_url
}
