[app.hash.ai]: https://app.hash.ai?utm_medium=organic&utm_source=github_readme_hash-repo_root
[create an account]: https://app.hash.ai/signup?utm_medium=organic&utm_source=github_readme_hash-repo_root
[development roadmap]: https://hash.dev/roadmap?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hiring]: https://hash.ai/careers?utm_medium=organic&utm_source=github_readme_hash-repo_root
[running your own instance]: https://hash.dev/docs/get-started/setup#local-hash?utm_medium=organic&utm_source=github_readme_hash-repo_root
[sign in]: https://app.hash.ai/signin?utm_medium=organic&utm_source=github_readme_hash-repo_root
[use cases]: https://hash.ai/cases?utm_medium=organic&utm_source=github_readme_hash-repo_root

<!-- markdownlint-disable link-fragments -->

[awesome hash]: https://github.com/hashintel/awesome-hash
[github_banner]: #hash
[github_star]: https://github.com/hashintel/hash#
[gh-what-is-hash]: #--what-is-hash
[gh-getting-started]: #--getting-started
[gh-examples]: #--examples
[gh-roadmap]: #--roadmap
[gh-repo-structure]: #--about-this-repository
[gh-contributing]: #--contributing
[gh-license]: #--license
[gh-security]: #--security
[gh-contact]: #--contact

[![github_banner](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/ec83e48d-5a46-4c3f-a603-5d9fc43ff400/github)][github_banner]

