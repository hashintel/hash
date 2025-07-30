# Tempo data source provisioning for Grafana
# Generated from Terraform template

apiVersion: 1

prune: true

datasources:
  - name: Tempo
    version: 1
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
