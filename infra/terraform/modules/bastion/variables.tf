variable "env" {
  type        = string
  description = "The environment, defaults to the selected workspace."
}

variable "region" {
  type        = string
  description = "The AWS region"
}

variable "prefix" {
  type        = string
  description = "The prefix to use for resource names, includes region and env"
}

variable "vpc_id" {
  type        = string
  description = "The VPC to deploy the components within"
}


variable "ssh_port" {
  description = "SSH port used to access a bastion host."
  default     = 22
}

variable "ingress_cidr_blocks" {
  type        = list(string)
  description = "List of CIDR ranges to allow ssh access at security group level. Defaults to 0.0.0.0/0"
  default     = ["0.0.0.0/0"]
}

variable "ingress_ipv6_cidr_blocks" {
  type        = list(string)
  description = "List of IPv6 CIDR ranges to allow ssh access at security group level. Defaults to ::/0"
  default     = ["::/0"]
}

variable "egress_cidr_blocks" {
  type        = list(string)
  description = "List of CIDR ranges to allow outbound traffic at security group level. Defaults to 0.0.0.0/0"
  default     = ["0.0.0.0/0"]
}

variable "egress_ipv6_cidr_blocks" {
  type        = list(string)
  description = "List of IPv6 CIDR ranges to allow outbound traffic at security group level. Defaults to ::/0"
  default     = ["::/0"]
}

variable "device_name" {
  type        = string
  description = "The name of the device to mount."
  default     = "/dev/xvda"
}

variable "volume_size" {
  type        = number
  description = "The size of the volume in gigabytes."
  default     = 30
}

variable "volume_type" {
  type        = string
  description = "The type of volume. Can be `standard`, `gp2`, or `io1`."
  default     = "gp2"
}

variable "subnet_ids" {
  type        = list(string)
  description = "The subnets to run the bastion host within"
}
