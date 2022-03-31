# Datastore

This package stores the configuration for the HASH datastore. For now, it
only contains a config for a local development Postgres running on Docker.

## Postgres

### Migrations

We make use of the [node-pg-migrate](https://github.com/salsita/node-pg-migrate) NPM package to generate and run migrations on the postgres datastore.

The `node-pg-migrate` command line interface can be accessed using `yarn pg:migrate {commands...}`. Command commands:

- create a new migration file with the name you give it, where dashes will replace spaces and underscores, and a timestamp is prepended to your file name.

  ```sh
  yarn db:migrate create {migration name}
  ```

- run all migrations from the current state

  ```sh
  yarn db:migrate up
  ```

- run a single down migration from the current state

  ```sh
  yarn db:migrate down
  ```

- redo the last migration (runs a single down migration, then a single up migration)

  ```sh
  yarn db:migrate redo
  ```

More information on usage of the `node-pg-migrate` client can be found [here](https://salsita.github.io/node-pg-migrate/#/cli).

#### Creating a new migration

1.  Create a new migration file using `yarn db:migrate create {migration name}`. This will create a new file in the [`./postgres/migration/`](./postgres/migration/) directory with empty `up` and `down` migration functions.

1.  Define the "up" migration in the `up` function body, making use of the existing migration methods made available by the `node-pg-migrate` package (a full list can be found [in their documentation](https://salsita.github.io/node-pg-migrate/#/migrations?id=migration-methods)). If the existing migration methods are insufficient, [raw SQL can be run as well](https://salsita.github.io/node-pg-migrate/#/misc?id=pgmsql-sql-).

1.  If the migration is reversible, define the corresponding "down" migration in the `down` function making use of the avaible migration methods just as in the `up` migration. If the migration is irreversible, `down` can be set to `false` which will prevent the caller of `db:migrate` from reverting the migration. If a migration is deemed to be irreversible, please leave a comment with a justification for this decision.
    - **Note:** although [`node-pg-migrate` can automatically generate down migrations for some migration methods](https://salsita.github.io/node-pg-migrate/#/migrations?id=automatic-down-migrations), because this is not possible for all operations we should therefore be explicit and **always define the corresponding down migration ourselves, even when it can be auto-generated**.