[![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# HASH

This is HASH's _public monorepo_ which contains our public code, docs, and other key resources.

## [![a](/.github/assets/gh_icon_what-is-hash_20px-base.svg)][gh-what-is-hash] &nbsp; What is HASH?

**HASH is a self-building, open-source database which grows, structures and checks itself.** HASH integrates data in (near-)realtime, and provides a powerful set of interfaces so that information can be understood and used in any context. Intelligent, autonomous agents can be deployed to grow, check, and maintain the database, integrating and structuring information from the public internet as well as your own connected private sources. And users, including those who are non-technical, are able to visually browse and manage both entities (data) and types (schemas). HASH acts as a source of truth for critical data, no matter its source, and provides a platform for high-trust, safety-assured decision-making. [Read our blog post →](https://hash.ai/blog/self-building-database)

**In the future...** we plan on growing HASH into an all-in-one workspace, or complete operating system, with AI-generated interfaces known as "blocks" created at the point of need, on top of your strongly-typed data (addressing the data quality and integrity challenges inherent in today's current generation of generative AI interfaces).

## [![a](/.github/assets/gh_icon_getting-started_20px-base.svg)][gh-getting-started] &nbsp; Getting started

<details>
  <summary> &nbsp; <strong>Option 1.</strong> Use <a href="https://app.hash.ai/">hash.ai</a> — <em>recommended (quick-start: <5 mins)</em> 🚀</summary>

### Create an account

[Create an account] to get started.

### Sign in

[Sign in] to access your account.

### Skip the queue

When you first create an account you may be placed on a waitlist. To jump the queue, once signed in, follow the instructions shown in your HASH dashboard. All submissions are reviewed by a member of the team.

</details>

<details>
  <summary> &nbsp; <strong>Option 2.</strong> Run HASH locally</summary>

### Running HASH locally

**Running HASH locally is not yet officially supported.** In the meantime, use [hash.ai](https://app.hash.ai/) or try the experimental instructions below. These instructions will be replaced with a comprehensive guide to setting up and [running your own instance] in due course.

#### Experimental instructions

##### Running the app

1. Make sure you have, [Git](https://git-scm.com), [Rust](https://www.rust-lang.org), [Docker](https://docs.docker.com/get-docker/), and [Protobuf](https://github.com/protocolbuffers/protobuf). Building the Docker containers requires [Docker Buildx](https://docs.docker.com/build/install-buildx/).
   Run each of these version commands and make sure the output is expected:

   ```sh
   git --version
   ## ≥ 2.17

   rustup --version
   ## ≥ 1.27.1 (Required to match the toolchain as specified in `rust-toolchain.toml`, lower versions most likely will work as well)

   rustc --version
   ## Should match the toolchain specified in `rust-toolchain.toml`. If this is not the case, you can update the toolchain with
   rustup toolchain install
   ## If this still is not the correct toolchain, you may have set `RUSTUP_TOOLCHAIN` somewhere (e.g. in a global `mise` config file)

   docker --version
   ## ≥ 20.10

   docker compose version
   ## ≥ 2.17.2

   docker buildx version
   ## ≥ 0.10.4
   ```

   If you have difficulties with `git --version` on macOS you may need to install Xcode Command Line Tools first: `xcode-select --install`.

   If you use Docker for macOS or Windows, go to _Preferences_ → _Resources_ and ensure that Docker can use at least 4GB of RAM (8GB is recommended).

2. [Clone](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) this repository and **navigate to the root of the repository folder** in your terminal.

3. We use [mise-en-place](https://mise.jdx.dev/) to manage tool versions consistently across our codebase. We recommend using `mise` to automatically install and manage the required development tools:

   ```sh
   mise install
   ```

   It's also possible to install them manually, use the correct versions for these tools as specified in `.config/mise`.

   After [installing mise](https://mise.jdx.dev/getting-started.html#installing-mise-cli) you will also need to set it to [automatically activate](https://mise.jdx.dev/getting-started.html#activate-mise) in your shell.

4. Install dependencies:

   ```sh
   yarn install
   ```

5. Ensure Docker is running.
   If you are on Windows or macOS, you should see app icon in the system tray or the menu bar.
   Alternatively, you can use this command to check Docker:

   ```sh
   docker run hello-world
   ```

6. If you need to test or develop AI-related features, you will need to create an `.env.local` file in the repository root with the following values:

   ```sh
   OPENAI_API_KEY=your-open-ai-api-key                                      # required for most AI features
   ANTHROPIC_API_KEY=your-anthropic-api-key                                 # required for most AI features
   HASH_TEMPORAL_WORKER_AI_AWS_ACCESS_KEY_ID=your-aws-access-key-id         # required for most AI features
   HASH_TEMPORAL_WORKER_AI_AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key # required for most AI features
   E2B_API_KEY=your-e2b-api-key                                             # only required for the question-answering flow action
   ```

   **Note on environment files:** `.env.local` is not committed to the repo – **put any secrets that should remain secret here.** The default environment variables are taken from `.env`, extended by `.env.development`, and finally by `.env.local`. If you want to overwrite values specified in `.env` or `.env.development`, you can add them to `.env.local`. Do **not** change any other `.env` files unless you intend to change the defaults for development or testing.

7. Launch external services (Postgres, the graph query layer, Kratos, and Redis) as Docker containers:

   ```sh
   yarn external-services up -d
   ```

   1. You can optionally force a rebuild of the Docker containers by adding the `--build` argument(**this is necessary if changes have been made to the graph query layer). It's recommended to do this whenever updating your branch from upstream**.

   2. You can keep external services running between app restarts by adding the `--detach` argument to run the containers in the background. It is possible to tear down the external services with `yarn external-services down`.

   3. When using `yarn external-services:offline up`, the Graph services does not try to connect to `https://blockprotocol.org` to fetch required schemas. This is useful for development when the internet connection is slow or unreliable.

   4. You can also run the Graph API and AI Temporal worker outside of Docker – this is useful if they are changing frequently and you want to avoid rebuilding the Docker containers. To do so, _stop them_ in Docker and then run `yarn dev:graph` and `yarn workspace @apps/hash-ai-worker-ts dev` respectively in separate terminals.

8. Launch app services:

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

9. Log in

   When the HASH API is started, three users are automatically seeded for development purposes. Their passwords are all `password`.

   - `alice@example.com`, `bob@example.com` – regular users
   - `admin@example.com` – an admin

##### Running the browser plugin

If you need to run the browser plugin locally, see [the `README.md`](https://github.com/hashintel/hash/tree/main/apps/plugin-browser#readme) in the `apps/plugin-browser` directory.

##### Resetting the local database

If you need to reset the local database, to clear out test data or because it has become corrupted during development:

1. Run `yarn external-services down -v` (this will take the Docker services down and drop the volumes)
2. Run `yarn external-services up --wait` to start everything again

##### External services test mode

The external services of the system can be started in 'test mode' to prevent polluting the development database.
This is useful for situations where the database is used for tests that modify the database without cleaning up afterwards.

To make use of this test mode, the external services can be started as follows:

```sh
yarn external-services:test up
```

##### Sending emails

Email-sending in HASH is handled by either Kratos (in the case of authentication-related emails) or through the HASH API Email Transport (for everything else).

To use `AwsSesEmailTransporter`, set `export HASH_EMAIL_TRANSPORTER=aws` in your terminal before running the app, along with `SYSTEM_EMAIL_ADDRESS` and `SYSTEM_EMAIL_SENDER_NAME` (which control what address and name the email appears to be from). Valid AWS credentials are required for this email transporter to work.

Transactional emails templates are located in the following locations:

- Kratos emails in [`./../../apps/hash-external-services/kratos/templates/`](./../../apps/hash-external-services/kratos/templates/). This directory contains the following templates:
  - [`recovery_code`](./../../apps/hash-external-services/kratos/templates/recovery_code) - Email templates for the account recovery flow using a code for the UI.
    - When an email belongs to a registered HASH user, it will use the `valid` template, otherwise the `invalid` template is used.
  - [`verification_code`](./../../apps/hash-external-services/kratos/templates/verification_code) - Email verification templates for the account registration flow using a code for the UI.
    - When an email belongs to a registered HASH user, it will use the `valid` template, otherwise the `invalid` template is used.
- HASH emails in [`../hash-api/src/email/index.ts`](../hash-api/src/email/index.ts)

</details>

<details>
  <summary> &nbsp; <strong>Option 3.</strong> Deploying HASH to the cloud</summary>

### Deploying HASH to the cloud

**Support for running HASH in the cloud is coming soon.** We plan on publishing a comprehensive guide to deploying HASH on AWS/GCP/Azure in the near future. In the meantime, instructions contained in the root [`/infra` directory](https://github.com/hashintel/hash/tree/main/infra) might help in getting started.

</details>

## [![a](/.github/assets/gh_icon_examples_20px-base.svg)][gh-examples] &nbsp; Examples

Learn how you might use HASH by browsing the [use cases] directory, or check out the _[Awesome HASH]_ repository for more inspiration.

## [![a](/.github/assets/gh_icon_roadmap_20px-base.svg)][gh-roadmap] &nbsp; Roadmap

Browse the HASH [development roadmap] for more information about currently in-flight and upcoming features.

## [![a](/.github/assets/gh_icon_repo-structure_20px-base.svg)][gh-repo-structure] &nbsp; About this repository

<details>
  <summary> &nbsp; Repository structure</summary>

### Repository structure

This repository's contents is divided across several primary sections:

- [**`/apps`**](/apps) contains the primary code powering our runnable [applications](https://github.com/hashintel/hash/tree/main/apps#applications)
  - The HASH application itself is divided into various different services which can be found in this directory.
- [**`/blocks`**](/blocks) contains our public _Block Protocol_ [blocks](https://github.com/hashintel/hash/tree/main/blocks#blocks)
- [**`/content`**](/content) contains our publicly-editable website [content](https://github.com/hashintel/hash/tree/main/content#content) (e.g. glossary definitions, user docs)
- [**`/infra`**](/infra) houses deployment scripts, utilities and other [infrastructure](https://github.com/hashintel/hash/tree/main/infra#infrastructure) useful in running our apps
- [**`/libs`**](/libs) contains [libraries](https://github.com/hashintel/hash/tree/main/libs#libraries) including npm packages and Rust crates
- [**`/tests`**](/tests) contains end-to-end and integration tests that span across one or more apps, blocks or libs

</details>

<details>
  <summary> &nbsp; Environment variables</summary>

### Environment variables

Here's a list of possible environment variables. Everything that's necessary already has a default value.

You **do not** need to set any environment variables to run the application.

#### General API server environment variables

- `NODE_ENV`: ("development" or "production") the runtime environment. Controls
  default logging levels and output formatting.
- `PORT`: the port number the API will listen on.

#### AWS configuration

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

#### File uploads

By default, files are uploaded locally, which is **not** recommended for production use. It is also possible to upload files on AWS S3.

- `FILE_UPLOAD_PROVIDER`: Which type of provider is used for file uploads. Possible values `LOCAL_FILE_SYSTEM`, or `AWS_S3`. If choosing S3, then you need to configure the `AWS_S3_UPLOADS_` variables above.
- `LOCAL_FILE_UPLOAD_PATH`: Relative path to store uploaded files if using the local file system storage provider. Default is `var/uploads` (the `var` folder is the folder normally used for application data)

#### Email

During development, the dummy email transporter writes emails to a local folder.

- `HASH_EMAIL_TRANSPORTER`: `dummy`, `aws`, or `smtp`. If set to dummy, the local dummy email transporter will be used in development or test environments (it logs to the console).
- `DUMMY_EMAIL_TRANSPORTER_FILE_PATH`: Default is `var/api/dummy-email-transporter/email-dumps.yml`
- `SYSTEM_EMAIL_SENDER_NAME`: the display name for the email sender (required if transport is `aws` or `smtp`)
- `SYSTEM_EMAIL_ADDRESS`: the email address for the email sender (required if transport is `aws` or `smtp`)
- `SMTP_SERVER_HOST`: the host for a SMTP server (required if transporter is `smtp`)
- `SMTP_SERVER_PORT`: the port for a SMTP server (required if transporter is `smtp`)
- `SMTP_SERVER_USERNAME`: auth username for SMTP server (optional if API is automatically authenticated)
- `SMTP_SERVER_PASSWORD`: password for SMTP server (optional if API is automatically authenticated)

#### Postgres

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

#### Redis

- `HASH_REDIS_HOST` (default: `localhost`)
- `HASH_REDIS_PORT` (default: `6379`)

#### Statsd

If the service should report metrics to a StatsD server, the following variables must be set.

- `STATSD_ENABLED`: Set to "1" if the service should report metrics to a StatsD server.
- `STATSD_HOST`: the hostname of the StatsD server.
- `STATSD_PORT`: (default: 8125) the port number the StatsD server is listening on.

#### Snowplow telemetry

- `HASH_TELEMETRY_ENABLED`: whether Snowplow is used or not. `true` or `false`. (default: `false`)
- `HASH_TELEMETRY_HTTPS`: set to "1" to connect to the Snowplow over an HTTPS connection. `true` or `false`. (default: `false`)
- `HASH_TELEMETRY_DESTINATION`: the hostname of the Snowplow tracker endpoint to connect to. (required)
- `HASH_TELEMETRY_APP_ID`: ID used to differentiate application by. Can be any string. (default: `hash-workspace-app`)

#### Others

- `FRONTEND_URL`: URL of the frontend website for links (default: `http://localhost:3000`)
- `NOTIFICATION_POLL_INTERVAL`: the interval in milliseconds at which the frontend will poll for new notifications, or 0 for no polling. (default: `10_000`)
- `HASH_INTEGRATION_QUEUE_NAME` The name of the Redis queue which updates to entities are published to
- `HASH_SEARCH_LOADER_PORT`: (default: `3838`)
- `HASH_SEARCH_QUEUE_NAME`: The name of the queue to push changes for the search loader service (default: `search`)
- `API_ORIGIN`: The origin that the API service can be reached on (default: `http://localhost:5001`)
- `SESSION_SECRET`: The secret used to sign sessions (default: `secret`)
- `LOG_LEVEL`: the level of runtime logs that should be omitted, either set to `debug`, `info`, `warn`, `error` (default: `info`)
- `BLOCK_PROTOCOL_API_KEY`: the api key for fetching blocks from the [Þ Hub](https://blockprotocol.org/hub). Generate a key at https://blockprotocol.org/settings/api-keys.

</details>

## [![a](/.github/assets/gh_icon_contributing_20px-base.svg)][gh-contributing] &nbsp; Contributing

Please see [CONTRIBUTING](.github/CONTRIBUTING.md) if you're interested in getting involved in the design or development of HASH.

We're also [hiring] for a number of key roles. We generally don't accept applications for engineering roles like a normal company might, preferring to headhunt (using HASH as a tool to help us find the best people)... but contributing to our public monorepo, even in a small way, is one way of _guaranteeing_ you end up on our radar as every PR is reviewed by a human, as well as AI.

We also provide repo-specific [example configuration files](/.config/_examples) you can use for popular IDEs, including [VSCode](/.config/_examples/vscode) or [Zed](/.config/_examples/zed).

## [![a](/.github/assets/gh_icon_license_20px-base.svg)][gh-license] &nbsp; License

The vast majority of this repository is published as free, open-source software. Please see [LICENSE](LICENSE.md) for more information about the specific licenses under which the different parts are available.

## [![a](/.github/assets/gh_icon_security_20px-base.svg)][gh-security] &nbsp; Security

Please see [SECURITY](.github/SECURITY.md) for instructions around reporting issues, and details of which package versions we actively support.

## [![a](/.github/assets/gh_icon_contact_20px-base.svg)][gh-contact] &nbsp; Contact

Find us on 𝕏 at [@hashai](https://x.com/hashai), email [hey@hash.ai](mailto:hey@hash.ai), create a [discussion](https://github.com/orgs/hashintel/discussions), or open an [issue](https://github.com/hashintel/hash/issues/new/choose) for quick help and community support.

Project permalink: `https://github.com/hashintel/hash`
