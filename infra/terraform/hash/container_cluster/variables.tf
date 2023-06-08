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
