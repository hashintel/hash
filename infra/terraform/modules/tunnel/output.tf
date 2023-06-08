output "host" {
  value       = data.external.ssh_tunnel.result.host
  description = "Tunnelled host"
}

output "port" {
  value       = data.external.ssh_tunnel.result.port
  description = "Tunnelled port"
}
