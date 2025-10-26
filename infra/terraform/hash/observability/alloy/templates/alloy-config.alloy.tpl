// Grafana Alloy CloudWatch Exporter Configuration

prometheus.exporter.cloudwatch "ecs" {
  sts_region = "${region}"

  decoupled_scraping {
    enabled         = true
    scrape_interval = "1m"
  }

  // RDS instance metrics
  discovery {
    type                        = "AWS/RDS"
    regions                     = ["${region}"]
    dimension_name_requirements = ["DBInstanceIdentifier"]
    recently_active_only        = true

    // Capacity & health
    metric {
      name                     = "CPUUtilization"
      statistics               = ["Average", "Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "FreeableMemory"
      statistics               = ["Minimum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "FreeStorageSpace"
      statistics               = ["Minimum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "SwapUsage"
      statistics               = ["Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "DatabaseConnections"
      statistics               = ["Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
  }

  // AWS/ECS Service-level metrics
  discovery {
    type                        = "AWS/ECS"
    regions                     = ["${region}"]
    dimension_name_requirements = ["ClusterName", "ServiceName"]
    recently_active_only        = true

    metric {
      name                     = "CPUUtilization"
      statistics               = ["Average", "Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "MemoryUtilization"
      statistics               = ["Average", "Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "CPUReservation"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "MemoryReservation"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
  }

  // ECS Container Insights metrics
  discovery {
    type                        = "ECS/ContainerInsights"
    regions                     = ["${region}"]
    dimension_name_requirements = ["ClusterName", "ServiceName"]
    recently_active_only        = true

    metric {
      name                     = "CpuUtilized"
      statistics               = ["Average", "Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "CpuReserved"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "MemoryUtilized"
      statistics               = ["Average", "Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "MemoryReserved"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "NetworkRxBytes"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "NetworkTxBytes"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "StorageReadBytes"
      statistics               = ["Sum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "StorageWriteBytes"
      statistics               = ["Sum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "EphemeralStorageUtilized"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "EphemeralStorageReserved"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "RunningTaskCount"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "DesiredTaskCount"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "TaskCpuUtilization"
      statistics               = ["Average", "Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "TaskMemoryUtilization"
      statistics               = ["Average", "Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "TaskEphemeralStorageUtilization"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "ContainerCpuUtilization"
      statistics               = ["Average", "Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "ContainerMemoryUtilization"
      statistics               = ["Average", "Maximum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "ContainerNetworkRxBytes"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "ContainerNetworkTxBytes"
      statistics               = ["Average"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "ContainerStorageReadBytes"
      statistics               = ["Sum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "ContainerStorageWriteBytes"
      statistics               = ["Sum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
    metric {
      name                     = "RestartCount"
      statistics               = ["Sum"]
      period                   = "1m"
      length                   = "5m"
      add_cloudwatch_timestamp = true
    }
  }
}

// Scrape CloudWatch metrics and forward directly to Mimir
prometheus.scrape "cloudwatch_metrics" {
  targets    = prometheus.exporter.cloudwatch.ecs.targets
  forward_to = [otelcol.receiver.prometheus.cloudwatch.receiver]
}

// Convert Prometheus metrics to OTLP and send directly to Mimir
otelcol.receiver.prometheus "cloudwatch" {
  output {
    metrics = [otelcol.exporter.otlphttp.mimir.input]
  }
}

otelcol.exporter.otlphttp "mimir" {
  client {
    endpoint = "http://${mimir_http_dns}:${mimir_http_port}/otlp"
    tls {
      insecure = true
    }
  }
}

pyroscope.receive_http "profiles_internal" {
  http {
    listen_address = "0.0.0.0"
    listen_port    = ${profile_port_internal}
  }

  forward_to = [pyroscope.write.pyroscope_internal.receiver]
}

pyroscope.write "pyroscope_internal" {
  endpoint {
    url = "http://${pyroscope_http_dns}:${pyroscope_http_port}"
  }

  external_labels = {
    "env" = "${environment}",
  }
}

pyroscope.receive_http "profiles_external" {
  http {
    listen_address = "0.0.0.0"
    listen_port    = ${profile_port_external}
  }

  forward_to = [pyroscope.write.pyroscope_external.receiver]
}

pyroscope.write "pyroscope_external" {
  endpoint {
    url = "http://${pyroscope_http_dns}:${pyroscope_http_port}"
  }

  external_labels = {
    "env" = "external",
  }
}
