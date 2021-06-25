# HASH.dev backend

## To run in development mode

`yarn install && yarn dev`

Environment variables are required for connecting to the database. Create
the file `./.env.local` with the following:

```
HASH_PG_HOST="localhost"
HASH_PG_PORT="5432"
HASH_PG_USER="postgres"
HASH_PG_PASSWORD="postgres"
HASH_PG_DATABASE="postgres"
```