[gh-about-directory]: #--about-the-hash-application
[gh-getting-started]: #--getting-started

## Sending emails

Email-sending in HASH is handled by either Kratos (in the case of authentication-related emails) or through the HASH API Email Transport (for everything else).

Transactional emails templates are located in the following locations:

- Kratos emails in [`./../../apps/hash-external-services/kratos/templates/`](./../../apps/hash-external-services/kratos/templates/). This directory contains the following templates:
  - [`recovery_code`](./../../apps/hash-external-services/kratos/templates/recovery_code) - Email templates for the account recovery flow using a code for the UI.
    - When an email belongs to a registered HASH user, it will use the `valid` template, otherwise the `invalid` template is used.
  - [`verification_code`](./../../apps/hash-external-services/kratos/templates/verification_code) - Email verification templates for the account registration flow using a code for the UI.
    - When an email belongs to a registered HASH user, it will use the `valid` template, otherwise the `invalid` template is used.
- HASH emails in [`../hash-api/src/email/index.ts`](../hash-api/src/email/index.ts)

To use `AwsSesEmailTransporter` instead, set `export HASH_EMAIL_TRANSPORTER=aws_ses` in your terminal before running the app.
Note that you will need valid AWS credentials for this email transporter to work.


## Troubleshooting

### eslint `parserOptions.project`

