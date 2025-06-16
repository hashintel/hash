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
    name = "name"

    # list with the following command to update:
    # `aws ec2 describe-images --owners amazon --filters "Name=name,Values=al2023-ami-ecs-hvm-*-x86_64" | jq '.Images | sort_by(.CreationDate) | reverse'`
    # We don't wildcard here to not accidentally update to a non-functioning image.
    #
    # IMPORTANT: if the image is changed, it breaks the dependency chain of the bastion host. This means, that the module needs to be re-applied
    # alone: `terraform apply --var-file prod-usea1.tfvars -target=module.bastion -target=module.tunnel`
    values = [
      "al2023-ami-ecs-hvm-2023.0.20250610-kernel-6.1-x86_64",
    ]
  }

  filter {
    name = "owner-alias"
    values = [
      "amazon",
    ]
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
