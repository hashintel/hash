# Citus

This is a playbook for interacting with a self-hosted, single-node Citus cluster on EC2. We're not currently running such a cluster, but if we were to, these are the steps we would have to take.

> **Warning**
> This playbook is out of date, and assumes that you have the scripts for managing Terraform which are obsolete. It is not recommended to use this playbook until it is updated.

## Open an SSH session

1. Get the SSH private key for the instance on 1Password.
2. Save the key to `~/.ssh/hadmin-citus-ec2`
3. Open an SSH session:

```console
$ ssh -i ~/.ssh/hadmin-citus-ec2 hadmin@$(h-tfinfo --deployment citus --output instance_ip)
..
```

## Pull the Citus Docker image

1. List the images stored in the deployment's ECR repository:

```console
$ h-list-images --service citus
..
```

1. [Open an SSH session to the EC2 instance](#open-an-ssh-session).
2. Set the image tag you wish to deploy from step 1:

```console
$ image_tag=$IMAGE_TAG
..
```

1. Log-in to Docker:

```console
$ aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY_URL
..
```

1. Pull an image with the tag `$IMAGE_TAG`:

```console
$ docker pull $ECR_REPO_URL:$IMAGE_TAG
..
```

## Start a new database

1. Get the Citus 'superuser' password from 1Password.
2. [Open an SSH session to the EC2 instance](#open-an-ssh-session).
3. [Pull the Citus Docker image](#pull-the-citus-docker-image)
4. Get the Citus 'superuser' password from 1Password and set it as a
   variable:

```console
$ superuser_password=$PASSWORD
..
```

1. If the database container is already running, stop it (`docker ps`, `docker stop`).
2. Run a Docker container:

```console
$ docker run --rm \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=$superuser_password \
  -e POSTGRES_USER=superuser \
  -e POSTGRES_DB=postgres \
  -e PGDATA=/var/lib/postgresql/data/pgdata \
  -e POSTGRES_INITDB_ARGS="--auth-host=scram-sha-256" \
  -v /data:/var/lib/postgresql/data/pgdata \
  $ECR_REPO_URL:$image_tag \
  -c "config_file=/etc/postgresql/postgresql.conf" \
  -c "hba_file=/etc/postgresql/pg_hba.conf"
..
```

## Connect to the database using psql

1. Get the password for the desired user from 1Password.
2. Connect with user `$USER`:

```console
$ psql -h $(h-tfinfo --deployment citus --output instance_ip) -U 5432 -d postgres $USER -p
..
```

## Running the schema migration script

See [root README](../README.md#how-do-i-migrate-the-database-after-it-has-been-deployed) for a detailed description.
