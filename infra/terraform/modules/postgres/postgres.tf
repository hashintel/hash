
resource "aws_db_subnet_group" "postgres" {
  name       = "${var.prefix}-pgsubnetgrp"
  subnet_ids = var.subnets
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${var.prefix}-pgparamgrp14"
  family = "postgres14"

  parameter {
    name  = "password_encryption"
    value = "scram-sha-256"
  }
  # Currently we do not use logical replication
  # parameter {
  #   apply_method = "pending-reboot"
  #   name         = "rds.logical_replication"
  #   value        = "1"
  # }
}
resource "aws_security_group" "pg" {
  name   = "${var.prefix}-pg"
  vpc_id = var.vpc_id

  ingress {
    description = "Postgres from internet"
    from_port   = 5432
    to_port     = 5432
    cidr_blocks = [var.vpc_cidr_block]
    protocol    = "TCP"
    self        = false
  }
  egress {
    description = "Postgres to internet"
    from_port   = 5432
    to_port     = 5432
    cidr_blocks = [var.vpc_cidr_block]
    protocol    = "TCP"
    self        = false
  }
}

resource "aws_kms_key" "rds_key" {
  description             = "${var.prefix}-kmsrds"
  deletion_window_in_days = 14
  tags                    = { Name = "${var.prefix}-kmsrds" }
}

resource "aws_db_instance" "postgres" {
  identifier                      = "${var.prefix}-pg"
  final_snapshot_identifier       = "${var.prefix}-pgsnapshot"
  allocated_storage               = 20
  apply_immediately               = true
  backup_retention_period         = 7
  db_subnet_group_name            = aws_db_subnet_group.postgres.name
  parameter_group_name            = aws_db_parameter_group.postgres.name
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  engine                          = "postgres"
  engine_version                  = "14.6"
  allow_major_version_upgrade     = true
  instance_class                  = var.instance_class
  db_name                         = "postgres" # Initial database name
  username                        = var.pg_superuser_username
  port                            = var.pg_port
  password                        = var.pg_superuser_password
  vpc_security_group_ids          = [aws_security_group.pg.id]
  # Other security settings
  publicly_accessible = false
  multi_az            = true
  storage_encrypted   = true
  kms_key_id          = aws_kms_key.rds_key.arn
  # Default daily backup window
  # https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html#USER_WorkingWithAutomatedBackups.BackupWindow
}
