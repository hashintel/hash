# Loki data source provisioning for Grafana
# Generated from Terraform template

apiVersion: 1

prune: true

datasources:
  - name: Loki
    version: 1
    type: loki
    uid: loki
    access: proxy
    url: http://${loki_api_dns}:${loki_api_port}
    isDefault: false
    editable: false
    jsonData:
      httpMethod: GET
      derivedFields:
        - name: Trace ID
          datasourceUid: tempo
          matcherType: label
          matcherRegex: trace_id
          url: $$${__value.raw}
          urlDisplayLabel: View Trace
