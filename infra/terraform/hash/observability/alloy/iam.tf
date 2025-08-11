# IAM roles and policies for Grafana Alloy

# Task execution role for ECS (downloading from S3, etc.)
resource "aws_iam_role" "execution_role" {
  name_prefix = "${var.prefix}-alloy-exec-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    Purpose = "Grafana Alloy ECS execution role"
  }
}

# Attach the basic ECS task execution role policy
resource "aws_iam_role_policy_attachment" "execution_role_policy" {
  role       = aws_iam_role.execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task role for running containers (used by application)
resource "aws_iam_role" "task_role" {
  name_prefix = "${var.prefix}-alloy-task-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  # S3 config access (same pattern as OTEL Collector)
  inline_policy {
    name = "s3-config-access"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "s3:ListBucket"
          ]
          Resource = var.config_bucket.arn
        },
        {
          Effect = "Allow"
          Action = [
            "s3:GetObject"
          ]
          Resource = "${var.config_bucket.arn}/alloy/*"
        }
      ]
    })
  }

  # Grafana Alloy CloudWatch permissions
  inline_policy {
    name = "alloy-cloudwatch-access"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "tag:GetResources",
            "cloudwatch:GetMetricData",
            "cloudwatch:GetMetricStatistics",
            "cloudwatch:ListMetrics",
            "apigateway:GET",
            "aps:ListWorkspaces",
            "autoscaling:DescribeAutoScalingGroups",
            "dms:DescribeReplicationInstances",
            "dms:DescribeReplicationTasks",
            "ec2:DescribeTransitGatewayAttachments",
            "ec2:DescribeSpotFleetRequests",
            "shield:ListProtections",
            "storagegateway:ListGateways",
            "storagegateway:ListTagsForResource",
            "iam:ListAccountAliases",
            "ecs:ListServices",
            "ecs:DescribeServices",
            "ecs:ListClusters",
            "ecs:DescribeClusters",
            "elasticloadbalancing:DescribeLoadBalancers",
            "elasticloadbalancing:DescribeTargetGroups"
          ]
          Resource = "*"
        }
      ]
    })
  }

  tags = {
    Purpose = "Grafana Alloy ECS task role"
  }
}

# SSM permissions for ECS execute command
resource "aws_iam_role_policy_attachment" "ssm_managed_instance_core" {
  role       = aws_iam_role.task_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
