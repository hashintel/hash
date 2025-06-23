output "host" {
  value       = data.external.tunnel.result.host
  description = "Tunnelled host"
}

output "port" {
  value       = data.external.tunnel.result.port
  description = "Tunnelled port"
}
