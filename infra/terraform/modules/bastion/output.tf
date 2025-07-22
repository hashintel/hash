output "ssh_info" {
  value = {
    host        = aws_instance.bastion.public_ip
    private_key = tls_private_key.bastion_private_key.private_key_pem
    # Default for Amazon Linux
    user = "ec2-user"
  }
}

output "instance_id" {
  description = "The EC2 instance ID of the bastion host"
  value       = aws_instance.bastion.id
}
