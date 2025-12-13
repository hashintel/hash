/**
  * # Terraform AWS module: Bastion
  *
  * Module responsible for creating the bastion host infrastructure.
  * A bastion host is used to allow SSH access to the private subnet.
  *
  * This includes:
  * - Security group
  * - EC2 instance
  * - IAM
  */

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-6.1-arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

data "aws_iam_policy_document" "bastion_role_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.${data.aws_partition.current.dns_suffix}"]
    }
  }
}
