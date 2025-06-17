# Bastion hosts

The Bastion hosts defined through this configuration is used for accessing the private subnet of our AWS VPC. Bastion hosts are spun up per environment (e.g. `prod` and `dev`) and connect using current terraform outputs.

## SSM Session Manager (Recommended)

The modern way to access the bastion host is through AWS Systems Manager Session Manager. This method doesn't require SSH keys or managing security groups for SSH access.

### Direct shell access

```shell
aws ssm start-session --target $(terraform output -raw bastion_instance_id)
```

### PostgreSQL database tunneling

To create a tunnel to the PostgreSQL database:

```shell
aws ssm start-session \
  --target $(terraform output -raw bastion_instance_id) \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$(terraform output -raw rds_hostname),portNumber=5432,localPortNumber=5554"
```

After the tunnel is established, you can connect to the database locally:

```shell
psql "postgresql://graph:PASSWORD@localhost:5554/DATABASE"
```

e.g.

```shell
psql "postgresql://graph:PASSWORD@localhost:5554/graph"
```

## SSH Method (Legacy)

The traditional SSH method is still available but requires SSH key management.

It is possible to SSH into the Bastion host by running the `./ssh_bastion.sh` script. This script will use the currently selected terraform workspace to SSH into the appropriate host.

The Bastion host can also act as a jump host to SSH tunnel a service to your local machine. For example to forward the RDS instance in the private subnet to your local machine, run

```shell
./ssh_bastion.sh -L 5554:h-hash-prod-usea1-pg.*.us-east-1.rds.amazonaws.com:5432
```

This will SSH into the bastion host, but also bind `localhost:5554` to `h-hash-prod-usea1-pg.*.us-east-1.rds.amazonaws.com:5432` on the remote host.

To only map the port and not SSH into the bastion host, run

```shell
./ssh_bastion.sh -N -L "5554:$(terraform output -raw rds_hostname):5432"
```

This will automatically use the currently selected terraform workspace.
