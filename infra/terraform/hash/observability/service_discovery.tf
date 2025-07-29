# Service Discovery namespace for observability services
# Enables Service Connect for internal communication between observability components

resource "aws_service_discovery_private_dns_namespace" "observability" {
  name        = var.prefix
  vpc         = var.vpc.id
  description = "Service discovery namespace for observability stack"

  tags = {
    Name    = var.prefix
    Purpose = "Service discovery for observability services"
  }
}
