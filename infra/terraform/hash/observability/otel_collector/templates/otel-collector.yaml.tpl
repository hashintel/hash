# OpenTelemetry Collector Configuration
# Environment: ${environment}
# Generated from Terraform template

receivers:
  # Internal OTLP receiver for service-to-service communication (Tempo, etc.)
  otlp/internal:
    protocols:
      grpc:
        endpoint: 0.0.0.0:${grpc_port_internal}
      http:
        endpoint: 0.0.0.0:${http_port_internal}

  # External OTLP receiver for client applications
  otlp/external:
    protocols:
      grpc:
        endpoint: 0.0.0.0:${grpc_port_external}
      http:
        endpoint: 0.0.0.0:${http_port_external}

processors:
  # Memory limiter to prevent OOM kills (512MB container - 50MB overhead = ~450MB limit)
  memory_limiter:
    check_interval: 1s
    limit_mib: 400
    spike_limit_mib: 80  # 20% of limit_mib

  batch:
    timeout: ${batch_timeout}
    send_batch_size: ${batch_size}

  # Resource processor for internal services - preserve existing environment attributes
  resource/internal:
    attributes:
      # https://opentelemetry.io/docs/specs/semconv/resource/deployment-environment/
      - key: deployment.environment.name
        value: ${environment}
        action: insert  # Preserve existing environment attributes (e.g., "development", "staging")

  # Resource processor for external services - upsert environment attribute
  resource/external:
    attributes:
      # https://opentelemetry.io/docs/specs/semconv/resource/deployment-environment/
      - key: deployment.environment.name
        value: external
        action: upsert  # Always set external services to "external" environment

connectors:
  forward/traces:
  forward/metrics:
  forward/logs:

exporters:
  nop:
  otlp/tempo:
    endpoint: ${tempo_otlp_grpc_dns}:${tempo_otlp_grpc_port}
    tls:
      insecure: true
  otlphttp/loki:
    endpoint: http://${loki_http_dns}:${loki_http_port}/otlp
    tls:
      insecure: true

extensions:
  health_check:
    endpoint: 0.0.0.0:${health_port}

service:
  extensions: [health_check]

  pipelines:
    # Input pipelines - add environment attributes and forward to common processing
    traces/internal:
      receivers: [otlp/internal]
      processors: [memory_limiter, resource/internal]
      exporters: [forward/traces]

    metrics/internal:
      receivers: [otlp/internal]
      processors: [memory_limiter, resource/internal]
      exporters: [forward/metrics]

    logs/internal:
      receivers: [otlp/internal]
      processors: [memory_limiter, resource/internal]
      exporters: [forward/logs]


    traces/external:
      receivers: [otlp/external]
      processors: [memory_limiter, resource/external]
      exporters: [forward/traces]

    metrics/external:
      receivers: [otlp/external]
      processors: [memory_limiter, resource/external]
      exporters: [forward/metrics]

    logs/external:
      receivers: [otlp/external]
      processors: [memory_limiter, resource/external]
      exporters: [forward/logs]


    # Common output pipelines - shared processing and export
    traces:
      receivers: [forward/traces]
      processors: [batch]
      exporters: [otlp/tempo]

    metrics:
      receivers: [forward/metrics]
      processors: [batch]
      exporters: [nop]

    logs:
      receivers: [forward/logs]
      processors: [batch]
      exporters: [otlphttp/loki]
