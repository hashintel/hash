output "vpc" {
  description = "The main VPC"
  value       = aws_vpc.main
}

output "snpriv" {
  value       = aws_subnet.snpriv
  description = "The private subnets of the VPC"
}

output "snpub" {
  value       = aws_subnet.snpub
  description = "The public subnets of the VPC"
}

output "rtpriv" {
  value       = aws_route_table.rtpriv
  description = "The private routing table"
}

output "rtpub" {
  value       = aws_route_table.rtpub
  description = "The public routing table"
}

output "igw" {
  value       = aws_internet_gateway.igw
  description = "The internet gateway"
}
