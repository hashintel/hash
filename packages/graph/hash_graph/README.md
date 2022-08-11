# The HASH Graph API

## Run the Graph

The easiest way to run the Graph API is to use docker. Either invoke docker directly:

```shell
docker build --tag graph --file ../deployment/graph/Dockerfile .
docker run --rm --network host --name graph --env RUST_LOG=trace --detach graph
```

or by using `cargo make`:

```shell
cargo make build-docker
cargo make docker-up
```

The container can be stopped by calling

```shell
docker kill --signal SIGKILL graph
```

or

```shell
cargo make docker-down
```

## Building

In order to build the HASH Graph API make sure `cargo-make` is installed:

```shell
cargo install cargo-make
```

Then run the following command:

```shell
cargo make build
```

In order to create a release build, run:

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

The REST API can be tested as well. Note, that this does not clean up the database after running:

```shell
cargo make test-rest-api
```

## Generate OpenAPI client

The HASH Graph produces an OpenAPI Spec while running, which can be used to generate the `@hashintel/hash-graph-client` typescript client. In the `hash_graph` directory run:

```shell
cargo make generate-openapi-client
```

Make sure to run this command whenever changes are made to the specification. CI will not pass otherwise.
