# Datastore

This package stores the configuration for the HASH datastore. For now, it
only contains a config for a local development Postgres running on Docker.

## Postgres Schema

The Postgres schema definitions are stored in [`./postgres/schema`](./postgres/schema).

To create the database schema, run:

```sh
yarn migration
```

To completely refresh the database (including removing all data), run:

```sh
yarn refresh
```

This command is valid only when the database is running on localhost.
