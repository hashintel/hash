# Grafana configuration management

# Configuration hash for task definition versioning
locals {
  config_hash = sha256(jsonencode({
    grafana_config   = aws_s3_object.grafana_config.content
    tempo_datasource = aws_s3_object.grafana_tempo_datasource.content
    loki_datasource  = aws_s3_object.grafana_loki_datasource.content
  }))
}

# Upload Grafana configuration generated from template
resource "aws_s3_object" "grafana_config" {
  bucket = var.config_bucket.id
  key    = "grafana/grafana.ini"

  # Generate config from template with environment-specific parameters
  content = templatefile("${path.module}/templates/grafana.ini.tpl", {
    environment   = terraform.workspace
    root_url      = var.root_url
    grafana_port  = local.grafana_port
    database_host = var.grafana_database_host
    database_port = var.grafana_database_port
  })

  content_type = "text/plain"

  tags = {
    Purpose = "Grafana Configuration"
    Service = "grafana"
  }
}

# Tempo datasource provisioning
resource "aws_s3_object" "grafana_tempo_datasource" {
  bucket = var.config_bucket.id
  key    = "grafana/provisioning/datasources/tempo.yaml"
  content = templatefile("${path.module}/templates/provisioning/datasources/tempo.yaml.tpl", {
    tempo_api_dns  = var.tempo_api_dns
    tempo_api_port = var.tempo_api_port
  })
  content_type = "application/x-yaml"

  tags = {
    Purpose = "Grafana Tempo Datasource"
    Service = "grafana"
  }
}

# Loki datasource provisioning
resource "aws_s3_object" "grafana_loki_datasource" {
  bucket = var.config_bucket.id
  key    = "grafana/provisioning/datasources/loki.yaml"
  content = templatefile("${path.module}/templates/provisioning/datasources/loki.yaml.tpl", {
    loki_http_dns  = var.loki_http_dns
    loki_http_port = var.loki_http_port
  })
  content_type = "application/x-yaml"

  tags = {
    Purpose = "Grafana Loki Datasource"
    Service = "grafana"
  }
}
