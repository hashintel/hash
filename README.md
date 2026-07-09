[create an account]: https://app.hash.ai/signup?utm_medium=organic&utm_source=github_readme_hash-repo_root
[development roadmap]: https://hash.dev/roadmap?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hiring]: https://hash.ai/careers?utm_medium=organic&utm_source=github_readme_hash-repo_root
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

**HASH supports turning raw information into knowledge and process graphs, helping create graph-backed _world models_ that power process automation, optimization, decision making, and AI.** In essence, HASH is a self-building, open-source database which grows, structures and checks itself. Integrating data in (near-)realtime, it provides a powerful set of interfaces so that information can be understood and used in any context. Intelligent, autonomous [agents](https://hash.ai/guide/agents) can be deployed to grow, check, and maintain the database, collating and structuring information from the public internet — as well as your own [connected private sources](https://hash.ai/guide/integrations) — in a standardized semantic form. Users, including those who are non-technical, are able to visually browse and manage both [entities](https://hash.ai/guide/entities) (data) and [types](https://hash.ai/guide/types) (schemas). HASH acts as a source of truth for critical data, no matter its source, and provides a platform for high-trust, safety-assured decision-making. [Read our blog post →](https://hash.ai/blog/self-building-database)

Many of HASH's features are unique to a platform of its kind, including its support for [bitemporality](https://hash.ai/features/provenance), which provides first-order support for recording and querying both when something happened and, separately, when it became known. This capability is central to our support for [better process modeling](https://hash.dev/blog/how-not-to-build-a-pfm).

## [![a](/.github/assets/gh_icon_getting-started_20px-base.svg)][gh-getting-started] &nbsp; Getting started

Instructions for using HASH can be found in the [HASH Developer Docs](https://hash.dev/docs/get-started/setup).

<details>
  <summary> &nbsp; <strong>Option 1.</strong> Use <a href="https://app.hash.ai/?utm_medium=organic&utm_source=github_readme_hash-repo_root">hash.ai</a> — <em>recommended (quick-start: <5 mins)</em> 🚀</summary>

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

These instructions set up HASH for **working on the codebase** — the app services run natively with hot-reload against containerised infrastructure. To run the whole stack from container images instead (no toolchain required on the host), follow [the setup guide](https://hash.dev/docs/get-started/setup#local-hash).

#### Prerequisites

Install these on the host first:

- **[Git](https://git-scm.com)** (≥ 2.17)
- **[Docker](https://docs.docker.com/get-docker/)** (≥ 20.10), including:
  - **[Docker Compose](https://docs.docker.com/compose/)** (≥ 2.17) — orchestrates the stack
  - **[Docker Buildx](https://docs.docker.com/build/install-buildx/)** (≥ 0.10) — builds the images
- **[mise](https://mise.jdx.dev/)** (≥ 2026.6.13) — installs and pins Node, Rust, protoc and the other required tool versions

Give Docker at least **8 GB RAM** (Preferences → Resources) and keep ~15 GB of disk free for build artefacts, images and volumes.

Check your versions:

```sh
git --version            # ≥ 2.17
docker --version         # ≥ 20.10
docker compose version   # ≥ 2.17
docker buildx version    # ≥ 0.10
mise --version           # ≥ 2026.6.13
```

#### Setup

1. Clone the repository and enter it:

   ```sh
   git clone https://github.com/hashintel/hash.git && cd hash
   ```

2. Install the pinned toolchains (`mise trust` is required once per clone), then [activate `mise`](https://mise.jdx.dev/getting-started.html#activate-mise) in your shell:

   ```sh
   mise trust && mise install
   ```

3. Install JavaScript dependencies:

   ```sh
   yarn install
   ```

4. Create a `.env.local` in the repository root. Real keys are only needed for AI features — dummy values work otherwise:

   ```sh
   OPENAI_API_KEY=dummy
   ANTHROPIC_API_KEY=dummy
   HASH_TEMPORAL_WORKER_AI_AWS_ACCESS_KEY_ID=dummy
   HASH_TEMPORAL_WORKER_AI_AWS_SECRET_ACCESS_KEY=dummy
   ```

   `.env.local` is git-ignored and overrides `.env` and `.env.development`. Don't edit the other `.env` files unless you mean to change the defaults.

5. Start the containerised infrastructure:

   ```sh
   yarn compose up -d
   ```

   This runs the `dev` and `observability` profiles — Postgres, Redis, Kratos, Hydra, Temporal, Vault and MinIO, plus the Grafana stack ([http://localhost:3001](http://localhost:3001)) and the Temporal UI ([http://localhost:3100/namespaces/HASH](http://localhost:3100/namespaces/HASH)). The graph layer is **not** included; you run it as part of the app below.

6. Start HASH. The simplest is to run everything natively (this compiles the graph from Rust, 10–20 min on a cold first build):

   ```sh
   yarn start
   ```

   For hot-reload on the api and frontend, run the graph and the app in separate terminals instead:

   ```sh
   yarn start:graph   # terminal 1 — compiles and runs the graph
   yarn dev           # terminal 2 — api + frontend with hot-reload
   ```

   The dev-mode API seeds three users (password `password`): `alice@example.com`, `bob@example.com` (regular) and `admin@example.com` (admin). Visit [http://localhost:3000](http://localhost:3000) once the API logs `localhost:5001`.

#### Skipping the Rust build

If you're **not** working on the graph itself, run it in Docker instead of compiling Rust locally — add the `hgres` profile and start only the api + frontend natively:

```sh
yarn compose --profile hgres up -d   # infrastructure + graph in Docker
yarn dev                             # api + frontend only
```

#### Running the browser plugin

If you need to run the browser plugin locally, see [the `README.md`](https://github.com/hashintel/hash/tree/main/apps/plugin-browser#readme) in the `apps/plugin-browser` directory.

#### Resetting the local database

If you need to reset the local database, to clear out test data or because it has become corrupted during development:

1. Run `yarn compose down -v` (this will take the Docker services down and drop the volumes)
2. Run `yarn compose up -d` to start everything again

#### Sending emails

Email-sending in HASH is handled by either Kratos (in the case of authentication-related emails) or through the HASH API Email Transport (for everything else).

To use `AwsSesEmailTransporter`, set `export HASH_EMAIL_TRANSPORTER=aws` in your terminal before running the app, along with `SYSTEM_EMAIL_ADDRESS` and `SYSTEM_EMAIL_SENDER_NAME` (which control what address and name the email appears to be from). Valid AWS credentials are required for this email transporter to work.

Transactional emails templates are located in the following locations:

- Kratos emails in [`./infra/compose/kratos/templates/`](./infra/compose/kratos/templates/). This directory contains the following templates:
  - [`recovery_code`](./infra/compose/kratos/templates/recovery_code) - Email templates for the account recovery flow using a code for the UI.
    - When an email belongs to a registered HASH user, it will use the `valid` template, otherwise the `invalid` template is used.
  - [`verification_code`](./infra/compose/kratos/templates/verification_code) - Email verification templates for the account registration flow using a code for the UI.
    - When an email belongs to a registered HASH user, it will use the `valid` template, otherwise the `invalid` template is used.
- HASH emails in [`apps/hash-api/src/email/index.ts`](./apps/hash-api/src/email/index.ts)

</details>

<details>
  <summary> &nbsp; <strong>Option 3.</strong> Deploying HASH to the cloud</summary>

### Deploying HASH to the cloud

See the [self-hosting guide](https://hash.dev/docs/get-started/setup#self-hosted-hash) for running HASH on infrastructure you operate. The full Docker Compose topology — graph, API, frontend, auth, workflows, storage and observability — lives in [`infra/compose/`](https://github.com/hashintel/hash/tree/main/infra/compose) and is the starting point for a self-hosted deployment.

</details>

## [![a](/.github/assets/gh_icon_examples_20px-base.svg)][gh-examples] &nbsp; Examples

Discover ways to use HASH by browsing the [use cases] directory, or check out the _[Awesome HASH]_ repository for more inspiration.

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

#### Rudderstack telemetry

- `HASH_API_RUDDERSTACK_KEY`: Rudderstack write key for product analytics. Leave blank to disable telemetry. The `environment` label on events is derived from `ENVIRONMENT`. (optional)

#### Others

- `FRONTEND_URL`: URL of the frontend website for links (default: `http://localhost:3000`)
- `NOTIFICATION_POLL_INTERVAL`: the interval in milliseconds at which the frontend will poll for new notifications, or 0 for no polling. (default: `10_000`)
- `HASH_INTEGRATION_QUEUE_NAME` The name of the Redis queue which updates to entities are published to
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
