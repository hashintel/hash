# OpenTelemetry Collector Configuration
# Environment: ${environment}
# Generated from Terraform template

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:${grpc_port}
      http:
        endpoint: 0.0.0.0:${http_port}

processors:
  batch:
    timeout: ${batch_timeout}
    send_batch_size: ${batch_size}

exporters:
  debug:
    verbosity: ${debug_verbosity}

extensions:
  health_check:
    endpoint: 0.0.0.0:${health_port}

service:
  extensions: [health_check]

  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]

    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]

    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
