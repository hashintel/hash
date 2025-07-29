# Tempo data source provisioning for Grafana
# Generated from Terraform template

apiVersion: 1

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
    version: 1
