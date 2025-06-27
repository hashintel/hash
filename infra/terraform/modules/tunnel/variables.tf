variable "use_ssm" {
  type        = bool
  description = "Use SSM Session Manager for tunneling instead of SSH"
  default     = true
}

variable "bastion_instance_id" {
  type        = string
  description = "The EC2 instance ID of the bastion host (for SSM tunneling)"
  default     = null
}

variable "aws_region" {
  type        = string
  description = "AWS region for SSM session"
  default     = null
}

variable "ssh_host" {
  type        = string
  description = "The hostname of the machine to SSH through (for SSH tunneling)"
  default     = null
}

variable "ssh_port" {
  type        = number
  description = "The port of the machine to SSH through (for SSH tunneling)"
  default     = 22
}

variable "ssh_user" {
  type        = string
  description = "The user of the machine to SSH through (for SSH tunneling)"
  default     = null
}

variable "ssh_private_key" {
  type        = string
  description = "The private key of the machine to SSH through (for SSH tunneling)"
  default     = null
}

variable "tunnel_target_host" {
  type        = string
  description = "The target host"
}

variable "tunnel_target_port" {
  type        = number
  description = "Target port number"
}

variable "tunnel_max_attempts" {
  type        = number
  description = "Maximum number of attempts to verify tunnel connectivity"
  default     = 10
}

variable "timeout" {
  type        = string
  description = "Connection timeout"
  default     = "30m"
}

variable "local_tunnel_port" {
  type        = number
  description = "Local port to bind the tunnel to"
  default     = 45678
}
