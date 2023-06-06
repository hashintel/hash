# HASH External Services

## Overview

This directory contains a number of external services used throughout HASH (Ory Kratos, OpenSearch, Postgres, and Temporal).

### LLM prototyping

This also contains an experimental Docker compose file for prototyping LLM-based services using relevant external services such as a vector database.
You'll be able to execute the following command from the repository root directory to start the prototyping external services:

```sh
yarn external-services:prototype up
```

As with other external services, the arguments passed after the script name are arguments for `docker compose`.

## Future plans

These will be migrated into semantic folders in the future. For example, within the `apps` folder:

1.  `hash-external-services/kratos` → `hash-authentication`
1.  `hash-external-services/opensearch` → `hash-search`
1.  `hash-external-services/postgres` → `hash-database`
1.  `hash-external-services/temporal` → `hash-executor`

## Database Backups

It is possible to set up automated PostgreSQL backups using an additional service. You can add this service directly to the desired `docker-compose` or add another `docker-compose` as a layered config.

You can add the following service:

```yaml
postgres-backup:
  image: kartoza/pg-backup:15-3.3
  depends_on:
    postgres:
      condition: service_healthy
  environment:
    POSTGRES_USER: "${POSTGRES_USER}"
    POSTGRES_PASS: "${POSTGRES_PASSWORD}"
    POSTGRES_HOST: postgres
    POSTGRES_PORT: 5432
    # Change the name of the dumps here
    ARCHIVE_FILENAME: "$$(date +'%Y-%m-%dT%H-%M-%S').gz"
    # These are the args passed to the `pg_dump` command
    # read more at https://www.postgresql.org/docs/current/app-pgdump.html#PG-DUMP-OPTIONS
    DUMP_ARGS: -Fp -Z9
    # Change the cron here for the desired backup schedule
    # This is set to 00:00 UTC every day
    CRON_SCHEDULE: "0 0 * * *"
    REMOVE_BEFORE: 14
  volumes:
    # Change here for the desired backup location
    - /tmp/backups:/backups
```

This will add backups to the `/tmp/backups` location at the desired schedule (change as needed.)
