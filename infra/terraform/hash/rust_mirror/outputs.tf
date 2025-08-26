# output "mirror_url" {
#   description = "URL of the Rust mirror"
#   value       = "https://${cloudflare_dns_record.rust_mirror.name}.hash.dev"
# }

output "bucket_name" {
  description = "Name of the R2 bucket"
  value       = cloudflare_r2_bucket.rust_mirror.name
}

output "worker_name" {
  description = "Name of the sync worker"
  value       = cloudflare_workers_script.rust_mirror_sync.script_name
}
