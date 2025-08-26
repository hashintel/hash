variable "cloudflare_account_id" {
  description = "Cloudflare Account ID (for R2 CNAME)"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for hash.dev domain"
  type        = string
}

variable "prefix" {
  description = "Resource prefix for naming consistency"
  type        = string
}

variable "env" {
  description = "Environment (prod, staging, dev)"
  type        = string
}
