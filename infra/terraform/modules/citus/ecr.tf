resource "aws_ecr_repository" "citus" {
  name = "${local.prefix}-citusecr"
  tags = {}
}
