# HASH.dev backend

## Developing with Docker Compose

We use Docker to package the Postgres database and the API, and the
 `docker-compose.yml` may be used to run these together. The config
requires a volume named `hash-dev-pg` to be present to persist the database
state. Create this by running:
```
docker volume create hash-dev-pg
```

Start the database and API:
```
yarn start:docker
```

The API is avaible at `localhost:5001`. 

If you add a dependency to the API, you may need to rebuild the container with
```
yarn rebuild:backend
```

The API can be seeded with mock data by running `yarn mock-data` in `../integration`

You may also connect to the database
from localhost using any Postgres-compatible database client. For example,
here's how to connect using `psql`:
```
psql -h localhost -p 5432 -U postgres -d postgres
```
The password is "postgres".

If you want to start the database afresh, just delete and recreate the volume:
```
yarn clear-pg
```
