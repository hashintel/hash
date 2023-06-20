resource "aws_security_group" "search" {
  name   = "${local.prefix}-search"
  vpc_id = data.terraform_remote_state.base.outputs.vpc_id

  ingress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"

    # Allow connections only from within the VPC
    cidr_blocks = [
      data.terraform_remote_state.base.outputs.vpc_cidr_block
    ]
  }
}

# A Service Linked Role is required for AWS OpenSearch inside a VPC
resource "aws_iam_service_linked_role" "search" {
  aws_service_name = "es.amazonaws.com"
}

resource "aws_cloudwatch_log_group" "search" {
  name              = "${local.prefix}-searchlog"
  retention_in_days = 7
  tags              = {}
}

resource "aws_cloudwatch_log_resource_policy" "search" {
  policy_name = "${local.prefix}-searchlogpolicy"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "es.amazonaws.com"
        }
        Action = [
          "logs:PutLogEvents",
          "logs:PutLogEventsBatch",
          "logs:CreateLogStream"
        ],
        Resource = ["arn:aws:logs:*"]
      }
    ]
  })
}

resource "aws_elasticsearch_domain" "search" {
  domain_name           = "${local.prefix}-search"
  elasticsearch_version = "OpenSearch_1.0"
  vpc_options {
    subnet_ids = [
      data.terraform_remote_state.base.outputs.subnet_priv1_id,
      # data.terraform_remote_state.base.outputs.subnet_priv2_id,
    ]
    security_group_ids = [aws_security_group.search.id]
  }
  cluster_config {
    instance_count = 1 # can only have one subnet with a single node
    instance_type  = "t3.small.elasticsearch"
  }
  ebs_options {
    ebs_enabled = true
    volume_size = 10    # in GiB
    volume_type = "gp2" # only option for t3.small
  }
  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.search.arn
    log_type                 = "ES_APPLICATION_LOGS"
  }
  depends_on = [
    aws_iam_service_linked_role.search
  ]
}

resource "aws_elasticsearch_domain_policy" "search" {
  domain_name = aws_elasticsearch_domain.search.domain_name
  access_policies = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action    = "es:*",
        Principal = "*",
        Effect    = "Allow",
        Resource  = "${aws_elasticsearch_domain.search.arn}/*"
      }
    ]
  })
}
