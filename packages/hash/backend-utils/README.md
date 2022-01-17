# HASH Backend Utils

Utility libraries for backend code:

- `redis`: contains an async wrapper around the Redis v3.x package.
- `queue`: defines generic interfaces for interacting with queues. Currently, it
  contains implementations for a Redis-backed queue.
- `logger`: creates a `Logger` instance with pre-defined fields and output formatting.
- `postgres`: contains a function for creating a connection pool to a Postgres database
  with logging configured.
