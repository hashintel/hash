# Get Cloudflare zone for hash.ai

data "cloudflare_zones" "hash_ai" {
  name = "hash.ai"
}

resource "aws_route53_record" "otlp" {
  zone_id = var.vpc_zone_id
  name    = "otlp"
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.observability_internal.dns_name]
}

resource "aws_acm_certificate" "otlp" {
  domain_name       = "otlp.vpc.hash.ai"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "otlp.vpc.hash.ai"
  }
}

# Cloudflare DNS Records for ACM validation
resource "cloudflare_dns_record" "otlp_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.otlp.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = data.cloudflare_zones.hash_ai.result[0].id
  name    = each.value.name
  content = each.value.record
  type    = each.value.type
  ttl     = 1

  tags = ["terraform"]
}

# Wait for ACM validation
resource "aws_acm_certificate_validation" "otlp" {
  certificate_arn         = aws_acm_certificate.otlp.arn
  validation_record_fqdns = [for record in cloudflare_dns_record.otlp_cert_validation : trimsuffix(record.name, ".")]

  timeouts {
    create = "5m"
  }
}

resource "aws_route53_record" "profile" {
  zone_id = var.vpc_zone_id
  name    = "profile"
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.observability_internal.dns_name]
}


resource "aws_acm_certificate" "profile" {
  domain_name       = "profile.vpc.hash.ai"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "profile.vpc.hash.ai"
  }
}

# Cloudflare DNS Records for ACM validation
resource "cloudflare_dns_record" "profile_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.profile.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = data.cloudflare_zones.hash_ai.result[0].id
  name    = each.value.name
  content = each.value.record
  type    = each.value.type
  ttl     = 1

  tags = ["terraform"]
}

# Wait for ACM validation
resource "aws_acm_certificate_validation" "profile" {
  certificate_arn         = aws_acm_certificate.profile.arn
  validation_record_fqdns = [for record in cloudflare_dns_record.profile_cert_validation : trimsuffix(record.name, ".")]

  timeouts {
    create = "5m"
  }
}
