# The HASH Graph API

## Running the database

1.  In order to setup the database, first the database has to be started:

```shell
touch .env.local
docker-compose -f deployment/stack.yml up
```

1.  (Optional) If starting the database for the first time, the tables have to be generated. From the `migration` directory, run the following command:

```shell
yarn graph:recreate-db
```

1.  Then, apply the migration from the `migration` directory:

```shell
yarn graph:migrate up
```
