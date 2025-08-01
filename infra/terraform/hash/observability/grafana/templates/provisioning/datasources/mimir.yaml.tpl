# Prometheus (Mimir) data source provisioning for Grafana
# Generated from Terraform template

apiVersion: 1

prune: true

datasources:
  - name: Mimir
    type: prometheus
    uid: mimir
    access: proxy
    url: http://${mimir_http_dns}:${mimir_http_port}/prometheus
    isDefault: true
    editable: false
    jsonData:
      httpMethod: POST
      timeInterval: "30s"
      queryTimeout: "60s"
      incrementalQueryOverlapWindow: "10m"
      exemplarTraceIdDestinations:
        - name: "Trace ID"
          datasourceUid: tempo
          urlDisplayLabel: "View Trace"
      prometheusType: "Mimir"
      prometheusVersion: "2.9.1"
