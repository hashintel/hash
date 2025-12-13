locals {
  prefix = "${var.prefix}-bastion"
}

resource "tls_private_key" "bastion_private_key" {
  algorithm = "RSA"
}

resource "aws_key_pair" "bastion_key" {
  depends_on = [tls_private_key.bastion_private_key]
  key_name   = "${local.prefix}key"
  public_key = tls_private_key.bastion_private_key.public_key_openssh
}

resource "local_sensitive_file" "private_key" {
  depends_on = [
    tls_private_key.bastion_private_key,
  ]
  content         = tls_private_key.bastion_private_key.private_key_pem
  file_permission = "0600"
  filename        = "${local.prefix}key.pem"
}

# Bastion Host configuration
resource "aws_launch_template" "bastion" {
  depends_on = [aws_key_pair.bastion_key]
  name       = "${local.prefix}template"
  image_id   = data.aws_ami.amazon_linux.id
  key_name   = aws_key_pair.bastion_key.key_name

  iam_instance_profile {
    name = aws_iam_instance_profile.bastion.name
  }

  network_interfaces {
    associate_public_ip_address = true
    delete_on_termination       = true
    security_groups             = [aws_security_group.bastion.id]
  }

  block_device_mappings {
    device_name = var.device_name

    ebs {
      delete_on_termination = true
      volume_size           = var.volume_size
      volume_type           = var.volume_type
      encrypted             = true
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}


resource "aws_security_group" "bastion" {
  name   = "${local.prefix}ssh"
  vpc_id = var.vpc_id

  revoke_rules_on_delete = true

  lifecycle {
    create_before_destroy = true
  }
}

# resource "aws_vpc_security_group_ingress_rule" "bastion_ssh_ipv4" {
#   for_each = toset(var.ingress_cidr_blocks)

#   security_group_id = aws_security_group.bastion.id
#   cidr_ipv4         = each.value
#   from_port         = var.ssh_port
#   to_port           = var.ssh_port
#   ip_protocol       = tcp
# }

# resource "aws_vpc_security_group_ingress_rule" "bastion_ssh_ipv6" {
#   for_each = toset(var.ingress_ipv6_cidr_blocks)

#   security_group_id = aws_security_group.bastion.id
#   cidr_ipv6         = each.value
#   from_port         = var.ssh_port
#   to_port           = var.ssh_port
#   ip_protocol       = tcp
# }


resource "aws_vpc_security_group_egress_rule" "bastion_ssh_ipv4" {
  for_each = toset(var.egress_cidr_blocks)

  security_group_id = aws_security_group.bastion.id
  cidr_ipv4         = each.value
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "bastion_ssh_ipv6" {
  for_each = toset(var.egress_ipv6_cidr_blocks)

  security_group_id = aws_security_group.bastion.id
  cidr_ipv6         = each.value
  ip_protocol       = "-1"
}

resource "aws_iam_role" "bastion" {
  name               = "${local.prefix}role"
  path               = "/"
  assume_role_policy = data.aws_iam_policy_document.bastion_role_assume_role_policy.json
}

resource "aws_iam_role_policy_attachment" "ssm_policy" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${local.prefix}instprofile"
  role = aws_iam_role.bastion.name
}

resource "aws_instance" "bastion" {
  depends_on    = [aws_key_pair.bastion_key]
  tags          = { Name = local.prefix }
  subnet_id     = var.subnet_ids[0]
  instance_type = "t4g.nano"

  launch_template {
    name    = aws_launch_template.bastion.name
    version = "$Latest"
  }
}
