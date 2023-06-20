# VPC Spoke Peer module

This module contains configuration for setting up a VPC Spoke Peer. This is used to centralize PrivateLink connections to a single VPC (A VPC Hub), to reduce costs. We are currently not using the VPC Hub, but in case it is deployed, this module will be used to create the VPC Spoke Peer connections.

The module configures Route53 Resolver rules to allow DNS resolution between the VPC Spoke and the VPC Hub through a VPC Peering Connection.

Example usage of the module:

```hcl
data "aws_vpc" "spoke" {
  id = "..."
}

module "spoke" {
  source     = "../modules/vpc_spoke_peer"
  region     = var.region
  env        = var.env
  vpc_id     = data.aws_vpc.spoke.id
  # This should be the private subnet's route table ID.
  # If the rtpriv is the main route table of the VPC, you can use the `main_route_table_id` attribute.
  rtpriv_id  = "..."
  # The CIDR the hub was created with
  hub_cidr   = "10.10.0.0/16"
  # This CIDR and the Hub CIDR must not overlap. Other spoke CIDRs must not overlap either.
  spoke_cidr = aws_vpc.spoke.cidr_block
}
```

The spoke VPC ID doesn't need to be retrieved from the data source, if the containing TF module contains the VPC as a resource, it can be used instead.
