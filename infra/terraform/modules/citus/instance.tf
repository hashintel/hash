data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  owners = ["099720109477"] # Canonical
}

data "template_file" "cloudinit" {
  template = file("./cloud-init.yml")
  vars = {
    ecr_repo_url               = aws_ecr_repository.citus.repository_url
    ecr_registry_url           = split("/", aws_ecr_repository.citus.repository_url)[0]
    aws_region                 = var.region
    mount_volume_script_base64 = filebase64("./mount_volume.sh")
    data_ebs_volume_id         = replace(aws_ebs_volume.ebs1.id, "-", "")
  }
}

resource "aws_iam_role" "instance" {
  name = "${local.prefix}-citusinstancerole"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      },
    ]
  })
  inline_policy {
    name = "policy"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage",
          ]
          Resource = [aws_ecr_repository.citus.arn]
        },
        {
          Effect = "Allow"
          Action = [
            "ecr:GetAuthorizationToken",
          ]
          Resource = ["*"]
        },
        {
          Effect = "Allow"
          Action = [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ]
          Resource = ["*"]
        },
      ]
    })
  }
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.prefix}-citusprofile"
  role = aws_iam_role.instance.name
  tags = {}
}

resource "aws_security_group" "ssh" {
  name   = "${local.prefix}-citussg"
  vpc_id = data.terraform_remote_state.base.outputs.vpc_id

  ingress = [
    // @todo: should restrict this to the IP of a bastion host
    {
      description      = "SSH"
      from_port        = 22
      to_port          = 22
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
      protocol         = "TCP"
      prefix_list_ids  = []
      security_groups  = []
      self             = true
    },
    // @todo: should restrict this to the IP of a bastion host
    {
      description      = "Postgres connections"
      from_port        = 5432
      to_port          = 5432
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
      protocol         = "TCP"
      prefix_list_ids  = []
      security_groups  = []
      self             = true
    },
  ]

  egress = [
    {
      description      = "All outbound traffic"
      from_port        = 0
      to_port          = 0
      protocol         = "-1"
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
      prefix_list_ids  = []
      security_groups  = []
      self             = true
    }
  ]

  lifecycle {
    // Required to prevent the terraform from getting stuck trying to destroy the
    // resouce
    create_before_destroy = true
  }
}

resource "aws_instance" "citus1" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = data.terraform_remote_state.base.outputs.subnet_pub1_id
  associate_public_ip_address = true
  user_data                   = data.template_file.cloudinit.rendered
  vpc_security_group_ids      = [aws_security_group.ssh.id]
  iam_instance_profile        = aws_iam_instance_profile.instance.name
  availability_zone           = var.az[var.region][0]
  tags = {
    Name = "${local.prefix}-citusec2"
  }
}

resource "aws_ebs_volume" "ebs1" {
  availability_zone = var.az[var.region][0]
  size              = 20 # GB
  type              = "gp3"
  tags = {
    Name = "${local.prefix}-citusebs1"
  }
}

resource "aws_volume_attachment" "ebs_att1" {
  device_name = "/dev/sda2"
  volume_id   = aws_ebs_volume.ebs1.id
  instance_id = aws_instance.citus1.id
}

