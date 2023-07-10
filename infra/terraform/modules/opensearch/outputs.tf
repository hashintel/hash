output "opensearch_arn" {
  description = "The ARN of the OpenSearch cluster"
  value       = aws_elasticsearch_domain.search.arn
}

output "opensearch_vpc_endpoint" {
  description = "The endpoint of the OpenSearch cluster within the VPC"
  value       = aws_elasticsearch_domain.search.endpoint
}
