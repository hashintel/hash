# Loki Configuration - Environment: ${environment}
# Generated from Terraform template

auth_enabled: false

server:
  http_listen_port: ${api_port}

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  replication_factor: 1
  ring:
    kvstore:
      store: memberlist

# Schema configuration for S3 backend with TSDB
schema_config:
  configs:
    - from: 2024-04-01
      store: tsdb
      object_store: s3
      schema: v13
      index:
        prefix: loki_index_
        period: 24h

# S3 storage configuration
storage_config:
  aws:
    s3: s3://${aws_region}/${loki_bucket}

  # TSDB shipper configuration for index storage
  tsdb_shipper:
    active_index_directory: /loki/index
    cache_location: /loki/index_cache

# Limits and retention configuration
limits_config:
  volume_enabled: true
  allow_structured_metadata: true
  reject_old_samples: true
  reject_old_samples_max_age: 168h  # 7 days (matches S3 lifecycle policy)
  retention_period: 168h            # 7 days retention

# Compactor for index management
compactor:
  working_directory: /loki/compactor
  compaction_interval: 5m
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
  delete_request_store: aws

# Query performance configuration
query_range:
  align_queries_with_step: true
  max_retries: 5
  cache_results: true

frontend:
  max_outstanding_per_tenant: 2048
  compress_responses: true
