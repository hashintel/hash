# Mimir Configuration - Single binary with S3 storage
target: all
multitenancy_enabled: false

server:
  http_listen_port: ${http_port}
  grpc_listen_port: ${grpc_port}
  log_level: warn

# Common S3 configuration
common:
  storage:
    backend: s3
    s3:
      endpoint: s3.${aws_region}.amazonaws.com
      region: ${aws_region}

# Override bucket names for different storage types
blocks_storage:
  s3:
    bucket_name: ${mimir_blocks_bucket}

alertmanager_storage:
  s3:
    bucket_name: ${mimir_alertmanager_bucket}

ruler_storage:
  s3:
    bucket_name: ${mimir_ruler_bucket}

# Ring configuration for single binary
distributor:
  ring:
    kvstore:
      store: memberlist

ingester:
  ring:
    kvstore:
      store: memberlist
    replication_factor: 1

# Basic limits
limits:
  ingestion_rate: 100000
  compactor_blocks_retention_period: 168h  # 7 days
  max_global_series_per_user: 0  # Unlimited series for single-tenant setup

# Disable usage reporting (requires external HTTPS calls)
# Note: Services only have AWS CA bundle, not full system CAs
usage_stats:
  enabled: false
