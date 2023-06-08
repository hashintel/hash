# HASH Search Loader

The `search-loader` service is responsible for reading the database change-stream
published to a queue by the `realtime` service and loading it into a search index powered
by [OpenSearch](https://opensearch.org).

## HTTP Server

The service listens for HTTP requests for administration purposes with endpoints:

- `GET /healthcheck`: responds with the health of the server. The response is of the
  form:

  ```json
  {
    "msg": "// a human-readable context specific message",
    "instanceId": "// a unique idenfier for the instance",
    "queueAcquired": "// a boolean indicating if the instance has ownership of the search ingestion queue."
  }
  ```

- `POST /shutdown`: gracefully shutdown the instance.

## Configuration

The following environment variables are used to configure the service:

- `NODE_ENV`: the runtime environment for the service. Controls logging levels and
  formatting. Options are "development" or "production". The log level for development
  defaults to "debug", and "info" for production, but may be overwritten by setting the
  `LOG_LEVEL` variable.
- `LOG_LEVEL`: (optional: debug, info, warn or error) the logging level.
- `PORT`: the port number the service will listen on for healthchecks etc.
- Redis:
  - `HASH_REDIS_HOST`: the hostname of the redis instance.
  - `HASH_REDIS_PORT`: (default: 6379) the port the Redis instance accepts connections on.
- Postgres:
  - `HASH_PG_HOST`: the hostname of the Postgres instance.
  - `HASH_PG_PORT`: the port number the Postgres instance is listening on.
  - `HASH_PG_USER`: the Postgres user to connect as.
  - `HASH_PG_PASSWORD`: the password for the Postgres user.
  - `HASH_PG_DATABASE`: the name of the database to connect to on the instance.
- `HASH_SEARCH_QUEUE_NAME`: the name of the search queue that the `realtime` service
  writes the database change-stream to.
- OpenSearch:
  - `HASH_OPENSEARCH_HOST`: the hostname of the OpenSearch cluster to connect to.
  - `HASH_OPENSEARCH_PORT`: (default: 9200) the port number that the cluster accepts
    connections on.
  - `HASH_OPENSEARCH_USERNAME`: the username to connect to cluster as.
  - `HASH_OPENSEARCH_PASSWORD`: the password to use when making the connection.
  - `HASH_OPENSEARCH_HTTPS_ENABLED`: (optional) set to "1" to connect to the cluster
    over an HTTPS connection.
- `STATSD_ENABLED`: (optional) set to "1" if the service should report metrics to a
  StatsD server. If enabled, the following variables must be set:
  - `STATSD_HOST`: the hostname of the StatsD server.
  - `STATSD_PORT`: (default: 8125) the port number the StatsD server is listening on.

## Search index

The service sends all entities it reads from the `realtime` queue to the OpenSearch
search index. It indexes the following entity fields in a search index named
`"entities"`:

- `accountId`
- `entityId`
- `entityVersionId`
- `entityTypeId`
- `entityTypeVersionId`
- `entityTypeName`
- `createdAt`
- `updatedAt`
- `createdBy`

Each entity is indexed by its `entityId` such that only the latest version of each entity
is indexed.

An additional field named `fullTextSearch` is indexed for entities of system type `Text`
and `Page`. For `Text` entities, this contains a sanitized form of the entities
properties which strips all formatting identifiers and concatenates all items in the
`text` array into a single string separated by a space. For `Page` entities,
`fullTextSearch` is simply the page title. For all other entities, this field is currently
empty.

`Text` entities will also contain a `belongsToPage` field which will be an entity
reference to the `Text` entity's `Page` grandparent - if the grandparent exists.
`belongsToPage?`:

- `accountId`
- `entityId`
- `entityVersionId`

## Metrics

If StatsD is enabled (`STATSD_ENABLED=1`), the service will report the following metrics,
with the tag `search-loader`, to the specified server:

- `messages_processed`: the rate at which the service is reading messages from the queue
  and loading them into the search index.
- `queue_size`: the number of unprocessed messages in the queue.
