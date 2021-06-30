# Datastore

This package stores the configuration for the HASH.dev datastore. For now, it
only contains a config for a local development Postgres running on Docker.

## Postgres Schema

The Postgres schema definitions are stored in [`./postgres/schema`](./postgres/schema).
We will have automated migration scripts, but for now, you can execute
the single schema file manually using `psql`, for example:
```
\i datastore/postgres/schema/0000_base.sql
```