# HASH backend

## Configuration

The backend API service is configured using the following environment variables:

- `NODE_ENV`: ("development" or "production") the runtime environment. Controls
  default logging levels and output formatting.
- `PORT`: the port number the API will listen on.
- `SESSION_SECRET`: a secret used to sign login sessions.
- `AWS_REGION`: the AWS region to use for the Simple Email Service (SES) provider.
- S3 file uploads:
  - `AWS_S3_REGION`: (optional) the AWS region where the file uploads bucket is located. If not
    provided, `AWS_REGION` is assumed.
  - `AWS_S3_UPLOADS_BUCKET`: the name of the S3 bucket for file uploads.
- Postgres
  - `HASH_PG_HOST`: Postgres hostname.
  - `HASH_PG_PORT`: Postgres connection port.
  - `HASH_PG_DATABASE`: Postgres database name.
  - `HASH_PG_PASSWORD`: Postgres user password.
  - `HASH_PG_USER`: Postgres username.
- Redis
  - `HASH_REDIS_HOST`: the hostname for the Redis server.
  - `HASH_REDIS_PORT`: the port number of the Redis server.
- `FRONTEND_DOMAIN`: The domain the frontend is hosted on.
- `HTTPS_ENABLED`: (optional) Set to `"1"` if HTTPS is enabled on the frontend host.
- OpenSearch:
  - `HASH_OPENSEARCH_HOST`: the hostname of the OpenSearch cluster to connect to.
  - `HASH_OPENSEARCH_PORT`: (default: 9200) the port number that the cluster accepts
    connections on.
  - `HASH_OPENSEARCH_USERNAME`: the username to connect to the cluster as.
  - `HASH_OPENSEARCH_PASSWORD`: the password to use when making the connection.
  - `HASH_OPENSEARCH_HTTPS_ENABLED`: (optional) set to "1" to connect to the cluster
    over an HTTPS connection.
- `STATSD_ENABLED`: (optional) set to "1" if the service should report metrics to a
  StatsD server. If enabled, the following variables must be set:
  - `STATSD_HOST`: the hostname of the StatsD server.
  - `STATSD_PORT`: (default: 8125) the port number the StatsD server is listening on.
- `HASH_COLLAB_QUEUE_NAME` The name of the Redis queue which updates to entities are published to, which collab can then respond to

## Metrics

The API may output StatsD metrics to a location set by the `STATSD_HOST` and
`STATSD_PORT` environment variables. Metrics are not reported to the console
and require an external service to which they may be sent to. For development
purposes, our [Docker config](../../../docker/README.md) includes a bare-bones StatsD server which just outputs metrics to the console. To run the API with
this enabled, from the root of the repo, execute:

```sh
yarn serve:hash-backend-statsd
```
