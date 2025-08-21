resource "aws_ecs_cluster" "ecs" {
  name = "${var.prefix}-${var.ecs_name}"
  
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
  
  tags = {}
}

resource "aws_ecs_cluster_capacity_providers" "ecs" {
  cluster_name       = aws_ecs_cluster.ecs.name
  capacity_providers = var.capacity_providers
}
