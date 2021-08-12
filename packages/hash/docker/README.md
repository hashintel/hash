# Docker configuration

This directory contains the Docker configuration files for the various services
underlying HASH.dev.

Note: all Dockerfiles must assume the build context is at the root of the
repository. This means the source paths provided to the `COPY` and `ADD`
commands must pass the full directory path starting at the root of the
repository.

Services:

  1. [`api`](./api): the GraphQL API.
  2. [`postgres`](./postgres): the PostgreSQL server that the API connects to.
  3. [`statsd`](./statsd): a StatsD server intended for development purposes
     which outputs metrics to the console.

## Developing with Docker Compose

We use Docker to package the Postgres database and the API. The
`docker-compose.yml` may be used to run these together. The config requires a
volume named `hash-dev-pg` to be present to persist the database state. Create
this by running:
```
docker volume create hash-dev-pg
```

We have a yarn alias for running the API and database. From the root of the
repo, run:
```
yarn serve:hash-backend
```

This command makes API is avaible at `localhost:5001` and Postgres database
available at port `5432` on localhost also.

If you add a dependency to the API, you need to rebuild the container with
```
yarn rebuild:backend
```

To seed the database with mock data, and to recreate the database schema, run:
```
yarn seed-db
```

You may connect to the database using any Postgres-compatible database client.
For example, here's how to connect using `psql`:
```
psql -h localhost -p 5432 -U postgres -d postgres
```
The password is "postgres".

The API may report metrics in the StatsD format (see [backend/README](../packages/hash/backend/README.md) for details).
To enable a development StatsD server, instead of `yarn serve:hash-backend`,
run:
```
yarn serve:hash-backend-statsd
```