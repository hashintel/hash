data "aws_availability_zones" "region_availability_zones" {
  # Only select Availability Zones and not Local Zones
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }

  # Return only AZs by region
  filter {
    name   = "group-name"
    values = [var.region]
  }
}
