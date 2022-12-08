output "ssh_info" {
  value = {
    host        = aws_instance.bastion.public_ip
    private_key = tls_private_key.bastion_private_key.private_key_pem
    # Default for Amazon Linux
    user = "ec2-user"
  }
}
