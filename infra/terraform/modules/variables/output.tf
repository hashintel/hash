output "env" {
  value = var.env
}

output "region" {
  value = var.region
}

output "region_short" {
  value = var.region_short[var.region]
}

locals {
  az_names = data.aws_availability_zones.region_availability_zones.names
  # If 'region_az_names' is greater than the actual number of AZs available, default to using all AZs in region
  region_az_names = length(local.az_names) <= var.region_az_count ? local.az_names : slice(local.az_names, 0, var.region_az_count)
}

output "region_az_names" {
  value = local.region_az_names
}

output "prefix" {
  value = "h-${var.project}-${var.env}-${var.region_short[var.region]}"
}

output "param_prefix" {
  value = "/h-${var.project}/${var.env}"
}
