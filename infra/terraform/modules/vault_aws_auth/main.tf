/**
  * # Terraform AWS module: Vault AWS Auth
  *
  * Module responsible for creating AWS credentials through Vault.
  * Our infrastructure is set up in a way that allows us to create
  * temporary AWS STS credentials, which this module will conditionally
  * do depending on whether or not we're in a CI/CD pipeline.
  */

data "external" "env" {
  program = ["${path.module}/env.sh"]
}

locals {
  in_ci = data.external.env.result["in_ci"]
}

data "vault_aws_access_credentials" "aws_credentials" {
  count   = local.in_ci ? 0 : 1
  backend = "aws"
  region  = var.region
  role    = "${var.env}-deploy"
  type    = "sts"
}

output "access_key" {
  value       = local.in_ci ? null : data.vault_aws_access_credentials.aws_credentials[0].access_key
  description = "Either an access_key to a temporary STS user, or null"
}

output "secret_key" {
  value       = local.in_ci ? null : data.vault_aws_access_credentials.aws_credentials[0].secret_key
  description = "Either a secret_key to a temporary STS user, or null"
}

output "token" {
  value       = local.in_ci ? null : data.vault_aws_access_credentials.aws_credentials[0].security_token
  description = "Either a security_token to a temporary STS user, or null"
}
