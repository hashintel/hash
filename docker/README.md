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