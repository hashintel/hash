# Pyroscope data source provisioning for Grafana
# Generated from Terraform template

apiVersion: 1

prune: true

datasources:
  - name: Pyroscope
    type: grafana-pyroscope-datasource
    uid: pyroscope
    access: proxy
    url: http://${pyroscope_http_dns}:${pyroscope_http_port}
    isDefault: false
    editable: false
