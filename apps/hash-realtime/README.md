# HASH Realtime

The `realtime` package connects to a Postgres instance and reads its
change-stream by connecting to a [logical replication slot](https://www.postgresql.org/docs/10/logical-replication.html)
created using the [`wal2json`](https://github.com/eulerto/wal2json) extension. Its purpose
is to provide realtime updates on entities to a collection of subscribers, by pushing
change messages onto pre-specified queues.

## Configuration

The `realtime` service uses the following environment variables:

- `NODE_ENV`: controls the logging level & formatting. Must be either "development"
  or "production".
- `HASH_REDIS_HOST`: Redis connection hostname.
- `HASH_REDIS_PORT`: Redis connection port.
- `HASH_REALTIME_PG_HOST`: Postgres hostname.
- `HASH_REALTIME_PG_PORT`: Postgres connection port.
- `HASH_REALTIME_PG_DATABASE`: Postgres database name.
- `HASH_REALTIME_PG_USER`: Postgres username.
- `HASH_REALTIME_PG_PASSWORD`: Postgres user password.
- `HASH_REALTIME_SLOT_NAME`: The name of the logical replication slot to use/create.
- `HASH_REALTIME_PORT`: (default: 3333) Service listening port.
- `HASH_REALTIME_ENTITY_STREAM_NAME`: The name of the main entity stream.
- `HASH_REALTIME_TYPE_STREAM_NAME`: The name of the main type stream.

Configuration for the tables to monitor and the queues to push messages to is defined
in [`src/config.ts`](./src/config.ts). The service will push all insert/update/delete
changes from the tables specified in the `MONITOR_TABLES` array, to all queues specified
in the `QUEUES` array.

## Getting started

In dev mode, the service will automatically restart:

```sh
yarn dev
```

Production mode:

```sh
yarn start
```

For health checks, the service listens on port `3333` by default at the path
`/health`. The port number may be overridden by setting
`HASH_REALTIME_PORT`.

## High Availability

To maintain message ordering, a single `realtime` instance retains exclusive
read access to the logical replication slot. The service may operate in
high-availibility mode where one or more instances wait in standby mode in
while a single instance reads from the slot. In the event the owning instance
crashes, a standby instance will automatically acquire ownership of the slot
and begin reading.
