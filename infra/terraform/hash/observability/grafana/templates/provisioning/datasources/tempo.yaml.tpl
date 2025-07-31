# Tempo data source provisioning for Grafana
# Generated from Terraform template

apiVersion: 1

prune: true

datasources:
  - name: Tempo
    type: tempo
    uid: tempo
    access: proxy
    url: http://${tempo_api_dns}:${tempo_api_port}
    isDefault: false
    editable: false
    jsonData:
      httpMethod: GET
      search:
        hide: false
      nodeGraph:
        enabled: true

      tracesToLogs:
        datasourceUid: loki
        tags: ['service.name']
        mappedTags: [
          { key: 'service.name', value: 'service_name' }
        ]
        mapTagNamesEnabled: true
        filterByTraceID: true
      lokiSearch:
        datasourceUid: loki

      tracesToMetrics:
        datasourceUid: 'mimir'
        tags: [
          { key: 'service.name', value: 'service' }
        ]
        queries:
          - name: 'Request rate'
            query: 'rate(traces_spanmetrics_latency_bucket{$$__tags}[5m])'
          - name: 'Request duration'
            query: 'histogram_quantile(0.95, rate(traces_spanmetrics_latency_bucket{$$__tags}[5m]))'
      serviceMap:
        datasourceUid: mimir
