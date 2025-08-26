terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# R2 Bucket for Rust mirror
resource "cloudflare_r2_bucket" "rust_mirror" {
  account_id = var.cloudflare_account_id
  name       = "${var.prefix}-rust-mirror"
  location   = "WNAM"  # Western North America
}

# R2 Custom Domain for production access
resource "cloudflare_r2_custom_domain" "rust_mirror" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.rust_mirror.name
  domain      = "rust-mirror.hash.dev"
  zone_id     = var.cloudflare_zone_id
  enabled     = true
  min_tls     = "1.3"
}



# Note: Lifecycle configuration not supported in current provider version
# TODO: Add lifecycle rules manually via Cloudflare dashboard or upgrade provider

# Worker for syncing Rust artifacts
resource "cloudflare_workers_script" "rust_mirror_sync" {
  account_id         = var.cloudflare_account_id
  script_name        = "${var.prefix}-rust-mirror-sync"
  content            = file("${path.module}/worker.js")
  compatibility_date = "2025-08-15"
  logpush            = true

  observability = {
    enabled = true
    logs = {
      enabled         = true
      invocation_logs = true
    }
  }

  bindings = [{
    name        = "RUST_MIRROR_BUCKET"
    type        = "r2_bucket"
    bucket_name = cloudflare_r2_bucket.rust_mirror.name
  }]
}

# Cron trigger for the worker (separate resource)
resource "cloudflare_workers_cron_trigger" "rust_mirror_sync" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.rust_mirror_sync.script_name
  schedules   = [{
    cron = "0 * * * *"  # Every hour
  }]
}
