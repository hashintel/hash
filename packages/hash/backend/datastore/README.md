# Datastore

This package stores the configuration for the HASH.dev datastore. For now, it
only contains a config for a local development Postgres running on Docker.


## Local development

Create an empty directory `./postgres/pgdata` which will be mounted as a Docker
volume. The database state will be persisted between Docker runs here. To get
a fresh database, just delete this directory.
```
mkdir ./postgres/pgdata
```

Run the datastore:
```
docker-compose up
```

The default user, password and database are all set to "postgres". You can 
connect to the database using, for example, `psql`:
```
psql -h localhost -p 5432 -U postgres -d postgres
```

