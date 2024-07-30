[github_star]: https://github.com/hashintel/hash#

<!-- markdownlint-disable link-fragments -->

[gh-about-directory]: #--about-the-hash-application
[gh-getting-started]: #--getting-started

<p align="center">
  <img src="https://cdn-us1.hash.ai/assets/hash-github-readme-header%402x.png">
</p>

[![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# HASH

HASH is an open-source, self-building database. You can [read more about it](https://hash.ai/blog/self-building-database) on our blog.

HASH provides a powerful graph datastore with its own GUI, for creating and using types and entities, and managing the database's growth. Intelligent, autonomous agents can be deployed to grow, check, and maintain the database, integrating and structuring information from the public internet as well as your own connected private sources.

In the future, we envisage HASH serving as an all-in-one workspace, or complete operating system.

**We currently recommend using the hosted version of HASH.** We haven't yet written up an official guide to self-hosting HASH, although you can find the code powering the application here in this (rather large) GitHub repository.

> **Warning:**
> The repository is currently in a state of flux while some large improvements are being implemented.
> As such, portions of this README may prove outdated in the interim, this could include guides on how to load blocks, references to various services, broken tests, features, etc.

## [![a](/.github/assets/gh_icon_what-is-hash_20px-base.svg)][gh-about-directory] &nbsp; About the HASH application

This folder contains only the _HASH_ project README. The application itself is split across several different services which can be found co-located alongside this directory.
See the [respective section in the parent README](../README.md#hash) for descriptions of the following services:

- [hash-api](../hash-api)
- [hash-external-services](../hash-external-services)
- [hash-frontend](../hash-frontend)
- [hash-graph](../hash-graph)
- [hash-realtime](../hash-realtime)
- [hash-search-loader](../hash-search-loader)

<!-- It would be nice to add a dependency graph here showing which services rely on one another -->

## [![a](/.github/assets/gh_icon_getting-started_20px-base.svg)][gh-getting-started] &nbsp; Getting started

<details>
  <summary>Running HASH locally</summary>

### Running HASH locally

To run HASH locally, please follow these steps:

1. Make sure you have, [Git](https://git-scm.com), [Node LTS](https://nodejs.org), [Yarn Classic](https://classic.yarnpkg.com), [Rust](https://www.rust-lang.org), [Docker](https://docs.docker.com/get-docker/), [Protobuf](https://github.com/protocolbuffers/protobuf), and [Java](https://www.java.com/download/ie_manual.jsp). Building the Docker containers requires [Docker Buildx](https://docs.docker.com/build/install-buildx/).
   Run each of these version commands and make sure the output is expected:

   ```sh
   git --version
   ## ≥ 2.17
   
   node --version
   ## ≥ 20.12
   
   yarn --version
   ## ≥ 1.16
   
   rustup --version
   ## ≥ 1.27.1 (Required to match the toolchain as specified in `rust-toolchain.toml`)
   
   docker --version
   ## ≥ 20.10
   
   docker compose version
   ## ≥ 2.17.2
   
   docker buildx version
   ## ≥ 0.10.4
   
   protoc --version
   ## ≥ 25
   
   java --version
   ## ≥ 8
   ```

   If you have difficulties with `git --version` on macOS you may need to install Xcode Command Line Tools first: `xcode-select --install`.

   If you use Docker for macOS or Windows, go to _Preferences_ → _Resources_ and ensure that Docker can use at least 4GB of RAM (8GB is recommended).

1. [Clone](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) this repository and **navigate to the root of the repository folder** in your terminal.

1. Install dependencies:

   ```sh
   yarn install
   ```

1. Ensure Docker is running.
   If you are on Windows or macOS, you should see app icon in the system tray or the menu bar.
   Alternatively, you can use this command to check Docker:

   ```sh
   docker run hello-world
   ```

1. If you need to test or develop AI-related features, you will need to create an `.env.local` file in the repository root with the following values:

   ```sh
   OPENAI_API_KEY=your-open-ai-api-key                                      # required for most AI features
   ANTHROPIC_API_KEY=your-anthropic-api-key                                 # required for most AI features
   HASH_TEMPORAL_WORKER_AI_AWS_ACCESS_KEY_ID=your-aws-access-key-id         # required for most AI features
   HASH_TEMPORAL_WORKER_AI_AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key # required for most AI features
   E2B_API_KEY=your-e2b-api-key                                             # only required for the question-answering flow action
   ```

   **Note on environment files:** `.env.local` is not committed to the repo – **put any secrets that should remain secret here.** The default environment variables are taken from `.env`, extended by `.env.development`, and finally by `.env.local`. If you want to overwrite values specified in `.env` or `.env.development`, you can add them to `.env.local`. Do **not** change any other `.env` files unless you intend to change the defaults for development or testing.

1. Launch external services (Postgres, the graph query layer, Kratos, Redis, and OpenSearch) as Docker containers:

   ```sh
   yarn external-services up --wait
   ```

   1. You can optionally force a rebuild of the Docker containers by adding the `--build` argument(**this is necessary if changes have been made to the graph query layer). It's recommended to do this whenever updating your branch from upstream**.

   1. You can keep external services running between app restarts by adding the `--detach` argument to run the containers in the background. It is possible to tear down the external services with `yarn external-services down`.

   1. When using `yarn external-services:offline up`, the Graph services does not try to connect to `https://blockprotocol.org` to fetch required schemas. This is useful for development when the internet connection is slow or unreliable.

   1. You can also run the Graph API and AI Temporal worker outside of Docker – this is useful if they are changing frequently and you want to avoid rebuilding the Docker containers. To do so, _stop them_ in Docker and then run `yarn dev:graph` and `yarn workspace @apps/hash-ai-worker-ts dev` respectively in separate terminals.

1. Launch app services:

   ```sh
   yarn start
   ```

   This will start backend and frontend in a single terminal. Once you see http://localhost:3000, the frontend end is ready to visit there.
   The API is online once you see `localhost:5001` in the terminal. Both must be online for the frontend to function.

   You can also launch parts of the app in separate terminals, e.g.:

   ```sh
   yarn start:graph
   yarn start:backend
   yarn start:frontend
   ```

   See `package.json` → `scripts` for details and more options.

1. Log in

   There are three users seeded automatically for development. Their passwords are all `password`.

   - `alice@example.com`, `bob@example.com` – regular users
   - `admin@example.com` – an admin

If you need to run the browser plugin locally, see the `README.md` in the `apps/plugin-browser` directory.

#### Resetting the local database

If you need to reset the local database, to clear out test data or because it has become corrupted during development, you have two options:

1. The slow option – rebuild in Docker

   1. In the Docker UI (or via CLI at your preference), stop and delete the `hash-external-services` container
   1. In 'Volumes', search 'hash-external-services' and delete the volumes shown
   1. Run `yarn external-services up --wait` to rebuild the services

1. The fast option – reset the database via the Graph API

   1. Run the Graph API in test mode by running `yarn dev:graph:test-server`
   1. Run `yarn graph:reset-database` to reset the database
   1. **If you need to use the frontend**, you will also need to delete the rows in the `identities` table in the `dev_kratos` database, or signin will not work. You can do so via any Postgres UI or CLI. The db connection and user details are in `.env`

#### External services test mode

The external services of the system can be started in 'test mode' to prevent polluting the development database.
This is useful for situations where the database is used for tests that modify the database without cleaning up afterwards.

To make use of this test mode, the external services can be started as follows:

```sh
yarn external-services:test up
```

</details>

<details>
  <summary>Deploying HASH to the cloud</summary>

### Deploying HASH to the cloud

To deploy HASH in the cloud, follow the instructions contained in the root [`/infra` directory](https://github.com/hashintel/hash/tree/main/infra).

</details>

## User authentication

Development users are seeded when the HASH API is started, these users are `alice@example.com` and `bob@example.com`.
You'll be able to sign in to these users with the password `password`.

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

## Integration with the Block Protocol

HASH is built around the open [Block Protocol](https://blockprotocol.org) ([@blockprotocol/blockprotocol](https://github.com/blockprotocol/blockprotocol) on GitHub).

### Using blocks

Blocks published to the [Þ Hub](https://blockprotocol.org/hub) can be run within HASH via the 'insert block' (aka. 'slash') menu.

While running the app in development mode, you can also test local blocks out in HASH by going to any page, clicking on the menu next to an empty block, and pasting in the URL to your block's distribution folder (i.e. the one containing `block-metadata.json`, `block-schema.json`, and the block's code). If you need a way of serving your folder, try [`serve`](https://github.com/vercel/serve).

### HASH blocks

The code pertaining to HASH-developed blocks can be found in the [`/blocks` directory](https://github.com/hashintel/hash/tree/main/blocks) in the root of this monorepo.

### Creating new blocks

See the [Developing Blocks](https://blockprotocol.org/docs/developing-blocks) page in the [Þ Docs](https://blockprotocol.org/docs) for instructions on developing and publishing your own blocks.

## Development

[//]: # "TODO: Pointers to where to update/modify code"

### The Graph Query Layer

HASH's primary datastore is an entity graph. The service that provides this is located within the `/apps/hash-graph` folder. The README contains more information for development. You do not need to visit that README or folder unless you want to amend the graph service.

## Testing

### Debug mode

Some parts of the UI designed to help with development/debugging are hidden. You can display these elements by running the following in your browser console.

```js
localStorage["hash.internal.debugging"] = "true";
```

### Backend integration tests

Backend integration tests are located in the [`/tests/hash-backend-integration`](/tests/hash-backend-integration) folder.

_The tests require a running instance of `hash-external-services`. see [here](#external-services-test-mode) for information on doing this without polluting the development database._

```sh
yarn test:backend-integration
```

We originally planned to use Playwright [API testing](https://playwright.dev/docs/test-api-testing/) feature instead of Jest (subsequently replaced by Vitest), which would have led to the convergence of `yarn test:backend-integration` and `yarn test:playwright` -- this may still happen.

### Playwright tests

[Playwright](https://playwright.dev) tests are browser-based integration and end-to-end tests.
The playwright tests are located within the [`/tests/hash-playwright/tests`](/tests/hash-playwright/tests) folder.
To run these tests locally, you will need to have both backend and frontend running.

- _The tests require a running instance of `external-services`. see [here](#external-services-test-mode) for information on doing this without polluting the development database._

#### Terminal 1

```sh
yarn dev:backend
```

#### Terminal 2

```sh
yarn seed-data

## option 1: frontend in dev mode
yarn dev:frontend

## option 2: frontend in prod mode
yarn workspace @apps/hash-frontend build
yarn workspace @apps/hash-frontend start
```

#### Terminal 3

```sh
yarn test:playwright
```

You can add extra arguments to configure how Playwright runs, e.g.:

```sh
yarn test:playwright --headed
```

See `yarn test:playwright --help` for more info.

### Unit tests

Unit tests are executed by [Vitest](https://vitest.dev/), which we use in place of Jest, due to its improved TS/ESM compatibility.

Unit tests can be launched at any time with this command:

```sh
yarn test:unit
```

> _Note: some of the unit tests may output console.error messages. Please disregard these and focus on the pass/fail indicators._

Going forward, consider using Playwright if you want to test the UI.
Your tests will be less wired to the implementation details and thus be closer to what real users see and do.

## Code quality

We perform automated linting and formatting checks on pull requests using GitHub Actions.
When a pull request is created or updated, GitHub Action will run those checks. This includes ESLint, TSC, Prettier, Markdownlint, rustfmt, and a few other tools. Some checks may be skipped depending on the files that have been changed in the pull request.

First-time contributors need to wait for a maintainer to manually launch the checks.

## Monorepo

We use [Yarn Workspaces](https://classic.yarnpkg.com/en/docs/workspaces) to work with multiple packages in a single repository.
[Turborepo](https://turborepo.com) is used to cache script results and thus speed up their execution.

### New packages

New local packages should follow these rules:

1. Anything which is imported or consumed by something else belongs in `libs/` and have a `package.json` `"name"`:
   - beginning with `@local/` for non-published JavaScript dependencies
   - identical to their `npm` name for published JavaScript dependencies
   - begin with `@rust/` for Rust dependencies
1. Things which are executed belong in `apps/`, and are named `@apps/app-name
1. Packages which aren't published to `npm` should have `"private": true` in their `package.json`
1. All TypeScript packages should be `"type": "module"`
1. ESLint and TypeScript configuration should all extend the base configs (see existing examples in other packages). Don't modify or override anything unless necessary.

Read the next section to understand how to configure compilation for packages.

### TypeScript package resolution / compilation

The package resolution setup is designed to meet two goals:

1. Enable the local dependency graph for any application to be executed directly as TypeScript code during development, whilst
1. Enabling it to be run as transpiled JavaScript in production.

This is achieved by maintaining two parallel exports definitions for each package:

1. The `exports` field in `package.json` should point to the transpiled JavaScript (and `typesVersions` to the type definition files)
1. The `paths` map in the base TSConfig should map the same import paths to their TypeScript source

During development (e.g. running `yarn dev` for an application), the `paths` override will be in effect, meaning that the source TypeScript
is being run directly, and modifying any dependent file in the repo will trigger a reload of the application (assuming `tsx watch` or equivalent is used).

For production builds, where they are created, a `tsconfig.build.json` in the package is used which overwrites the `paths` field in the root config,
meaning that the imports will resolve to the transpiled JavaScript (usually in a git-ignored `dist/` folder).

Creating a production build should be done by running `turbo run build`, so that `turbo` takes care of building its dependencies first.
Running `yarn build` may not work as expected, as the built JavaScript for its dependencies may be (a) missing or (b) out of date.

If a bundler is used rather than `tsc`, the `paths` override needs to be translated into the appropriate configuration for the bundler.
For `webpack`, this is automated by adding the `TsconfigPathsPlugin` to the configuration's `resolve` field (search existing examples in repo).

New packages which are to be built as JavaScript, whether as an app or dependency, must follow these rules:

1. They must have a `tsconfig.json` which extends the base config and sets `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`
1. Imports within a package must use relative imports and not the package's name (they will not be resolved when built otherwise)
1. Relative imports within a package must have a `.js` file extension (`tsc` will enforce this)
1. They must have a `tsconfig.build.json` which overrides the `paths` field (`"paths": {}`)
1. They must have a `build` command which uses this file (typically `rimraf ./dist/ && tsc -p tsconfig.build.json`)
1. They must specify the paths exposed to consumers in `exports` and `typesVersions` in `package.json`, and `paths` in the base TSConfig
1. They must have a `turbo.json` which extends the root and specifies the `outputs` for caching (see existing examples)

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
