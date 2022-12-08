data "aws_vpc" "main" {
  default = false
  tags    = { Name = "${var.prefix}-vpc" }
}

resource "aws_ecs_cluster" "ecs" {
  name = "${var.prefix}-${var.ecs_name}"
  tags = {}
}

resource "aws_ecs_cluster_capacity_providers" "ecs" {
  cluster_name       = aws_ecs_cluster.ecs.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}
