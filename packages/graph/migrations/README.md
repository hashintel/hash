# Datastore

This package contains migrations for the HASH graph. For now, it

## Postgres

### Getting started

To create the database and appropriately apply all migrations, you can run the following scripts

```sh
yarn graph:recreate-db
yarn graph:migrate up
```

The `graph:recreate-db` command will make sure to create the DB in Postgres if it doesn't exist already.

### Migrations

We make use of the [node-pg-migrate](https://github.com/salsita/node-pg-migrate) npm package to generate and run migrations on the postgres datastore.

The `node-pg-migrate` command line interface can be accessed using `yarn graph:migrate {commands...}`. Command commands:

- create a new migration file with the name you give it, where dashes will replace spaces and underscores, and a timestamp is prepended to your file name.

  ```sh
  yarn graph:migrate create {migration name}
  ```

- run all migrations from the current state

  ```sh
  yarn graph:migrate up
  ```

- run a single down migration from the current state

  ```sh
  yarn graph:migrate down
  ```

- redo the last migration (runs a single down migration, then a single up migration)

  ```sh
  yarn graph:migrate redo
  ```

More information on usage of the `node-pg-migrate` client can be found [here](https://salsita.github.io/node-pg-migrate/#/cli).

#### Creating a new migration

1.  Create a new migration file using `yarn graph:migrate create {migration name}`. This will create a new file in the [`./postgres/migration/`](./postgres/migration/) directory with empty `up` and `down` migration functions.

1.  Define the "up" migration in the `up` function body, making use of the existing migration methods made available by the `node-pg-migrate` package (a full list can be found [in their documentation](https://salsita.github.io/node-pg-migrate/#/migrations?id=migration-methods)). If the existing migration methods are insufficient, [raw SQL can be run as well](https://salsita.github.io/node-pg-migrate/#/misc?id=pgmsql-sql-).

1.  If the migration is reversible, define the corresponding "down" migration in the `down` function making use of the avaible migration methods just as in the `up` migration. If the migration is irreversible, `down` can be set to `false` which will prevent the caller of `graph:migrate` from reverting the migration. If a migration is deemed to be irreversible, please leave a comment with a justification for this decision.
    - **Note:** although [`node-pg-migrate` can automatically generate down migrations for some migration methods](https://salsita.github.io/node-pg-migrate/#/migrations?id=automatic-down-migrations), because this is not possible for all operations we should therefore be explicit and **always define the corresponding down migration ourselves, even when it can be auto-generated**.
