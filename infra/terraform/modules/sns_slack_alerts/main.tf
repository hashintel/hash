# SNS to Slack Alerts Module
# Provides clean, formatted Slack notifications via Lambda transformer

# SNS Topic for alerts
resource "aws_sns_topic" "alerts" {
  name = "${var.prefix}-${var.severity}-alerts"

  tags = {
    Name     = "${var.prefix}-${var.severity}-alerts"
    Purpose  = "${var.severity} level alerts via Slack"
    Severity = var.severity
  }
}

# Lambda function to transform SNS messages to Slack format
resource "aws_lambda_function" "sns_to_slack" {
  function_name = "${var.prefix}-${var.severity}-slack-alert"
  role          = aws_iam_role.lambda_execution.arn
  handler       = "index.handler"
  runtime       = "python3.10"
  timeout       = 30

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      SLACK_WEBHOOK_URL = var.slack_webhook_url
      ALERT_SEVERITY    = var.severity
    }
  }

  tags = {
    Name     = "${var.prefix}-${var.severity}-slack-alert"
    Purpose  = "Transform SNS alerts to Slack format"
    Severity = var.severity
  }
}

# Lambda source code package
data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "/tmp/${var.prefix}-${var.severity}-slack-alert.zip"
  
  source {
    content  = file("${path.module}/slack_alert.py")
    filename = "index.py"
  }
}

# IAM role for Lambda execution
resource "aws_iam_role" "lambda_execution" {
  name = "${var.prefix}-${var.severity}-slack-alert-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# Lambda execution policy
resource "aws_iam_role_policy" "lambda_execution" {
  name = "${var.prefix}-${var.severity}-slack-alert-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# SNS Topic Subscription to Lambda
resource "aws_sns_topic_subscription" "lambda" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.sns_to_slack.arn
}

# Allow SNS to invoke Lambda
resource "aws_lambda_permission" "allow_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sns_to_slack.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}