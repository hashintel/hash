<p align="center">
  <img src="https://cdn-us1.hash.ai/assets/hash-github-readme-header%402x.png">
</p>
<div align="center">
 <a href="https://github.com/hashintel/hash/blob/main/packages/hash/LICENSE.md"><img src="https://cdn-us1.hash.ai/assets/license-badge-agpl3.svg" alt="GNU Affero General Public License version 3" /></a>
 <a href="https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_hash"><img src="https://img.shields.io/discord/840573247803097118" alt="Join HASH on Discord" /></a>
</div>

# HASH

HASH is an open-source, data-centric, all-in-one workspace. HASH combines a rich frontend editor with a powerful entity graph that makes it easy to capture and work with structured data. HASH is built atop the open [Block Protocol](https://github.com/blockprotocol/blockprotocol) allowing users to easily add new block types and functionality to their workspaces.

**This app is not yet ready for production use.** For now it is intended to be used as a [test-harness for developers building Block Protocol-compliant blocks](#integration-with-the-block-protocol). It is currently not secure, not optimized, and missing key features.

We will be developing HASH into a production-grade application which can be self-hosted. The current design and architecture, while not fully realized, paves the way for further features, scale, and performance. You can read about the long-term vision for HASH [here](https://hash.ai/platform/hash).

## Getting started

To run HASH locally, please follow these steps:

1.  Make sure you have, [Git](https://git-scm.com), [Node LTS](https://nodejs.org), [Yarn Classic](https://classic.yarnpkg.com) and [Docker](https://docs.docker.com/get-docker/).
    Run each of these version commands and make sure the output is expected:

    ```sh
    git --version
    ## ≥ 2.17
    
    node --version
    ## ≥ 16.13
    
    yarn --version
    ## ≥ 1.16
    
    docker --version
    ## ≥ 20.10
    
    docker-compose --version
    ## ≥ 1.29
    ```

    If you have difficulties with `git --version` on macOS you may need to install Xcode Command Line Tools first: `xcode-select --install`.

    If you use Docker for macOS or Windows, go to _Preferences_ → _Resources_ and ensure that Docker can use at least 4GB of RAM (8GB is recommended).

1.  [Clone](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) this repository and navigate to the root of the repository folder in your terminal.

1.  Install dependencies:

    ```sh
    yarn install
    ```

1.  Create an empty file called `.env.local`:

    ```sh
    npx touch .env.local
    ```

    It will be used for storing locally defined environment variables (the ones we don’t want to store in git).

1.  Launch external services (Postgres, Redis and OpenSearch) as Docker containers:

    ```sh
    yarn external-services up --detach
    ```

    You can keep external services running between app restarts.

1.  **On first run**, or if you want to reset app data, run this command in a separate terminal:

    ```sh
    yarn seed-data
    ```

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

---

To stop Docker containers with external services, run:

```sh
yarn external-services down
```

Container data is persisted locally inside `var/external-services`.
You can delete this directory when containers are stopped for a ‘hard reset’.

## User authentication

Our login and signup flows rely on emails with links or authentication codes.
By default, the API server uses `DummyEmailTransporter` which simulates email sending for local development and testing.
You will find authentication codes in `var/api/dummy-email-transporter/email-dumps.yml` and in the terminal output.
If you chose to run the backend and frontend separately, it will be in the backend terminal.

After you have run `yarn seed-data`, you will be able to log in as either `alice@example.com` or `bob@example.com`.

To use `AwsSesEmailTransporter` instead, set `export HASH_EMAIL_TRANSPORTER=aws_ses` in your terminal before running the app.
Note that you will need valid AWS credentials for this email transporter to work.

## Integration with the Block Protocol

HASH is built around the open [Block Protocol](https://blockprotocol.org) ([@blockprotocol/blockprotocol](https://github.com/blockprotocol/blockprotocol) on GitHub).

You can test blocks in HASH by going to any page, clicking on the menu next to an empty block, and pasting in the URL to your block's distribution folder (i.e. the one containing `block-metadata.json`, `block-schema.json`, and the block's code). If you need a way of serving your folder, try [`serve`](https://github.com/vercel/serve).

To get started building a block, visit the [docs](https://blockprotocol.org/docs).

## HASH blocks

This repository contains a number of https://blockprotocol.org blocks.
If you want to develop, build or serve a single block, run:

```sh
yarn workspace @hashintel/block-name dev
## or
yarn workspace @hashintel/block-name build
## or
yarn workspace @hashintel/block-name serve
```

## Creating new blocks

See https://blockprotocol.org/docs/developing-blocks

## Testing

### Backend integration tests

Backend integration tests are located in [packages/hash/integration](./packages/hash/integration) folder.

If you run a local instance of the app, please stop it before running the tests to free network ports.

#### Terminal 1

```sh
yarn external-services up --detach
NODE_ENV=test HASH_PG_DATABASE=backend_integration_tests yarn dev:backend
```

#### Terminal 2

```sh
HASH_PG_DATABASE=backend_integration_tests yarn test:backend-integration
```

We plan to use Playwright [API testing](https://playwright.dev/docs/test-api-testing/) feature instead of Jest.
Thus, `yarn test:backend-integration` and `yarn test:playwright` will probably converge.

### Playwright tests

[Playwright](https://playwright.dev) tests are browser-based integration and end-to-end tests.
They apply to the monorepo as a whole, so are located in the top-level [tests](./tests) folder.
To run these tests locally, you will need to have both backend and frontend running.

To ensure that your local changes are unaffected by the tests, it is recommended to use another database instance (`HASH_PG_DATABASE=playwright`).
The database needs to be re-seeded before each test run.

If you run a local instance of the app, please stop it before running the tests to free network ports.

#### Terminal 1

```sh
yarn external-services up --detach
HASH_PG_DATABASE=playwright yarn dev:backend
```

#### Terminal 2

```sh
HASH_PG_DATABASE=playwright yarn seed-data

## option 1: frontend in dev mode
yarn dev:frontend

## option 2: frontend in prod mode
yarn workspace @hashintel/hash-frontend build
yarn workspace @hashintel/hash-frontend start
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

Going forward, consider using Playwright if you want to test the UI.
Your tests will be less wired to the implementation details and thus be closer to what real users see and do.

## Code quality

We perform automated linting and formatting checks on pull requests using GitHub Actions.

## Monorepo

In order to work w/ multiple packages in a single repository, they must adhere to some conventions.
The below `package.json` file outlines the minimum requirements a package has to fulfill:

```javascript
{
  "name": "@hashintel/hash-<name>",
  "version": "major.minor.patch",
  "description": "lorem ipsum",
  "author": "<package-author>",
  "license": "<package-licence>",
  "scripts": {
    // omit type-checking if not applicable
    "fix:eslint": "eslint --ext .ts,.tsx --fix ./src/",
    "lint:eslint": "eslint --ext .ts,.tsx ./src/",
    "lint:tsc": "tsc --noEmit",
    "build": "echo produce artifacts",
    "clean": "echo remove artifacts",
    // required only if this is a shared package
    "postinstall": "yarn build"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "5.17.0",
    "@typescript-eslint/parser": "5.17.0",
    "eslint": "^7.32.0",
    "eslint-config-airbnb": "^19.0.4",
    "eslint-config-prettier": "^8.3.0",
    "eslint-plugin-import": "^2.25.4",
    "eslint-plugin-jest": "^26.1.0",
    "eslint-plugin-jsx-a11y": "^6.5.1",
    "eslint-plugin-react": "^7.28.0",
    "eslint-plugin-react-hooks": "^4.3.0",
    "rimraf": "3.2.0",
    "typescript": "4.6.2"
  }
}
```

The above `devDependencies` are owed to our root eslint-config at `packages/hash/.eslintrc.json`.
That same config requires a `tsconfig.json` next to the `package.json` if `.ts(x)` files are to be
linted.

## Troubleshooting

### eslint `parserOptions.project`

There is a mismatch between VSCode's eslint plugin and the eslint cli tool. Specifically the option
`parserOptions.project` is not interpreted the same way as reported
[here](https://github.com/typescript-eslint/typescript-eslint/issues/251). If VSCode complains about
a file not being "on the project" underlining an import statement, try to add the following to the
plugin's settings:

```json
"eslint.workingDirectories": [
  { "directory": "packages/hash/api", "!cwd": true }
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

## Environment variables

Here's a list of possible environment variables. Everything that's necessary already has a default value.

You **do not** need to set any environment variables to run the application.

### General API server environment variables

- `NODE_ENV`: ("development" or "production") the runtime environment. Controls
  default logging levels and output formatting.
- `PORT`: the port number the API will listen on.
- `SESSION_SECRET` The secret used to sign login sessions (default: `secret`)
- `HTTPS_ENABLED`: (optional) Set to `"1"` if HTTPS is enabled on the frontend host.

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

NOTE: Opensearch is currently disabled by default due to issues.

- `HASH_OPENSEARCH_ENABLED`: whether OpenSearch is used or not. `true` or `false`. (default: `false`).
- `HASH_OPENSEARCH_HOST`: the hostname of the OpenSearch cluster to connect to. (default: `localhost`)
- `HASH_OPENSEARCH_PASSWORD`: the password to use when making the connection. (default: `admin`)
- `HASH_OPENSEARCH_PORT`: the port number that the cluster accepts (default: `9200`)
- `HASH_OPENSEARCH_USERNAME`: the username to connect to the cluster as. (default: `admin`)
- `HASH_OPENSEARCH_HTTPS_ENABLED`: (optional) set to "1" to connect to the cluster
  over an HTTPS connection.

### Postgres

- `HASH_PG_DATABASE` (default: `postgres`)
- `HASH_PG_HOST` (default: `localhost`)
- `HASH_PG_PASSWORD` (default: `postgres`)
- `HASH_PG_PORT` (default: `5432`)
- `HASH_PG_USER` (default: `postgres`)

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

- `FRONTEND_DOMAIN`: URL of the frontend website for links (default: `localhost:3000`)
- `HASH_COLLAB_QUEUE_NAME` The name of the Redis queue which updates to entities are published to (default: `collab`)
- `HASH_REALTIME_PORT`: Realtime service listening port. (default: `3333`)
- `HASH_SEARCH_LOADER_PORT`: (default: `3838`)
- `HASH_SEARCH_QUEUE_NAME`: The name of the queue to push changes for the search loader service (default: `search`)
- `NEXT_PUBLIC_API_ORIGIN`: The origin that the API service can be reached on (default: `http://localhost:5001`)
- `SESSION_SECRET`: The secret used to sign login sessions (default: `secret`)
- `LOG_LEVEL`: the level of runtime logs that should be omitted, either set to `debug`, `info`, `warn`, `error` (default: `info`)

## Contributors

HASH's development is being led by various employees of _[HASH](https://hash.dev/)_ (the company). The current core team includes:

- Ahmad Atta
- Alexander Kachkaev
- Alfie Mountfield
- Ben Werner
- Ciaran Morinan
- Maggie Appleton
- Nate Higgins
- Valentino Ugbala

As an open-source project, we gratefully accept external contributions and have published a [contributing guide](https://github.com/hashintel/hash/blob/main/CONTRIBUTING.md) that outlines the process. If you have questions, please reach out to us on our [Discord server](https://hash.ai/discord).
