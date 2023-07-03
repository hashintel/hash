variable "capacity_providers" {
  type        = list(string)
  description = "The capacity providers to use for the ECS cluster. Beware that FARGATE_SPOT can introduce instability."
  default     = ["FARGATE"]
}

variable "prefix" {
  type        = string
  description = "The prefix to use for resource names, includes region and env"
}

variable "ecs_name" {
  type        = string
  description = "The name to give the ECS cluster"

  validation {
    condition     = can(regex("^[a-z]+$", var.ecs_name))
    error_message = "ECS cluster name must only contain lowercase letters"
  }
}
