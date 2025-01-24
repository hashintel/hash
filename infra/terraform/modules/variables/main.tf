/**
  * # Terraform AWS module: Variables
  *
  * Module responsible for creating the variables used in the project.
  * The module doesn't add any resources, it is primarily used to
  * validate/generate variables that are used in other modules.
  */

data "aws_availability_zones" "region_availability_zones" {
  # Only select Availability Zones and not Local Zones
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }

  # Return only AZs by region
  filter {
    name   = "region-name"
    values = [var.region]
  }
}
