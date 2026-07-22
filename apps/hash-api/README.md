# HASH Backend

## Configuration

The HASH Backend API service is configured using the following environment variables:

- `NODE_ENV`: ("development" or "production") the runtime environment. Controls
  default logging levels and output formatting.
- `PORT`: the port number the API will listen on.
- `SELF_HOSTED_HASH`: if `"true"` forces self-hosted behavior, which e.g. loads system types as external types.
- `NODE_API_SENTRY_DSN`: the Sentry DSN to use for error reporting and tracing
- `AWS_REGION`: the AWS region to use (for the Simple Email Service (SES) provider, and as a fallback for other AWS services)
- `FILE_UPLOAD_PROVIDER`: where to store user file uploads. Currently supported values are:
  - `LOCAL_FILE_SYSTEM`: (default) use the local filesystem for file uploads – **not recommended for production use**
  - `AWS_S3`: use an AWS S3-compatible service for file uploads – ensure that the environment variables below are set
- S3 file uploads (ensure that `FILE_UPLOAD_PROVIDER=AWS_S3` is also set):
  - `AWS_S3_REGION`: (optional) the AWS region where the file uploads bucket is located. If not
    provided, `AWS_REGION` is assumed.
  - `AWS_S3_UPLOADS_BUCKET`: the name of the S3 bucket for file uploads. For some in-browser functionality (e.g. document previewing), you must configure a Access-Control-Allow-Origin header on your bucket to be something other than '\*'.
  - `AWS_S3_UPLOADS_ACCESS_KEY_ID`: (optional) the AWS access key ID to use for file uploads. Must be provided along with the secret access key if the API is not otherwise authorized to access the bucket (e.g. via an IAM role).
  - `AWS_S3_UPLOADS_SECRET_ACCESS_KEY`: (optional) the AWS secret access key to use for file uploads.
  - `AWS_S3_UPLOADS_ENDPOINT`: (optional) the endpoint to use for S3 operations. If not, the AWS S3 default for the given region is used. Useful if you are using a different S3-compatible storage provider.
  - `AWS_S3_UPLOADS_FORCE_PATH_STYLE`: (optional) set `true` if your S3 setup requires path-style rather than virtual hosted-style S3 requests.
- Postgres
  - `HASH_PG_HOST`: Postgres hostname.
  - `HASH_PG_PORT`: Postgres connection port.
  - `HASH_PG_DATABASE`: Postgres database name.
  - `HASH_PG_PASSWORD`: Postgres user password.
  - `HASH_PG_USER`: Postgres username.
- Redis
  - `HASH_REDIS_HOST`: the hostname for the Redis server.
  - `HASH_REDIS_PORT`: the port number of the Redis server.
- Petrinaut optimizer
  - `HASH_PETRINAUT_OPT_HOST`: the hostname of the Petrinaut optimizer service.
  - `HASH_PETRINAUT_OPT_PORT`: the port of the Petrinaut optimizer service.
  - Both variables are optional for local NodeAPI development, but must be set
    together to enable Petrinaut optimization. The authenticated capabilities
    endpoint reports this configuration independently of service health, so a
    temporary optimizer outage does not make the feature disappear from HASH.
- `FRONTEND_URL`: The URL the frontend is hosted on.
- Vault
  - `HASH_VAULT_HOST`: The host address (including protocol) that the Vault server is running on, e.g. `http://127.0.0.1`
  - `HASH_VAULT_PORT`: The port that the Vault server is running on, e.g. `8200`
  - `HASH_VAULT_ROOT_TOKEN`: The token to authenticate with the Vault server. If not present, login via AWS IAM is attempted instead.
  - `HASH_VAULT_MOUNT_PATH`: The mount path for the KV secrets engine, e.g. `secret`.
- Google integration
  - `GOOGLE_OAUTH_CLIENT_ID`: the client ID for the Google OAuth application.
  - `GOOGLE_OAUTH_CLIENT_SECRET`: the client secret for the Google OAuth application.
- `INTERNAL_API_KEY`: The API key used to authenticate with HASH (the company)'s internal API, required for some functionality specific to hosted HASH (the app)
- `INTERNAL_API_HOST`: The host for the internal API, required if the internal API is not running locally
- `OPENAI_API_KEY`: The API key used to authenticate with OpenAI's API, used for some non-essential generation functionality (e.g. suggesting the pluralized form of type names)
- `STATSD_ENABLED`: (optional) set to "1" if the service should report metrics to a
  StatsD server. If enabled, the following variables must be set:
  - `STATSD_HOST`: the hostname of the StatsD server.
  - `STATSD_PORT`: (default: 8125) the port number the StatsD server is listening on.
- `HASH_INTEGRATION_QUEUE_NAME` The name of the Redis queue which updates to entities are published to used to decide what changes should be written to connected applications (for two-way sync between them and HASH)
- `HASH_API_RUDDERSTACK_KEY`: (optional) Rudderstack write key for product analytics. Leave blank to disable telemetry. The environment label sent with events is derived from `ENVIRONMENT`.

## Metrics

The API may output StatsD metrics to a location set by the `STATSD_HOST` and
`STATSD_PORT` environment variables. Metrics are not reported to the console
and require an external service to which they may be sent to. For development
purposes, our [Docker config](../../infra/docker/README.md) includes a bare-bones StatsD server which just outputs metrics to the console. To run the API with
this enabled, from the root of the repo, execute:

```sh
yarn serve:hash-backend-statsd
```

## Telemetry

The API sends product-analytics events to [Rudderstack](https://www.rudderstack.com/).
Telemetry is enabled only when `HASH_API_RUDDERSTACK_KEY` is set.

The `environment` property attached to every event is derived from `ENVIRONMENT` (`production` / `staging`,
otherwise `development`).
