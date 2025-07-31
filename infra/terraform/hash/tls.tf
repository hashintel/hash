data "cloudflare_zone" "hash_ai" {
  name = "hash.ai"
}

# Download Amazon Trust Services CA certificates dynamically
# For AWS Certificate Manager certificate verification
data "http" "amazon_root_ca_1" {
  url = "https://www.amazontrust.com/repository/AmazonRootCA1.pem"
}

data "http" "amazon_root_ca_2" {
  url = "https://www.amazontrust.com/repository/AmazonRootCA2.pem"
}

data "http" "amazon_root_ca_3" {
  url = "https://www.amazontrust.com/repository/AmazonRootCA3.pem"
}

data "http" "amazon_root_ca_4" {
  url = "https://www.amazontrust.com/repository/AmazonRootCA4.pem"
}

data "http" "starfield_services_root_ca_g2" {
  url = "https://www.amazontrust.com/repository/SFSRootCAG2.pem"
}

# Combined Amazon Trust Services CA bundle for ACM certificate verification
locals {
  amazon_trust_ca_bundle = join("\n", [
    data.http.amazon_root_ca_1.response_body,
    data.http.amazon_root_ca_2.response_body,
    data.http.amazon_root_ca_3.response_body,
    data.http.amazon_root_ca_4.response_body,
    data.http.starfield_services_root_ca_g2.response_body
  ])
}

# CAA Record to allow AWS Certificate Manager to issue certificates
resource "cloudflare_record" "caa_hash_ai" {
  zone_id = data.cloudflare_zone.hash_ai.id
  name    = "hash.ai"
  type    = "CAA"

  data {
    flags = 0
    tag   = "issue"
    value = "amazon.com"
  }

  tags = ["terraform"]
}

# Private Hosted Zone for internal AWS services
# Shared across all modules for internal service DNS resolution
resource "aws_route53_zone" "vpc" {
  name = "vpc.hash.ai"

  vpc {
    vpc_id = module.networking.vpc.id
  }

  tags = {
    Name              = "Internal services zone"
    terraform_managed = "true"
  }
}
