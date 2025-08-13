variable "prefix" {
  type        = string
  description = "Prefix for resource naming"
}

variable "severity" {
  type        = string
  description = "Alert severity level (critical, warning, info)"
  validation {
    condition     = contains(["critical", "warning", "info"], var.severity)
    error_message = "Severity must be one of: critical, warning, info"
  }
}

variable "slack_webhook_url" {
  type        = string
  description = "Slack webhook URL for notifications"
  sensitive   = true
}