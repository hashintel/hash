/**
  * # Terraform AWS module: Base network
  *
  * Module responsible for creating the base network infrastructure.
  *
  * This includes:
  * - VPC
  * - Subnets (public and private)
  * - Internet gateway
  * - Route tables
  * - Basic IAM
  * - Flow logs (disabled for now)
  */

resource "aws_vpc" "main" {
  # IP address range 10.0.0.0 - 10.0.255.255 (65536 addresses)
  # We will have 10.0.0.0 - 10.0.127.0 contain the private subnet
  # and have 10.0.128.0 - 10.0.255.0 addresses contain the public subnet
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${var.prefix}-vpc" }
}

# Flow logs in VPC
resource "aws_flow_log" "flow_log" {
  count = var.enable_flow_logs ? 1 : 0
  tags  = { Name = "${var.prefix}-flowvpc" }

  iam_role_arn    = aws_iam_role.flow_log[0].arn
  log_destination = aws_cloudwatch_log_group.flow_log[0].arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id
}

resource "aws_cloudwatch_log_group" "flow_log" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.prefix}-flowlogvpc"
}

resource "aws_iam_role" "flow_log" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.prefix}-flowlogrole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "vpc-flow-logs.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
}

resource "aws_iam_role_policy" "flow_log" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.prefix}-iamflowlog"
  role  = aws_iam_role.flow_log[0].id

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ],
      "Effect": "Allow",
      "Resource": "*"
    }
  ]
}
EOF
}

# Gateway to allow communication between VPC and the internet
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
  tags = {
    Name = "${var.prefix}-igw"
  }
}

####################################
# Private subnet
####################################

# Private routing table used for the private subnet only
resource "aws_route_table" "rtpriv" {
  vpc_id = aws_vpc.main.id
  # Note: terraform automatically creates the "local" route on the VPC's CIDR block.
  # See: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route_table
  tags = {
    Name = "${var.prefix}-rtpriv"
    Tier = "private"
  }
}

# Create as many private subnets as availability zones specified
resource "aws_subnet" "snpriv" {
  count  = length(var.region_az_names)
  vpc_id = aws_vpc.main.id

  # Turn into a 10.0.0.0/24
  # 10.0.x.0 - 10.0.x.255 (256 addresses)
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone = var.region_az_names[count.index]
  tags = {
    Name    = "${var.prefix}-snpriv"
    NameIdx = "${var.prefix}-snpriv${count.index + 1}"
    Tier    = "private"
  }
}

# Routing association that allows traffic within the private subnet
resource "aws_route_table_association" "snpriv" {
  count = length(var.region_az_names)

  subnet_id      = aws_subnet.snpriv[count.index].id
  route_table_id = aws_route_table.rtpriv.id
}


####################################
# Public subnet
####################################

# Public routing table used for the public subnet
resource "aws_route_table" "rtpub" {
  depends_on = [aws_internet_gateway.igw]
  vpc_id     = aws_vpc.main.id
  # Note: terraform automatically creates the "local" route on the VPC's CIDR block
  # See: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route_table
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
  tags = {
    Name = "${var.prefix}-rtpub"
    Tier = "public"
  }
}

# Create as many public subnets as availability zones specified
resource "aws_subnet" "snpub" {
  count  = length(var.region_az_names)
  vpc_id = aws_vpc.main.id

  # Turn into a 10.0.0.0/24
  # 10.1.x.0 - 10.1.x.255 (256 addresses)
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, 128 + count.index)
  availability_zone = var.region_az_names[count.index]
  tags = {
    Name    = "${var.prefix}-snpub"
    NameIdx = "${var.prefix}-snpub${count.index + 1}"
    Tier    = "public"
  }
}

# Routing association that allows traffic to go through the internet gateway
resource "aws_route_table_association" "snpub" {
  count = length(var.region_az_names)

  subnet_id      = aws_subnet.snpub[count.index].id
  route_table_id = aws_route_table.rtpub.id
}
