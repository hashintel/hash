variable "region" {
  type        = string
  description = "The AWS region"
}

output "endpoints" {
  value = {
    # Allow secrets to be fetched from the private subnet
    # SSM contain the Parameter Store, which stores secrets.
    ssm = {
      name        = "com.amazonaws.${var.region}.ssm"
      type        = "Interface"
      private_dns = false
      phz_name    = "ssm.${var.region}.amazonaws.com"
      alias       = [""]
    }
    # Allow Fargate Exec control messages
    ssmmessages = {
      name        = "com.amazonaws.${var.region}.ssmmessages"
      type        = "Interface"
      private_dns = false
      phz_name    = "ssmmessages.${var.region}.amazonaws.com"
      alias       = [""]
    }
    # Used for various Fargate related operations and Fargate Exec
    ec2messages = {
      name        = "com.amazonaws.${var.region}.ec2messages"
      type        = "Interface"
      private_dns = false
      phz_name    = "ec2messages.${var.region}.amazonaws.com"
      alias       = [""]
    }
    # Used for logging to CloudWatch
    ec2logs = {
      name        = "com.amazonaws.${var.region}.logs"
      type        = "Interface"
      private_dns = false
      phz_name    = "logs.${var.region}.amazonaws.com"
      alias       = [""]
    }
    # Allow fetching ECR data within the private subnet from ECS
    # Used to pull OCI containers
    # See https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html#ecr-vpc-endpoint-considerations
    ecrdkr = {
      name        = "com.amazonaws.${var.region}.ecr.dkr"
      type        = "Interface"
      private_dns = false
      phz_name    = "dkr.ecr.${var.region}.amazonaws.com"
      # The wildcard alias "*" allows us to request by 
      # entries in the AWS account namespace.
      alias = ["", "*"]
    }
    # Used to pull OCI containers
    ecrapi = {
      name        = "com.amazonaws.${var.region}.ecr.api"
      type        = "Interface"
      private_dns = false
      phz_name    = "api.ecr.${var.region}.amazonaws.com"
      alias       = [""]
    }
    # Allows access to S3 buckets
    # Also required to pull OCI containers from ECS
    s3 = {
      name        = "com.amazonaws.${var.region}.s3"
      type        = "Interface"
      private_dns = false
      phz_name    = "s3.${var.region}.amazonaws.com"
      # The wildcard alias "*", allows us to request by 
      # the bucket name without listing them all.
      # IAM rules would ensure only the correct buckets are accessible.
      alias = ["", "*"]
    }
  }
}