There is a mismatch between VSCode's eslint plugin and the eslint cli tool. Specifically the option
`parserOptions.project` is not interpreted the same way as reported
[here](https://github.com/typescript-eslint/typescript-eslint/issues/251). If VSCode complains about
a file not being "on the project" underlining an import statement, try to add the following to the
plugin's settings:

```json
"eslint.workingDirectories": [
  { "directory": "apps/hash-api", "!cwd": true }
]
```

### Services are not launched because ports are reported as busy

Make sure that ports 3000, 3333, 3838, 5001, 5432, 6379 and 9200 are not used by any other processes.
You can test this by running:

```sh
lsof -n -i:PORT_NUMBER
```

> **TODO:** replace `lsof` with `npx ??? A,B,...N` for a better DX.
> Suggestions welcome!

### User Registration failing (WSL users)

If you're running the application on Windows through Windows Subsystem for Linux (WSL) you might need to
change the registration url in `apps/hash-external-services/docker-compose.yml` from
`http://host.docker.internal:5001/kratos-after-registration` to `http://{WSL_IP}:5001/kratos-after-registration`,
where `WSL_IP` is the IP address you get by running:

```sh
wsl hostname -I
```

The `kratos` and `kratos-migrate` services will need to be restarted/rebuilt for the change to take effect.

## Environment variables

Here's a list of possible environment variables. Everything that's necessary already has a default value.

You **do not** need to set any environment variables to run the application.

### General API server environment variables

- `NODE_ENV`: ("development" or "production") the runtime environment. Controls
  default logging levels and output formatting.
- `PORT`: the port number the API will listen on.

### AWS configuration

If you want to use AWS for file uploads or emails, you will need to have it configured:

- `AWS_REGION`: The region, eg. `us-east-1`
- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
- `AWS_S3_UPLOADS_BUCKET`: The name of the bucket to use for file uploads (if you want to use S3 for file uploads), eg: `my_uploads_bucket`
- `AWS_S3_UPLOADS_ACCESS_KEY_ID`: (optional) the AWS access key ID to use for file uploads. Must be provided along with the secret access key if the API is not otherwise authorized to access the bucket (e.g. via an IAM role).
- `AWS_S3_UPLOADS_SECRET_ACCESS_KEY`: (optional) the AWS secret access key to use for file uploads.
- `AWS_S3_UPLOADS_ENDPOINT`: (optional) the endpoint to use for S3 operations. If not, the AWS S3 default for the given region is used. Useful if you are using a different S3-compatible storage provider.
- `AWS_S3_UPLOADS_FORCE_PATH_STYLE`: (optional) set `true` if your S3 setup requires path-style rather than virtual hosted-style S3 requests.

For some in-browser functionality (e.g. document previewing), you must configure a Access-Control-Allow-Origin header on your bucket to be something other than '\*'.

### File uploads

By default, files are uploaded locally, which is **not** recommended for production use. It is also possible to upload files on AWS S3.

- `FILE_UPLOAD_PROVIDER`: Which type of provider is used for file uploads. Possible values `LOCAL_FILE_SYSTEM`, or `AWS_S3`. If choosing S3, then you need to configure the `AWS_S3_UPLOADS_` variables above.
- `LOCAL_FILE_UPLOAD_PATH`: Relative path to store uploaded files if using the local file system storage provider. Default is `var/uploads` (the `var` folder is the folder normally used for application data)

### Email

During development, the dummy email transporter writes emails to a local folder.

- `HASH_EMAIL_TRANSPORTER`: `dummy` or `aws`. If set to dummy, the local dummy email transporter will be used during development instead of aws (default: `dummy`)
- `DUMMY_EMAIL_TRANSPORTER_FILE_PATH`: Default is `var/api/dummy-email-transporter/email-dumps.yml`
- `DUMMY_EMAIL_TRANSPORTER_USE_CLIPBOARD`: `true` or `false` (default: `true`)

### OpenSearch

**NOTE: Opensearch is currently disabled by default due to issues.**

- `HASH_OPENSEARCH_ENABLED`: whether OpenSearch is used or not. `true` or `false`. (default: `false`).
- `HASH_OPENSEARCH_HOST`: the hostname of the OpenSearch cluster to connect to. (default: `localhost`)
- `HASH_OPENSEARCH_PASSWORD`: the password to use when making the connection. (default: `admin`)
- `HASH_OPENSEARCH_PORT`: the port number that the cluster accepts (default: `9200`)
- `HASH_OPENSEARCH_USERNAME`: the username to connect to the cluster as. (default: `admin`)
- `HASH_OPENSEARCH_HTTPS_ENABLED`: (optional) set to "1" to connect to the cluster
  over an HTTPS connection.

### Postgres

- `POSTGRES_PORT` (default: `5432`)

Various services also have their own configuration.

The Postgres superuser is configured through:

- `POSTGRES_USER` (default: `postgres`)
- `POSTGRES_PASSWORD` (default: `postgres`)

The Postgres information for Kratos is configured through:

- `HASH_KRATOS_PG_USER` (default: `kratos`)
- `HASH_KRATOS_PG_PASSWORD` (default: `kratos`)
- `HASH_KRATOS_PG_DATABASE` (default: `kratos`)

The Postgres information for Temporal is configured through:

- `HASH_TEMPORAL_PG_USER` (default: `temporal`)
- `HASH_TEMPORAL_PG_PASSWORD` (default: `temporal`)
- `HASH_TEMPORAL_PG_DATABASE` (default: `temporal`)
- `HASH_TEMPORAL_VISIBILITY_PG_DATABASE` (default: `temporal_visibility`)

The Postgres information for the graph query layer is configured through:

- `HASH_GRAPH_PG_USER` (default: `graph`)
- `HASH_GRAPH_PG_PASSWORD` (default: `graph`)
- `HASH_GRAPH_PG_DATABASE` (default: `graph`)

### Redis

- `HASH_REDIS_HOST` (default: `localhost`)
- `HASH_REDIS_PORT` (default: `6379`)

### Statsd

If the service should report metrics to a StatsD server, the following variables must be set.

- `STATSD_ENABLED`: Set to "1" if the service should report metrics to a StatsD server.
- `STATSD_HOST`: the hostname of the StatsD server.
- `STATSD_PORT`: (default: 8125) the port number the StatsD server is listening on.

### Snowplow telemetry

- `HASH_TELEMETRY_ENABLED`: whether Snowplow is used or not. `true` or `false`. (default: `false`)
- `HASH_TELEMETRY_HTTPS`: set to "1" to connect to the Snowplow over an HTTPS connection. `true` or `false`. (default: `false`)
- `HASH_TELEMETRY_DESTINATION`: the hostname of the Snowplow tracker endpoint to connect to. (required)
- `HASH_TELEMETRY_APP_ID`: ID used to differentiate application by. Can be any string. (default: `hash-workspace-app`)

### Others

- `FRONTEND_URL`: URL of the frontend website for links (default: `http://localhost:3000`)
- `NOTIFICATION_POLL_INTERVAL`: the interval in milliseconds at which the frontend will poll for new notifications, or 0 for no polling. (default: `10_000`)
- `HASH_INTEGRATION_QUEUE_NAME` The name of the Redis queue which updates to entities are published to
- `HASH_REALTIME_PORT`: Realtime service listening port. (default: `3333`)
- `HASH_SEARCH_LOADER_PORT`: (default: `3838`)
- `HASH_SEARCH_QUEUE_NAME`: The name of the queue to push changes for the search loader service (default: `search`)
- `API_ORIGIN`: The origin that the API service can be reached on (default: `http://localhost:5001`)
- `SESSION_SECRET`: The secret used to sign sessions (default: `secret`)
- `LOG_LEVEL`: the level of runtime logs that should be omitted, either set to `debug`, `info`, `warn`, `error` (default: `info`)
- `BLOCK_PROTOCOL_API_KEY`: the api key for fetching blocks from the [Þ Hub](https://blockprotocol.org/hub). Generate a key at https://blockprotocol.org/settings/api-keys.

## Contributors

The HASH application's development is overseen by _[HASH](https://hash.ai/about)_ (the company).

As an open-source project, we gratefully accept external contributions and have published a [contributing guide](https://github.com/hashintel/hash/blob/main/.github/CONTRIBUTING.md) that outlines the process. If you have questions, please open a [discussion](https://github.com/orgs/hashintel/discussions).
