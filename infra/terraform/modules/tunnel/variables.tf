variable "ssh_host" {
  type        = string
  description = "The hostname of the machine to SSH through"
}

variable "ssh_port" {
  type        = number
  description = "The port of the machine to SSH through"
}

variable "ssh_user" {
  type        = string
  description = "The user of the machine to SSH through"
}

variable "ssh_private_key" {
  type        = string
  description = "The private key of the machine to SSH through"
}

variable "tunnel_target_host" {
  type        = string
  description = "The target host"
}

variable "tunnel_target_port" {
  type        = number
  description = "Target port number"
}

variable "timeout" {
  type        = string
  description = "Connection timeout"
  default     = "30m"
}
