output "ecs_cluster_arn" {
  description = "The ARN of the main ECS cluster"
  value       = aws_ecs_cluster.ecs.arn
}
