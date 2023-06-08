output "node" {
  description = "Redis node connection information"
  value = {
    address = aws_elasticache_replication_group.redis.primary_endpoint_address,
    port    = aws_elasticache_replication_group.redis.port
  }
}
