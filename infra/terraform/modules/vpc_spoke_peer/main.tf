/**
  * # Terraform AWS module: VPC Spoke Peering to VPC Hub
  *
  * Module responsible for allowing a VPC Spoke (the consumer of this module)
  * to peer to a VPC Hub in order to centralize PrivateLink networking.
  */

module "endpoints" {
  source = "../privatelink_endpoints"
  region = var.region
}

locals {
  endpoints = module.endpoints.endpoints
}

data "aws_route53_zone" "endpoints" {
  for_each     = local.endpoints
  name         = each.value.phz_name
  private_zone = true
  tags         = { Group = "vpc-hub" }
}

resource "aws_route53_zone_association" "main_vpc_assoc" {
  for_each = data.aws_route53_zone.endpoints
  zone_id  = each.value.zone_id
  vpc_id   = var.vpc_id
}

data "aws_vpc" "vpc_hub" {
  filter {
    name   = "tag:Group"
    values = ["vpc-hub"]
  }
}

data "aws_caller_identity" "current" {}

resource "aws_vpc_peering_connection" "hub_peering" {
  auto_accept   = true
  peer_owner_id = data.aws_caller_identity.current.account_id
  peer_vpc_id   = data.aws_vpc.vpc_hub.id
  vpc_id        = var.vpc_id
}

resource "aws_route" "peer" {
  route_table_id            = var.rtpriv_id
  destination_cidr_block    = var.hub_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.hub_peering.id
}

data "aws_route_table" "rthub" {
  vpc_id = data.aws_vpc.vpc_hub.id
}

resource "aws_route" "hub" {
  route_table_id            = data.aws_route_table.rthub.id
  destination_cidr_block    = var.spoke_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.hub_peering.id
}
