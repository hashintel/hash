variable "pg_db_name" {
  type        = string
  description = "Name of the DB to use"
}

variable "pg_superuser_username" {
  type        = string
  description = "Username for the 'superuser' user in the Postgres instance"
  default     = "superuser"
}

variable "pg_superuser_password" {
  type        = string
  sensitive   = true
  description = "Password for the 'superuser' user in the Postgres instance"
}

variable "pg_kratos_user_password_hash" {
  type        = string
  sensitive   = true
  description = "Hashed form of the 'kratos' user Postgres password."
}

variable "pg_graph_user_password_hash" {
  type        = string
  sensitive   = true
  description = "Hashed form of the 'graph' user Postgres password."
}

variable "pg_temporal_user_password_hash" {
  type        = string
  sensitive   = true
  description = "Hashed form of the 'temporal' user Postgres password."
}

variable "pg_spicedb_user_password_hash" {
  type        = string
  sensitive   = true
  description = "Hashed form of the 'spicedb' user Postgres password."
}
