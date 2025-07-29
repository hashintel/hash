# Tempo Configuration - Environment: ${environment}
# Generated from Terraform template
#
# TODO: Consider persistent WAL storage (EFS) vs current /tmp approach for better durability
# TODO: Configure shared ring storage (Redis/memberlist) for multi-instance scaling

server:
  http_listen_port: ${api_port}
  log_level: info

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:${otlp_port}

ingester:
  # Memory management - balance between performance and memory usage  
  max_block_duration: 5m         # Force block creation every 5 minutes (default: 30m)
  max_block_bytes: 50000000      # Force block creation at 50MB (default: 500MB)
  complete_block_timeout: 3m     # Wait 3min for late spans before flushing (default: 15m)
  trace_idle_period: 5s          # Flush traces from memory after 5s of inactivity (default: 5s)
  flush_check_period: 10s        # Check for flushable traces every 10s (default: 10s)
  lifecycler:
    ring:
      kvstore:
        store: memberlist
      replication_factor: 1

# TODO: Tune querier limits for performance vs resource usage
querier:
  # TODO: Adjust concurrent queries based on memory capacity
  max_concurrent_queries: 3           # TODO: Increase to 10 when memory issues resolved
  search:
    # TODO: Tune query timeout based on acceptable response times
    query_timeout: 30s                # TODO: Consider increasing to 60s for complex queries
  trace_by_id:
    # TODO: Tune trace lookup timeout
    query_timeout: 10s                # TODO: Consider increasing if needed

storage:
  trace:
    backend: s3
    # TODO: Upgrade to vParquet4 for better TraceQL performance, but requires 1.5x more memory
    # Currently using default format due to memory constraints - need 3GB+ RAM for Parquet
    # block:
    #   version: vParquet4  # Would enable better search performance but increase memory usage
    wal:
      # Using /tmp for WAL (Write-Ahead Log) storage
      # Data loss on container restart is acceptable for this deployment phase:
      # - WAL is temporary storage for in-flight traces before S3 persistence
      # - Container restarts are rare in ECS with proper health checks
      # - S3 backend provides durability for completed trace data
      # - EFS would add latency and potential concurrency issues (WAL is local per-instance storage)
      # - WAL is designed for local file system persistence, not shared storage
      path: /tmp/tempo-wal
    s3:
      bucket: ${tempo_bucket}
      region: ${aws_region}
      endpoint: s3.${aws_region}.amazonaws.com

# TODO: Replace temporary local storage with Mimir integration for persistent metrics
# Currently using /tmp storage - metrics will be lost on container restart
# Need to configure remote_write to Mimir when available
metrics_generator:
  storage:
    path: /tmp/tempo-metrics          # TODO: Replace with persistent storage or remote_write to Mimir
  ring:
    kvstore:
      store: memberlist
  # TODO: Tune ingestion controls for memory management
  metrics_ingestion_time_range_slack: 30s   # TODO: Reduce to 15s when memory issues resolved
  # TODO: Adjust query timeout for metrics queries
  query_timeout: 30s                        # TODO: Consider reducing to 15s for faster failures  
  processor:
    service_graphs:
      # TODO: Tune max_items based on actual service topology
      max_items: 1000                 # TODO: Increase to 10000 when memory issues resolved
    span_metrics:
      # TODO: Add more dimensions when memory allows (http.method, status.code, etc)
      dimensions: ["service.name"]    # TODO: Add resource.deployment.environment, http.method

compactor:
  compaction:
    compaction_cycle: 5m   # Reduced from 30m to prevent memory spikes from large batches
    block_retention: 168h  # 7 days (matches S3 lifecycle policy)
