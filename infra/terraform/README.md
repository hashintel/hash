# Terraform infrastructure

This folder contains Terraform modules to deploy a HASH instance on AWS. The entry-point module is located in [`./hash/`](./hash/).

## Getting started

1.  Install the [terraform CLI](https://learn.hashicorp.com/tutorials/terraform/install-cli)
1.  Install Docker
1.  Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and configure it to use [your credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html)
1.  Initialize the terraform modules by executing the following command in [`./hash/`](./hash/): `terraform init`

After initializing, you'll be put into the `default` workspace which isn't allowed for the plan.
You can create new workspace names by creating/selecting new workspaces:

```console
$ terraform workspace new prod # Or to select another workspace
prod
$ terraform workspace select prod
prod
```

By default, the selected region is `us-east-1` and can be configured by editing the TF variables used for applying the TF plan, e.g. the one in [`./hash/prod-usea1.tfvars`](./hash/prod-usea1.tfvars).

# Deploying

Deployment currently relies on a couple of manual steps - but is to be automated in the future. The container registries need to have images pushed in the correct place for the applications to start and the database has to be migrated manually. The order of executions for deployment:

1.  Deploy infrastructure with terraform
1.  Migrate databases
1.  Build/push docker images

## Deploy infrastructure with terraform

You must prepare a `tfvars` file containing secrets to spin up the environment. This can be done by creating a file in `./hash/prod.secrets.tfvars` containing the following definitions (change the values):

```tfvars
hash_seed_users = [
  { "email" = "admin@hash.ai", "shortname" = "instance-admin", "preferredName" = "Instance Admin", "password" = "changeme", "isInstanceAdmin" = true }
]

hash_system_user_password = "changeme"

hash_block_protocol_api_key = "Generate at https://blockprotocol.org/settings/api-keys"

kratos_secrets_cookie = "VERY-INSECURE-AND-SHOULD-ONLY-BE-USED-IN-DEV"
kratos_secrets_cipher = "32-LONG-SECRET-NOT-SECURE-AT-ALL"

kratos_api_key = "secret"

pg_superuser_password    = "changeme"
pg_kratos_user_password  = { raw = "changeme", hash = "See guide below to generate this" }
pg_graph_user_password   = { raw = "changeme", hash = "See guide below to generate this" }
```

<details>
<summary>Generate PG password hash</summary>

**PG Users**

The database is configured to use `scram-sha-256` for password auth.
To generate a hashed password in this form:

1.  Start a local DB:
    `$ docker run --rm -it --name postgres-dummy -d -e POSTGRES_HOST_AUTH_METHOD=trust postgres:14-alpine`
1.  Connect to instance
    `$ docker exec -it postgres-dummy psql -U postgres`
1.  Reset password
    `postgres=# \password`
    (type in your password twice)
1.  Extract password
    `select rolpassword from pg_authid where rolname = 'postgres';`
1.  Copy the result, repeat from step 3 as needed
1.  Quit wiht `\q` and stop the container
    `docker stop postgres-dummy`

</details>

Deployment can then be done by issuing the following command after initializing a terraform workspace with a functioning AWS connection from the [`./hash/`](./hash/) folder:

```console
$ terraform workspace show
prod
$ terraform apply --var-file prod-usea1.tfvars --var-file prod.secrets.tfvars
..
```

Note that it may be required to disable refreshing state for subsequent applies (because of the Postgres SSH tunnel. Data sources are deferred to the apply phase usually).

```console
$ terraform apply --var-file prod-usea1.tfvars --var-file prod.secrets.tfvars -refresh=false
..
```

## 2. Migrate databases

Once the terraform infrastructure is deployed, you should have an RDS Postgres database accessible from the bastion host with `graph` and `kratos` users/dbs. These need to be migrated locally in preparation for starting the services.

Before migrating, you must start an SSH tunnel through the bastion host to access the database. This can be done by executing the following command from the [`./hash/`](./hash/) folder:

```console
$ terraform output -raw rds_hostname
h-hash-prod-usea1-pg.*.us-east-1.rds.amazonaws.com # * = some unique ID for your RDS instance
..
$ ./ssh_bastion.sh -N -L 5554:h-hash-dev-usea1-pg.*.us-east-1.rds.amazonaws.com:5432
..
```

> There should be no output from the command after the RSA art. The tunnel should be running, though.
> **Be sure to keep this running while you run all migrations to completion!**

This will start an SSH tunnel making `localhost:5554` point to the remote RDS instance within the private subnet in AWS.

To migrate the graph, you must first build the docker container that contains the migrations and run it with the graph credentials you put into the [`./hash/prod.secrets.tfvars`](./hash/prod.secrets.tfvars) file:

```console
$ DOCKER_BUILDKIT=1 docker build ./packages/graph -f ./packages/graph/deployment/migrations/Dockerfile -t hash-graph-migrate:latest
..
$ docker run --rm --network host -e 'HASH_GRAPH_PG_MIGRATION_URL=postgres://graph:changeme@localhost:5554/graph' hash-graph-migrate:latest
..
```

You can simultaneously run the migrations for Kratos:

```console
$ DOCKER_BUILDKIT=1 docker build ./apps/external-services/kratos --build-arg ENV=prod -t kratos:latest
..
$ docker run --network host --rm -e "DSN=postgres://kratos:changeme@localhost:5554/kratos" kratos:latest migrate sql -e --yes
..
```

The Kratos migrations may take a couple of minutes, but while the migrations are running, you can build/push the service container images in the next step.

## 3. Build/push docker images

You must build images for `hash-graph`, `hash-api` and `kratos` to push to ECR (`buildkit` env variable may be optional)
Depending on your AWS account ID (`$AWS_ID`), your selected terraform workspace (`$WORKSPACE`) and AWS region (`$REGION`) and region short name (`$REGION_SHORT`) your ECR URL will be different. The general structure is as follows:

```text
$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-hash-$WORKSPACE-$REGION_SHORT-graphecr:latest
$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-hash-$WORKSPACE-$REGION_SHORT-kratosecr:latest
$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-hash-$WORKSPACE-$REGION_SHORT-apiecr:latest
```

> If you receive a message about needing to log in, you can run the following AWS CLI command to authorize local push:
> `aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 000000000000.dkr.ecr.$REGION.amazonaws.com`

The build and push commands ran from the root of this ([`hashintel/hash`](../../)) repo:

**Building `hash-graph`**:

```console
$ DOCKER_BUILDKIT=1 docker build ./packages/graph -f ./packages/graph/deployment/graph/Dockerfile -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-graphecr:latest
..
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-graphecr:latest
..
```

**Building `hash-api`**:

```console
$ DOCKER_BUILDKIT=1 docker build . -f ./packages/hash/docker/api/prod/Dockerfile -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-apiecr:latest
..
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-apiecr:latest
..
```

**Building `kratos`** (same as the migration container, with a secret passed in):

For Kratos, it's required to provide some build-time args to ensure a secure instance running in production mode (and configuring an API secret `$SECRET` which should match the `kratos_api_key` tfvar).

```console
$ DOCKER_BUILDKIT=1 docker build ./apps/external-services/kratos --build-arg ENV=prod --build-arg API_SECRET=$SECRET -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-kratosecr:latest
..
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-kratosecr:latest
..
```

# Management

You've already seen the SSH command located in [`./hash/ssh_bastion.sh`](./hash/ssh_bastion.sh) which is used to SSH into the AWS VPC. This SSH connection is general-purpose and can be used without the tunnel part just as `./ssh_bastion.sh` without any args.

Alternatively, you should be able to start an AWS Systems Manager session to the bastion host from the AWS Console, https://us-east-1.console.aws.amazon.com/systems-manager/session-manager/sessions?region=us-east-1 (change region to your desired region).

The ECS Fargate containers are also accessible through the AWS CLI using Fargate Exec. An example command would look like this:

```console
$ aws ecs list-tasks --cluster h-hash-prod-usea1-ecs --service h-hash-prod-usea1-appsvc
.. "arn:aws:ecs:us-east-1:$AWS_ID:task/h-hash-prod-usea1-ecs/TASKID"
$ aws ecs execute-command --cluster h-hash-prod-usea1-ecs --task TASKID --container h-hash-prod-usea1-apicontainer --interactive --command "/bin/sh"
..
```

where the `TASKID` is the ID of the Fargate service task. Note that this would start an `sh` session directly into your production container, and should be done with caution (if it ever should be done). It's recommended not to run commands against the production environment like this, and we may at some point restrict access to Fargate Exec.

# Structure of the modules

Under the [`./modules/`](./modules/) folder we define the HASH application through an ECS Fargate service and various external services.

- [`variables`](./modules/variables/) - contains global variable validation/definitions used for the rest of the modules through the [`./hash/`](./hash/) entrypoint.
- [`networking`](./modules/networking/) - contains the VPC (Virtual Private Cloud) definitions and networking setup defining private and public subnets.
- [`bastion`](./modules/bastion/) - a [Bastion host](https://en.wikipedia.org/wiki/Bastion_host) that resides in the public subnet with access to the private subnet. Accessible through SSH.
- [`tunnel`](./modules/tunnel/) - a custom SSH tunnel using an external data source to allow terraform to connect to services on the private subnet of the VPC.
- [`container_registry`](./modules/container_registry/) - is a thin wrapper around the `aws_ecr_repository` resource with container evicition policies
- [`container_cluster`](./modules/container_cluster/) - is a thin wrapper around the `aws_ecs_cluster` resource.
- [`redis`](./modules/redis/) - [external service] a multi Availability Zone Redis cluster with encryption enabled.
- [`postgres`](./modules/postgres/) - [external service] a multi Availability Zone Postgres RDS cluster with encryption enabled.
- [`postgres_roles`](./modules/postgres_roles/) - SQL configurations for the HASH application defining grants, roles and databases (requires an SSH tunnel to connect to the RDS instance).
- [`hash_application`](./modules/hash_application/)` - the ECS Fargate container definition using the previous ECR and ECS cluster definitions to start the Graph layer, the HASH API and Kratos.

```mermaid
graph TD;
    networking
    variables
    hash

    hash-->container_cluster
    hash-->hash_application
    hash-->container_registry
    hash-->postgres_roles
    hash-->tunnel
    hash-->redis
    hash-->postgres

    tunnel-->postgres_roles
    postgres-->postgres_roles


    container_cluster-->hash_application
    container_registry-->hash_application
```
