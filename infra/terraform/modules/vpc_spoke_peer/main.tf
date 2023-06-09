/**
  * # Terraform AWS module: VPC Spoke Peering to VPC Hub
  *
  * Module responsible for allowing a VPC Spoke (the consumer of this module)
  * to peer to a VPC Hub in order to centralize PrivateLink networking.
  */

data "aws_route53_zone" "endpoints" {
  tags         = { Group = "vpc-hub" }
  private_zone = true
}

resource "aws_route53_zone_association" "main_vpc_assoc" {
  for_each = data.aws_route53_zone.endpoints
  zone_id  = 
  vpc_id   = var.vpc_id
}
