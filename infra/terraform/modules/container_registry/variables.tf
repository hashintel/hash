variable "prefix" {
  type        = string
  description = "The prefix to use for resource names, includes region and env"
}

variable "ecr_name" {
  type        = string
  description = "The name to give the ECR repository"

  validation {
    condition     = can(regex("^[a-z]+$", var.ecr_name))
    error_message = "ECR repository name must only contain lowercase letters"
  }
}
