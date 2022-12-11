resource "aws_ecr_repository" "ecr" {
  name = "${var.prefix}-${var.ecr_name}"
  tags = {}
}

resource "aws_ecr_lifecycle_policy" "ecr_policy" {
  repository = aws_ecr_repository.ecr.name
  # Lifetime policy always keeps 'latest' image
  # It also ensures only one 'latest' image
  # Evicts any other images when count > 10 in total (including latest)
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1,
        description  = "Keep Latest Image",
        selection = {
          tagStatus     = "tagged",
          tagPrefixList = ["latest"],
          countType     = "imageCountMoreThan",
          countNumber   = 1
        },
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2,
        description  = "Prune Old Images",
        selection = {
          tagStatus   = "any",
          countType   = "imageCountMoreThan",
          countNumber = 10
        },
        action = {
          type = "expire"
        }
      }
    ]
  })
}
