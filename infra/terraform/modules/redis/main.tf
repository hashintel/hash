locals {
  prefix = "${var.prefix}-redis"
}

resource "aws_elasticache_subnet_group" "default" {
  name       = "${local.prefix}subnet"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "redis" {
  name        = "${local.prefix}sg"
  description = "Security group for Elasticache Redis cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr_block]
  }

  tags = {
    Name = "${local.prefix}sg"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id        = "${local.prefix}replica"
  description                 = "Redis multi-AZ replication group for HASH"
  engine                      = "redis"
  automatic_failover_enabled  = true
  preferred_cache_cluster_azs = var.region_az_names
  node_type                   = var.node_type
  parameter_group_name        = "default.redis7"
  num_cache_clusters          = 2
  port                        = 6379
  subnet_group_name           = aws_elasticache_subnet_group.default.name
  security_group_ids          = [aws_security_group.redis.id]
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true

  tags = {
    Name = "${local.prefix}replica"
  }
}
