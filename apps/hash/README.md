[discord]: https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_root
[github_star]: https://github.com/hashintel/hash#

<!-- markdownlint-disable link-fragments -->

[gh-about-directory]: #--about-the-hash-application
[gh-getting-started]: #--getting-started

<p align="center">
  <img src="https://cdn-us1.hash.ai/assets/hash-github-readme-header%402x.png">
</p>

[![discord](https://img.shields.io/discord/840573247803097118)][discord] [![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# HASH

HASH is an open-source, data-centric, all-in-one workspace. HASH combines a rich frontend editor with a powerful entity graph that makes it easy to capture and work with structured data. HASH is built atop the open [Block Protocol](https://github.com/blockprotocol/blockprotocol) allowing users to easily add new block types and functionality to their workspaces.

**This app is not yet ready for production use.** For now it is intended to be used as a [test-harness for developers building Block Protocol-compliant blocks](#integration-with-the-block-protocol). It is currently not secure, not optimized, and missing key features.

We will be developing HASH into a production-grade application which can be self-hosted. The current design and architecture, while not fully realized, paves the way for further features, scale, and performance. You can read about the long-term vision for HASH [here](https://hash.ai/platform/hash).

> **Warning:**
> The repository is currently in a state of flux while some large improvements are being implemented.
> As such, portions of this README may prove outdated in the interim, this could include guides on how to load blocks, references to various services, broken tests, features, etc.

## [![a](/.github/assets/gh_icon_what-is-hash_20px-base.svg)][gh-about-directory] &nbsp; About the HASH application

This folder contains only the _HASH_ project README. The application is split across several different modules which can be found colocated alongside this directory:

- [hash-api](../hash-api): API for accessing HASH
- [hash-external-services](../hash-external-services): houses various self-contained external services _(pending refactoring)_
- [hash-frontend](../hash-frontend): GUI for accessing HASH
- [hash-graph](../hash-graph): application graph query layer
- [hash-realtime](../hash-realtime): provides realtime updates on entities to a collection of subscribers
- [hash-search-loader](../hash-search-loader): loads the change-stream published by the realtime service into a search index
- [hash-task-executor](../hash-task-executor): supports the triggered execution of scripts _(temporary solution)_

<!-- It would be nice to add a dependency graph here showing which services rely on one another -->

## [![a](/.github/assets/gh_icon_getting-started_20px-base.svg)][gh-getting-started] &nbsp; Getting started

<details>
  <summary>Running HASH locally</summary>
  
### Running HASH locally

To run HASH locally, please follow these steps:

1.  Make sure you have, [Git](https://git-scm.com), [Node LTS](https://nodejs.org), [Yarn Classic](https://classic.yarnpkg.com) and [Docker](https://docs.docker.com/get-docker/).
    Run each of these version commands and make sure the output is expected:

    ```sh
    git --version
    ## ≥ 2.17
    
    node --version
    ## ≥ 16.15
    
    yarn --version
    ## ≥ 1.16
    
    docker --version
    ## ≥ 20.10
    ```

    If you have difficulties with `git --version` on macOS you may need to install Xcode Command Line Tools first: `xcode-select --install`.

    If you use Docker for macOS or Windows, go to _Preferences_ → _Resources_ and ensure that Docker can use at least 4GB of RAM (8GB is recommended).

1.  [Clone](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) this repository and **navigate to the root of the repository folder** in your terminal.

1.  Install dependencies:

    ```sh
    yarn install
    ```

1.  Ensure Docker is running.
    If you are on Windows or macOS, you should see app icon in the system tray or the menu bar.
    Alternatively, you can use this command to check Docker:

    ```sh
    docker run hello-world
    ```

1.  Launch external services (Postgres, the graph query layer, Kratos, Redis, and OpenSearch) as Docker containers:

    ```sh
    yarn external-services up
    ```

    1.  You can optionally force a rebuild of the docker containers by adding the `--build` argument(**this is necessary if changes have been made to the graph query layer). It's recommended to do this whenever updating your branch from upstream**.

    1.  You can keep external services running between app restarts by adding the `--detach` argument to run the containers in the background. It is possible to tear down the external services with `yarn external-services down`.

    1.  When using `yarn external-services-offline up`, the Graph services does not try to connect to `https://blockprotocol.org` to fetch required schemas. This is useful for development when the internet connection is slow or unreliable.

1.  Launch app services:

    ```sh
    yarn dev
    ```

    This will start backend and frontend in a single terminal.

    You can also launch parts of the app in separate terminals, e.g.:

    ```sh
    yarn dev:backend
    yarn dev:frontend
    ```

    See `package.json` → `scripts` for details and more options.

#### External services test mode

The external services of the system can be started in 'test mode' to prevent polluting the development database.
This is useful for situations where the database is used for tests that modify the database without cleaning up afterwards.

To make use of this test mode, the external services can be started as follows:

```sh
yarn external-services-test up
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

- Kratos emails in [`./../../apps/hash-external-services/kratos/templates/`](./../../apps/hash-external-services/kratos/templates/)
- HASH emails in [`./api/src/email/index.ts`](./api/src/email/index.ts)

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

We plan to use Playwright [API testing](https://playwright.dev/docs/test-api-testing/) feature instead of Jest.
Thus, `yarn test:backend-integration` and `yarn test:playwright` will probably converge.

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

Unit tests are executed by [Jest](https://jestjs.io) and use [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) to cover the UI.
They can be launched at any time with this command:

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
change the registration url in `external-services/kratos/kratos.dev.yml` from
`http://host.docker.internal:5001/kratos-after-registration` to `http://{WSL_IP}:5001/kratos-after-registration`,
where `WSL_IP` is the IP address you get by running:

```sh
wsl hostname -I
```

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
- `AWS_ACCESS_KEY_ID`: Your aws access key
- `AWS_SECRET_ACCESS_KEY`: Your aws secret key
- `AWS_S3_UPLOADS_BUCKET`: The name of the bucket to use for file uploads (if you want to use S3 for file uploads), eg: `my_uploads_bucket`

### File uploads

By default, files are uploaded locally. It is also possible to upload files on AWS S3.

- `FILE_UPLOAD_PROVIDER`: Which type of provider is used for file uploads. Possible values `LOCAL_FILE_SYSTEM`, or `AWS_S3`. If choosing S3, then you need to configure the aws variables above.
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
- `HASH_KRATOS_PG_DEV_DATABASE` (default: `dev_kratos`)
- `HASH_KRATOS_PG_TEST_DATABASE` (default: `test_kratos`)

The Postgres information for the graph query layer is configured through:

- `HASH_GRAPH_PG_USER` (default: `graph`)
- `HASH_GRAPH_PG_PASSWORD` (default: `graph`)
- `HASH_GRAPH_PG_DEV_DATABASE` (default: `dev_graph`)
- `HASH_GRAPH_PG_TEST_DATABASE` (default: `test_graph`)

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
- `HASH_COLLAB_QUEUE_NAME` The name of the Redis queue which updates to entities are published to (default: `collab`)
- `HASH_REALTIME_PORT`: Realtime service listening port. (default: `3333`)
- `HASH_SEARCH_LOADER_PORT`: (default: `3838`)
- `HASH_SEARCH_QUEUE_NAME`: The name of the queue to push changes for the search loader service (default: `search`)
- `API_ORIGIN`: The origin that the API service can be reached on (default: `http://localhost:5001`)
- `SESSION_SECRET`: The secret used to sign login sessions (default: `secret`)
- `LOG_LEVEL`: the level of runtime logs that should be omitted, either set to `debug`, `info`, `warn`, `error` (default: `info`)
- `BLOCK_PROTOCOL_API_KEY`: the api key for fetching blocks from the [Þ Hub](https://blockprotocol.org/hub). Generate a key at https://blockprotocol.org/settings/api-keys.

## Contributors

HASH's development is being led by various employees of _[HASH](https://hash.dev/)_ (the company). The current core team includes:

- Ahmad Sattar
- Alexander Kachkaev
- Alfie Mountfield
- Ben Werner
- Ciaran Morinan
- Luís Bettencourt
- Nate Higgins
- Tim Diekmann
- Yusuf Kınataş

As an open-source project, we gratefully accept external contributions and have published a [contributing guide](https://github.com/hashintel/hash/blob/main/.github/CONTRIBUTING.md) that outlines the process. If you have questions, please reach out to us on our [Discord server](https://hash.ai/discord).
