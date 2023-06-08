/**
  * # Terraform module: Tunnel
  *
  * Module responsible for creating the SSH tunnel infrastructure.
  * For some resouces in private subnets, we need to create an SSH tunnel
  * through a bastion host to access them.
  *
  * The module calls out to a bash script that establishes an SSH tunnel.
  */

data "external" "ssh_tunnel" {
  program = ["${path.module}/ssh_tunnel.sh"]
  query = {
    ssh_host           = var.ssh_host,
    ssh_port           = var.ssh_port,
    ssh_user           = var.ssh_user,
    ssh_private_key    = var.ssh_private_key,
    tunnel_target_host = var.tunnel_target_host,
    tunnel_target_port = var.tunnel_target_port
    local_tunnel_port  = 45678
    timeout            = var.timeout,
  }
}
