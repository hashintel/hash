# HASH Graph

## Overview

This directory contains the code pertaining to the HASH Graph Query Layer. To run the HASH Graph Query Layer make sure `just` is installed:

```shell
cargo install just
```

This crate mainly creates a CLI interface to the graph crates defined in the [`libs/@local/graph`](../../libs/@local/graph) directory.

## Run the Graph

1. In order to set up the database, first the database has to be started:

<!-- markdownlint-disable no-blanks-blockquote -->

> [!IMPORTANT]  
> At the moment, the _Graph_ starts the services it depends on differently to the rest of the codebase.
>
> **Before running the following command:**
>
> Before trying to run the `external-services`, ensure you call `deployment-down` to tear down any existing [external services](/apps/hash-external-services) that were started, as outlined in the ["Getting Started"](/README.md#--getting-started) section of the root README.
>
> _In the future we plan to address this by revisiting the way the services are orchestrated, while still allowing for local non-container-based development._

```shell
just deployment-up
```

_It is possible to teardown the database with the equivalent `deployment-down` task_

Then, the Graph Query Layer can be started:

```shell
just run server
```

### Logging configuration

Some of the libraries used are very talkative in `trace` logging configurations, especially `mio`, `hyper`, and `tokio_util`.
If you're interested in just increasing the logs for the Graph, we recommend specifically targeting the crates with `HASH_GRAPH_LOG_LEVEL=graph=trace,hash-graph=trace`.

## Development

In order to build run the following command:

```shell
just build
```

In order to create an optimized build, run:

```shell
PROFILE=release just build
```

Please see the list of all possible `just` commands:

```shell
just
```

Every command line argument passed will also be forwarded to the subcommand, e.g. this will not only build the documentation but also open it in the browser:

```shell
just doc --open
```

### API Definitions

The Graph's API is current exposed over REST with an accompanying OpenAPI spec.

### Generate OpenAPI client

The HASH Graph produces an OpenAPI Spec while running, which can be used to generate the `@local/hash-graph-client` typescript client. In the `/apps/hash-graph` directory run:

```shell
just generate-openapi-specs
```

Make sure to run this command whenever changes are made to the specification. CI will not pass otherwise.

### Modifications

The spec is mostly generated from the code using [`utoipa`](https://github.com/juhaku/utoipa/), although some of the more complex types are specified manually within [`libs/graph/src/api/rest/json_schemas`](libs/graph/src/api/rest/json_schemas).

As such, when modifying return values related to these types, it's important to update the accompanying schemas.

#### Status

Responses containing non-OK statuses are returned according to the `Status` format defined in the [`@local/status`](/libs/@local/status/README.md) package.

The [`status.json`](libs/graph/src/api/rest/json_schemas/status.json) schema is responsible for the definition of this type, and should be updated whenever new payloads are added within [`./type-defs`](./type-defs).
JSON schema definitions can be generated within the build directory by uncommenting the line in the lib's [`build.rs`](libs/api/build.rs).

To locate the build directory, run with `cargo build -vv` and search for "Generated files in:"

New payloads can then be added in the `definitions` and `oneOf` of the `Status` schema.

> [!NOTE]
> Migrating to the above is in progress, and not all error responses currently satisfy the `Status` shape, consult the API spec to see.

---

## Test the code

The code base has a few test suites. Except for the unit tests, every test suite requires an active database connection. The test setup uses `docker` to start the required services. To run all available tests, run:

```shell
just test
```

## Migrations

Migrations in the Graph are handled through [`refinery`](https://github.com/rust-db/refinery). The migrations are located at [./postgres_migrations](apps/hash-graph/postgres_migrations/) and can be manually added to.

The `V` prefix **is significant** and must be set followed by an incrementing number. This number specifies the sequence migrations are applied in. the `V` refers to a versioned migration. The migration file format is `[V]{1}__{2}.sql` in our case, where `{1}` is the incrementing sequence number and `{2}` is a display name for the migration.

For undoing a migration we should create new migrations that undo changes. In general, migrations are easiest to manage from an Operations perspective if they are non-destructive wherever possible, doing as little data wrangling.

The tool we are using, `refinery`, also supports Rust based (`.rs`) migration files with the same naming scheme.

Migrations are run through the same binary as the server using the following command:

```shell
just run migrate
```

## Benchmark the code

The benchmark suite can be run with:

```shell
just bench
```

> [!WARNING]
> In terms of time, our benchmarks carry a fairly significant setup cost per suite upon initialization. As such, the benchmark databases **are not cleaned up** between or after runs.

> [!WARNING]
> This also means that if breaking changes are made to the seeding logic, **you must manually delete the benchmark tables to have them reseed**.
