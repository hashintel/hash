# The HASH Graph API

To run the HASH Graph API make sure `cargo-make` is installed:

```shell
cargo install cargo-make
```

## Run the Graph

1.  In order to set up the database, first the database has to be started:

```shell
cargo make deployment-up
```

It's possible to recreate the database by using

```shell
cargo make recreate-db
```

Then, the Graph API can be started:

```shell
cargo run
```

### Logging configuration

Some of the libraries used are very talkative in `trace` logging configurations, especially `mio`, `hyper`, and `tokio_util`.
If you're interested in just increasing the logs for the Graph, we recommend specifically targeting the crates with `RUST_LOG=graph=trace,hash_graph=trace`.

## Development

In order to build run the following command:

```shell
cargo make build
```

In order to create an optimized build, run:

```shell
cargo make --profile production build
```

Please see the list of all possible `cargo make` commands:

```shell
cargo make --list-all-steps
```

Every command line argument passed will also be forwarded to the subcommand, e.g. this will not only build the documentation but also open it in the browser:

```shell
cargo make doc --open
```

## Test the code

The code base has two test suites: The unit test suite and the integration tests. To run the unit-test suite, simply run the `test` command:

```shell
cargo make test
```

For the integration tests, the database needs to be deployed [as specified here](../README.md#running-the-database). Next, the integration test suite can be started:

```shell
cargo make test-integration
```

The REST API can be tested as well. Note, that this requires the Graph to run and does not clean up the database after running:

```shell
cargo make test-rest-api
```

## Generate OpenAPI client

The HASH Graph produces an OpenAPI Spec while running, which can be used to generate the `@hashintel/hash-graph-client` typescript client. In the `hash_graph` directory run:

```shell
cargo make generate-openapi-client
```

Make sure to run this command whenever changes are made to the specification. CI will not pass otherwise.
