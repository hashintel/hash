# HASH Realtime

The `realtime` package connects to a Postgres instance and reads its
change-stream by connecting to a [logical replication slot](https://www.postgresql.org/docs/10/logical-replication.html)
created using the [`wal2json`](https://github.com/eulerto/wal2json)
extension. Its purpose is to provide realtime updates on entities to
a collection of subscribers, but currently, the service just logs
the change-stream to the console.

## Environment variables

  - `HASH_PG_DATABASE`: Postgres database name ("postgres"),
  - `HASH_PG_PASSWORD`: Postgres user password ("postgres"),
  - `HASH_PG_USER`:  Postgres username ("postgres"),
  - `HASH_PG_HOST`: Postgres hostname ("localhost")
  - `HASH_PG_PORT`: Postgres connection port (5432)
  - `HASH_REALTIME_PORT`: Service listening port (3333)

## Getting started

In dev mode, the service will automatically restart:
```
yarn dev
```

Production mode:
```
yarn build && yarn start
```

For health checks, the service listens on port `3333` by default at the path
`/health-check`. The port number may be overridden by setting
`HASH_REALTIME_PORT`.

## High Availability

To maintain message ordering, a single `realtime` instance retains exclusive
read access to the logical replication slot. The service may operate in
high-availibility mode where one or more instances wait in standby mode in
while a single instance reads from the slot. In the event the owning instance
crashes, a standby instance will automatically acquire ownership of the slot
and begin reading.
