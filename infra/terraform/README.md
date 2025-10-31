# Terraform infrastructure

This folder contains Terraform modules to deploy a HASH instance on AWS. The entry-point module is located in [`./hash/`](./hash/).

## Getting started

1. Install the [Terraform CLI](https://learn.hashicorp.com/tutorials/terraform/install-cli)
2. Install Docker
3. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and configure it to use [your credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html)
4. Initialize the Terraform modules by executing the following command in [`./hash/`](./hash/): `terraform init`

After initializing, you'll be put into the `default` workspace which isn't allowed for the plan.
You can create new workspace names by creating/selecting new workspaces:

```console
$ terraform workspace new prod # Or to select another workspace
prod
$ terraform workspace select prod
prod
```

By default, the selected region is `us-east-1` and can be configured by editing the Terraform variables used for applying the Terraform plan (e.g. the one in [`./hash/prod.auto.tfvars`](./hash/prod.auto.tfvars)).

# Naming convention

Resources use the following naming convention:

```text
{OWNER}-{PROJECT}-{ENV}-{REGION}-{RESOURCE DESCRIPTION}

OWNER : 'h' for hash
PROJECT : 'hash'
ENV : 'dev' or 'prod'  (maybe others too later)
REGION : AWS region shortened -- 'usea1' etc.
RESOURCE DESCRIPTION : a short description of the resource e.g. 'subnetpub1'
```

Fields (e.g. Owner, Project) may _not_ include any hyphens.

Example _valid_ names: `h-hash-prod-usea1-vpc`, `h-hash-dev-usea2-apisvc`
Example _invalid_ name: `h-hash-prod-usea1-api-svc`

(Inspired by https://stepan.wtf/cloud-naming-convention/)

The region and environment fields are set by the variables supplied in the `*.tfvars` file. The config automatically shortens AWS region names, for example, `us-east-1` will be converted to `usea1`.

# Deploying

Deployment currently relies on a couple of manual steps - but is to be automated in the future. The container registries need to have images pushed in the correct place for the applications to start and the database has to be migrated manually. The order of executions for deployment:

1. Deploy infrastructure with terraform
2. Migrate databases
3. Build/push docker images

## Deploy infrastructure with terraform

Secret environment should be provided in HashiCorp Vault. These are expected in a kvv2 secrets engine path starting with `pipelines/hash/` and ending with the environment name, e.g. for a secrets engine `automation` the path would be `automation/pipelines/hash/prod`. The following secrets are expected:

```json5
{
  aws_s3_uploads_access_key_id: "changeme",
  aws_s3_uploads_secret_access_key: "changeme",
  aws_s3_uploads_bucket: "changeme",
  aws_s3_uploads_endpoint: "changeme", // if not using the default S3 endpoint, e.g. if using another S3-compatible service
  graph_sentry_dsn: "https://changeme.ingest.sentry.io/changeme",
  hash_api_rudderstack_key: "changeme",
  hash_block_protocol_api_key: "changeme",
  hash_openai_api_key: "changeme",
  hash_seed_users: [
    {
      email: "changeme@example.com",
      isInstanceAdmin: true,
      password: "changeme",
      preferredName: "Instance Admin",
      shortname: "instance-admin",
    },
  ],
  hydra_secrets_system: "changeme",
  hydra_secrets_cookie: "changeme",
  kratos_api_key: "changeme",
  kratos_secrets_cipher: "32-LONG-SECRET-NOT-SECURE-AT-ALL",
  kratos_secrets_cookie: "changeme",
  linear_webhook_secret: "changeme",
  mailchimp_api_key: "changeme",
  mailchimp_list_id: "changeme",
  node_api_sentry_dsn: "https://changeme.ingest.sentry.io/changeme",
  pg_graph_user_password_hash: "SCRAM-SHA-256$4096:calculateme-see-postgres_roles.tf",
  pg_graph_user_password_raw: "changeme",
  pg_hydra_user_password_hash: "SCRAM-SHA-256$4096:calculateme-see-postgres_roles.tf",
  pg_hydra_user_password_raw: "changeme",
  pg_kratos_user_password_hash: "SCRAM-SHA-256$4096:calculateme-see-postgres_roles.tf",
  pg_kratos_user_password_raw: "changeme",
  pg_superuser_password: "changeme",
  pg_temporal_user_password_hash: "SCRAM-SHA-256$4096:calculateme-see-postgres_roles.tf",
  pg_temporal_user_password_raw: "changeme",
  pg_temporal_visibility_user_password_hash: "SCRAM-SHA-256$4096:calculateme-see-postgres_roles.tf",
  pg_temporal_visibility_user_password_raw: "changeme",
}
```

<details>
<summary>Generate PG password hash</summary>

**PG Users**

The database is configured to use `scram-sha-256` for password auth.
To generate a hashed password in this form:

1. Start a local DB:
   `$ docker run --rm -it --name postgres-dummy -d -e POSTGRES_HOST_AUTH_METHOD=trust postgres:14-alpine`
2. Connect to instance
   `$ docker exec -it postgres-dummy psql -U postgres`
3. Reset password
   `postgres=# \password`
   (type in your password twice)
4. Extract password
   `select rolpassword from pg_authid where rolname = 'postgres';`
5. Copy the result, repeat from step 3 as needed
6. Quit with `\q` and stop the container
   `docker stop postgres-dummy`

</details>

Deployment can then be done by issuing the following command after initializing a terraform workspace with a functioning AWS connection from the [`./hash/`](./hash/) folder:

```console
$ terraform workspace show
prod
$ terraform apply
..
```

## 2. Migrate databases

Once the Terraform infrastructure is deployed, you should have an RDS Postgres database accessible from the bastion host with `graph` and `kratos` users/dbs. These need to be migrated locally in preparation for starting the services.

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

To migrate `hash-graph`, you must first build the docker container that contains the graph and run it with the graph credentials you should have in the Vault instance.

```console
$ docker run --rm \
  --network host \
  -e HASH_GRAPH_PG_USER=graph \
  -e HASH_GRAPH_PG_PASSWORD="changeme" \
  -e HASH_GRAPH_PG_HOST=localhost \
  -e HASH_GRAPH_PG_PORT=5554 \
  -e HASH_GRAPH_PG_DATABASE=graph \
  -e HASH_GRAPH_LOG_LEVEL=debug \
  000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-graphecr:latest \
  migrate
..
```

You can simultaneously run the migrations for Kratos:

```console
$ DOCKER_BUILDKIT=1 docker build ./apps/hash-external-services/kratos --build-arg ENV=prod -t kratos:latest
..
$ docker run --network host --rm -e "DSN=postgres://kratos:changeme@localhost:5554/kratos" kratos:latest migrate sql -e --yes
..
```

The Kratos migrations may take a couple of minutes, but while the migrations are running, you can build/push the service container images in the next step.

## 3. Build/push docker images

You must build images for `hash-graph`, `hash-api`, `kratos`, and `temporal` setup/migration/worker to push to ECR (`buildkit` env variable may be optional)
Depending on your AWS account ID (`$AWS_ID`), your selected terraform workspace (`$WORKSPACE`) and AWS region (`$REGION`) and region short name (`$REGION_SHORT`) your ECR URL will be different. The general structure is as follows:

```text
$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-hash-$WORKSPACE-$REGION_SHORT-graphecr:latest
$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-hash-$WORKSPACE-$REGION_SHORT-kratosecr:latest
$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-hash-$WORKSPACE-$REGION_SHORT-apiecr:latest

$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-temporal-$WORKSPACE-$REGION_SHORT-setup:$HASH_TEMPORAL_VERSION
$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-temporal-$WORKSPACE-$REGION_SHORT-migrate:$HASH_TEMPORAL_VERSION

$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-hash-$WORKSPACE-$REGION_SHORT-temporalworkeraipy:latest
$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-hash-$WORKSPACE-$REGION_SHORT-temporalworkeraits:latest
$AWS_ID.dkr.ecr.$REGION.amazonaws.com/h-hash-$WORKSPACE-$REGION_SHORT-temporalworkerintegration:latest
```

> If you receive a message about needing to log in, you can run the following AWS CLI command to authorize local push:
> `aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 000000000000.dkr.ecr.$REGION.amazonaws.com`

The build and push commands ran from the root of this ([`hashintel/hash`](../../)) repo:

**Building `hash-graph`**:

```console
$ DOCKER_BUILDKIT=1 docker build ./apps/hash-graph -f ./apps/hash-graph/docker/Dockerfile -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-graphecr:latest
..
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-graphecr:latest
..
```

**Building `hash-api`**:

```console
$ DOCKER_BUILDKIT=1 docker build . -f ./infra/docker/api/prod/Dockerfile -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-apiecr:latest
..
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-apiecr:latest
..
```

**Building `kratos`** (same as the migration container, with a secret passed in):

For Kratos, it's required to provide some build-time args to ensure a secure instance running in production mode (and configuring an API secret `$SECRET` which should match the `kratos_api_key` tfvar).

```console
$ DOCKER_BUILDKIT=1 docker build ./apps/hash-external-services/kratos --build-arg ENV=prod --build-arg API_SECRET=$SECRET -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-kratosecr:latest
..
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-kratosecr:latest
..
```

**Building temporal services**:

All Temporal services requires the `TEMPORAL_VERSION` build argument to be set to the version of Temporal to use. The current version can be found in [`.env`](../../.env) in the repository root and should be set to the same value as the `HASH_TEMPORAL_VERSION`. The image should be tagged with the same version as the `TEMPORAL_VERSION` build argument.

```console
$ DOCKER_BUILDKIT=1 docker build ./apps/hash-external-services/temporal/ -f ./apps/hash-external-services/temporal/migrate.Dockerfile --build-arg TEMPORAL_VERSION=$HASH_TEMPORAL_VERSION -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-temporal-prod-usea1-migrate:$HASH_TEMPORAL_VERSION
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-temporal-prod-usea1-migrate:$HASH_TEMPORAL_VERSION
..
$ DOCKER_BUILDKIT=1 docker build ./apps/hash-external-services/temporal/ -f ./apps/hash-external-services/temporal/setup.Dockerfile --build-arg TEMPORAL_VERSION=$HASH_TEMPORAL_VERSION -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-temporal-prod-usea1-setup:$HASH_TEMPORAL_VERSION
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-temporal-prod-usea1-migrate:$HASH_TEMPORAL_VERSION
..
```

To build and push the Temporal workers you may use these commands:

```console
$ # AI Typescript worker
$ DOCKER_BUILDKIT=1 docker build . -f ./apps/hash-ai-worker-ts/docker/Dockerfile -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-temporalworkeraits:latest
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-temporalworkeraits:latest
..
$ # Integration worker
$ DOCKER_BUILDKIT=1 docker build . -f ./apps/hash-integration-worker/docker/Dockerfile -t 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-temporalworkerintegration:latest
$ docker push 000000000000.dkr.ecr.us-east-1.amazonaws.com/h-hash-prod-usea1-temporalworkerintegration:latest
..
```

All of the above steps are also available in the [`HASH backend deployment` GitHub Action workflow](../../.github/workflows/hash-backend-cd.yml).

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

# Troubleshooting and guides

## What to do if the HASH DB needs **Disaster Recovery**

There's a [recovery playbook](./playbooks/db_recovery.md) on what we should do when the DB is on fire, please follow it to recover a snapshot.

## Help! I need access to the private subnet!

You can access the private subnet using the Bastion host. For more information, please see [the corresponding readme](./hash/bastion.md). You need an SSH privatekey to access the bastion, which you can find in `1password` if you have the appropriate access level.

## How do I get the Terraform state from S3?

Install the AWS CLI and follow instructions to add credentials. Credentials are generated in the IAM User security credentials page. `https://us-east-1.console.aws.amazon.com/iam/home#/users/NAME?section=security_credentials` for a user with the name `NAME`.

Once the CLI has been configured, you should have a `.aws` folder in your home directory. Terraform will automatically pick this up and connect to the S3 Terraform State backend.

## How do I log in to AWS ECR container registry?

If you wish to pull/push container images to ECR manually, you must:

1. Sign in to the registry
2. Build and tag the image
3. Push the image to ECR

Please see the [AWS docs](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html) for instructions on how to do so.

## How do I migrate the database after it has been deployed?

Using the Terraform scripts to deploy an instance of RDS will give you an empty DB (with appropriate DBs/users), which will need to be migrated. Note that we have a GitHub workflow to do this automatically at [`hash-backend-cd.yml`](/.github/workflows/hash-backend-cd.yml).

To migrate the database locally, you'll need to ensure you've built the dockerfile for `hash-graph` and prepare your environment with some of the values in the Vault key-value entries for the environment you're migrating, see [Deploy infrastructure with terraform](#deploy-infrastructure-with-terraform) for where to look in the Vault.

Build the dockerfile for `hash-graph`:

```console
$ turbo --filter @apps/hash-graph build:docker:prod
..
```

Make sure your Vault CLI is logged in correctly. You can export the following environment variables (adjust the vault path to match your environment):

```shell
export HASH_PG_HOST=$(terraform output -raw rds_hostname)
export HASH_PG_PORT=5554 # or the port you specify in your SSH tunnel
export HASH_GRAPH_PG_DATABASE=graph
export HASH_GRAPH_PG_USER=graph
export HASH_GRAPH_PG_PASSWORD=$(vault kv get -field=pg_graph_user_password_raw automation/pipelines/hash/prod)
export HASH_KRATOS_PG_DATABASE=kratos
export HASH_KRATOS_PG_USER=kratos
export HASH_KRATOS_PG_PASSWORD=$(vault kv get -field=pg_kratos_user_password_raw automation/pipelines/hash/prod)
export HASH_KRATOS_API_SECRET=$(vault kv get -field=kratos_api_key automation/pipelines/hash/prod)
```

The migration requires an SSH tunnel to the VPC, see [this README](./hash/bastion.md) for more information on initiate the tunnel.

Now you can run the `hash-graph` migration:

```console
$ docker run --rm \
  --network host \
  -e HASH_GRAPH_PG_USER \
  -e HASH_GRAPH_PG_PASSWORD \
  -e HASH_GRAPH_PG_HOST=$HASH_PG_HOST \
  -e HASH_GRAPH_PG_PORT=$HASH_PG_PORT \
  -e HASH_GRAPH_PG_DATABASE \
  -e HASH_GRAPH_LOG_LEVEL=info \
  hash-graph \
  migrate
..
```

And to migrate `kratos`:

```console
$ pwd
/../hash/ # at root of repo
$ docker build ./apps/hash-external-services/kratos --build-arg ENV=prod --build-arg API_SECRET=$HASH_KRATOS_API_SECRET -t kratos:latest
..
$ docker run --rm \
  --network host \
  -e LOG_LEVEL=info \
  -e "DSN=postgres://${HASH_KRATOS_PG_USER}:${HASH_KRATOS_PG_PASSWORD}@${HASH_PG_HOST}:${HASH_PG_PORT}/${HASH_KRATOS_PG_DATABASE}" \
  kratos:latest \
  migrate sql -e --yes
```

## How do I redeploy a running Fargate task?

The current Terraform modules define Fargate task definitions, which are parameterized over ECR container tags. This means that one can push a new Docker image with the same task, and trigger a new Fargate deployment to refresh the image of a service. Assuming an image has been pushed to ECR with the same tag defined in the task definition (e.g. `latest`), it is possible to trigger a redeploy with

```console
$ aws ecs update-service --cluster h-hash-prod-usea1-ecscluster --service h-hash-prod-usea1-apisvc --force-new-deployment
..
```

Where `prod` is the Terraform workspace name, `usea1` is the region, and `apisvc` is the name of the service and `ecscluster` is the name of the ECS cluster.

# Structure of the modules

Under the [`./modules/`](./modules/) folder we define the HASH application through an ECS Fargate service and various external services.

## Shared modules

- [`base_network`](./modules/base_network/) - contains global VPC (Virtual Private Cloud) definitions and networking setup defining private and public subnets.
- [`bastion`](./modules/bastion/) - a [Bastion host](https://en.wikipedia.org/wiki/Bastion_host) that resides in the public subnet with access to the private subnet. Accessible through SSH.
- [`container_cluster`](./modules/container_cluster/) - is a thin wrapper around the `aws_ecs_cluster` resource with container capacity providers.
- [`container_registry`](./modules/container_registry/) - is a thin wrapper around the `aws_ecr_repository` resource with container evicition policies.
- [`redis`](./modules/redis/) - [external service] a multi Availability Zone Redis cluster with encryption enabled.
- [`tunnel`](./modules/tunnel/) - a custom SSH tunnel using an external data source to allow terraform to connect to services on the private subnet of the VPC.
- [`variables`](./modules/variables/) - contains global variable validation/definitions generally useful for our Terraform infrastructure.
- [`vault_aws_auth`](./modules/vault_aws_auth/) - contains the configuration for authenticating the AWS provider through the Vault AWS authentication backend.

## HASH-specific modules

- [`networking`](./modules/hash/networking/) - contains PrivateLink definitions for the various required AWS resources.
- [`postgres`](./modules/postgres/) - [external service] a multi Availability Zone Postgres RDS cluster with encryption enabled.
- [`postgres_roles`](./modules/postgres_roles/) - SQL configurations for the HASH application defining grants, roles and databases (requires an SSH tunnel to connect to the RDS instance).
- [`hash_application`](./modules/hash_application/) - the ECS Fargate container definition using the previous ECR and ECS cluster definitions to start the Graph layer, the HASH API and Kratos.

**HASH infrastructure diagram**:

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

## Archived HASH modules

This list of modules are to be considered obsolete/out of date, and are kept here for reference in case of future re-use.

- [`citus`](./modules/citus/) - Module for deploying a Citus cluster on AWS using EC2. - Along with [playbooks/citus.md](./playbooks/citus.md) - Instructions for administering the Citus cluster.
