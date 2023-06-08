output "pg_host" {
  description = "Hostname of the Postgres instance"
  value       = aws_db_instance.postgres.address
}

output "pg_port" {
  description = "Port of the Postgres instance"
  value       = aws_db_instance.postgres.port
}

output "pg_db_name" {
  description = "The name of the DB created"
  value       = aws_db_instance.postgres.db_name
}
