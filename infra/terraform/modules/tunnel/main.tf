/**
  * # Terraform module: Tunnel
  *
  * Module responsible for creating the tunnel infrastructure for accessing private resources.
  * For resources in private subnets, we need to create a tunnel through a bastion host.
  *
  * The module supports both SSH and SSM (Systems Manager) tunneling methods.
  * SSM is preferred as it's more secure and doesn't require managing SSH keys.
  */

data "external" "tunnel" {
  program = var.use_ssm ? ["${path.module}/ssm_tunnel.sh"] : ["${path.module}/ssh_tunnel.sh"]
  query = var.use_ssm ? {
    bastion_instance_id = var.bastion_instance_id,
    tunnel_target_host  = var.tunnel_target_host,
    tunnel_target_port  = var.tunnel_target_port,
    tunnel_max_attempts = var.tunnel_max_attempts,
    local_tunnel_port   = var.local_tunnel_port,
    timeout             = var.timeout,
    aws_region          = var.aws_region,
  } : {
    ssh_host            = var.ssh_host,
    ssh_port            = var.ssh_port,
    ssh_user            = var.ssh_user,
    ssh_private_key     = var.ssh_private_key,
    tunnel_target_host  = var.tunnel_target_host,
    tunnel_target_port  = var.tunnel_target_port,
    tunnel_max_attempts = var.tunnel_max_attempts,
    local_tunnel_port   = var.local_tunnel_port,
    timeout             = var.timeout,
  }
}
