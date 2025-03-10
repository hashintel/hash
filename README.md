[app.hash.ai]: https://app.hash.ai?utm_medium=organic&utm_source=github_readme_hash-repo_root
[create an account]: https://app.hash.ai/signup?utm_medium=organic&utm_source=github_readme_hash-repo_root
[development roadmap]: https://hash.dev/roadmap?utm_medium=organic&utm_source=github_readme_hash-repo_root
[hiring]: https://hash.ai/careers?utm_medium=organic&utm_source=github_readme_hash-repo_root
[running your own instance]: https://hash.dev/docs/get-started/setup#local-hash?utm_medium=organic&utm_source=github_readme_hash-repo_root

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

**HASH is a self-buliding, open-source database which grows, structures and checks itself.** HASH integrates data in (near-)realtime, and provides a powerful set of interfaces so that information can be understood and used in any context. Intelligent, autonomous agents can be deployed to grow, check, and maintain the database, integrating and structuring information from the public internet as well as your own connected private sources. And users, including those who are non-technical, are able to visually browse and manage both entities (data) and types (schemas). HASH acts as a source of truth for critical data, no matter its source, and provides a platform for high-trust, safety-assured decision-making. [Read our blog post →](https://hash.ai/blog/self-building-database)

**In the future...** we plan on growing HASH into an all-in-one workspace, or complete operating system, with AI-generated interfaces known as "blocks" created at the point of need, on top of your strongly-typed data (addressing the data quality and integrity challenges inherent in today's current generation of generative AI interfaces).

## [![a](/.github/assets/gh_icon_getting-started_20px-base.svg)][gh-getting-started] &nbsp; Getting started

<details>
  <summary> &nbsp; 🚀 <strong>Quick-start (<5 mins):</strong> use the hosted app</summary>

### Create an account

The only current "officially supported" way of trying HASH right now is by signing up for and using the hosted platform at [app.hash.ai]

[Create an account] to get started.

</details>
    
<details>
  <summary> &nbsp; Running HASH locally</summary>

### Running HASH locally

**Running HASH locally is not yet officially supported.** We plan on publishing a comprehensive guide to running your own instance of HASH shortly (2025Q2). In the meantime, you may try the instructions below.

#### Experimental instructions

1. Make sure you have, [Git](https://git-scm.com), [Rust](https://www.rust-lang.org), [Docker](https://docs.docker.com/get-docker/), and [Protobuf](https://github.com/protocolbuffers/protobuf). Building the Docker containers requires [Docker Buildx](https://docs.docker.com/build/install-buildx/).
   Run each of these version commands and make sure the output is expected:

   ```sh
   git --version
   ## ≥ 2.17

   rustup --version
   ## ≥ 1.27.1 (Required to match the toolchain as specified in `rust-toolchain.toml`, lower versions most likely will work as well)

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

7. Launch external services (Postgres, the graph query layer, Kratos, Redis, and OpenSearch) as Docker containers:

   ```sh
   yarn external-services up --wait
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

If you need to run the browser plugin locally, see the `README.md` in the `apps/plugin-browser` directory.

##### Resetting the local database

If you need to reset the local database, to clear out test data or because it has become corrupted during development, you have two options:

1. The slow option – rebuild in Docker

   1. In the Docker UI (or via CLI at your preference), stop and delete the `hash-external-services` container
   2. In 'Volumes', search 'hash-external-services' and delete the volumes shown
   3. Run `yarn external-services up --wait` to rebuild the services

2. The fast option – reset the database via the Graph API

   1. Run the Graph API in test mode by running `yarn dev:graph:test-server`
   2. Run `yarn graph:reset-database` to reset the database
   3. **If you need to use the frontend**, you will also need to delete the rows in the `identities` table in the `dev_kratos` database, or signin will not work. You can do so via any Postgres UI or CLI. The db connection and user details are in `.env`

##### External services test mode

The external services of the system can be started in 'test mode' to prevent polluting the development database.
This is useful for situations where the database is used for tests that modify the database without cleaning up afterwards.

To make use of this test mode, the external services can be started as follows:

```sh
yarn external-services:test up
```

</details>

<details>
  <summary> &nbsp; Deploying HASH to the cloud</summary>

### Deploying HASH to the cloud

To deploy HASH in the cloud, follow the instructions contained in the root [`/infra` directory](https://github.com/hashintel/hash/tree/main/infra).

</details>


## [![a](/.github/assets/gh_icon_examples_20px-base.svg)][gh-examples] &nbsp; Examples

**Coming soon:** we'll be collecting examples in the _[Awesome HASH]_ repository.

## [![a](/.github/assets/gh_icon_roadmap_20px-base.svg)][gh-roadmap] &nbsp; Roadmap

Browse the HASH [development roadmap] for more information about currently in-flight and upcoming features.

## [![a](/.github/assets/gh_icon_repo-structure_20px-base.svg)][gh-repo-structure] &nbsp; About this repository

This repository's contents is divided across several primary sections:

- [**`/apps`**](/apps) contains the primary code powering our runnable [applications](https://github.com/hashintel/hash/tree/main/apps#applications)
  - The HASH application itself is divided into various different services which can be found in this directory.
- [**`/blocks`**](/blocks) contains our public _Block Protocol_ [blocks](https://github.com/hashintel/hash/tree/main/blocks#blocks)
- [**`/infra`**](/infra) houses deployment scripts, utilities and other [infrastructure](https://github.com/hashintel/hash/tree/main/infra#infrastructure) useful in running our apps
- [**`/libs`**](/libs) contains [libraries](https://github.com/hashintel/hash/tree/main/libs#libraries) including npm packages and Rust crates
- [**`/tests`**](/tests) contains end-to-end and integration tests that span across one or more apps, blocks or libs

## [![a](/.github/assets/gh_icon_contributing_20px-base.svg)][gh-contributing] &nbsp; Contributing

Please see [CONTRIBUTING](.github/CONTRIBUTING.md) if you're interested in getting involved in the design or development of HASH.

We're also [hiring] for a number of key roles. We don't accept applications for engineering roles like a normal company might, but exclusively headhunt (using HASH as a tool to help us find the best people). Contributing to our public monorepo, even in a small way, is one way of _guaranteeing_ you end up on our radar as every PR is reviewed by a human, as well as AI.

We also provide repo-specific [example configuration files](/.config/_examples) you can use for popular IDEs, including [VSCode](/.config/_examples/vscode) or [Zed](/.config/_examples/zed).

## [![a](/.github/assets/gh_icon_license_20px-base.svg)][gh-license] &nbsp; License

The vast majority of this repository is published as free, open-source software. Please see [LICENSE](LICENSE.md) for more information about the specific licenses under which the different parts are available.

## [![a](/.github/assets/gh_icon_security_20px-base.svg)][gh-security] &nbsp; Security

Please see [SECURITY](.github/SECURITY.md) for instructions around reporting issues, and details of which package versions we actively support.

## [![a](/.github/assets/gh_icon_contact_20px-base.svg)][gh-contact] &nbsp; Contact

Find us on 𝕏 at [@hashintel](https://x.com/hashintel), email [hey@hash.ai](mailto:hey@hash.ai), create a [discussion](https://github.com/orgs/hashintel/discussions), or open an [issue](https://github.com/hashintel/hash/issues/new/choose) for quick help and community support.

Project permalink: `https://github.com/hashintel/hash`
