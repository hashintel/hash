# HASH Graph

This directory contains the code pertaining to the HASH Graph. Every folder in this directory contains a separate crate and is responsible for a different part of the graph. All crates are designed as libraries, which can either be consumed by other libraries. In `/apps/hash-graph` you can find the application that ties all the crates together and provides a binary to run the graph.

## Overview

Each crate has a `hash-graph-` prefix and the following crates are part of the HASH Graph:

- `api`: Endpoints for interacting with the graph. It provides a RESTful API to interact with the graph.
- `authorization`: Authorization layer which is responsible for authorizing the data that is being used in the graph, and the users who are interacting with the graph.
- `client`: A client which is used to interact with the graph. It provides a typed interface to interact with the graph.
- `postgres-store`: A crate that provides a PostgreSQL storage backend for the graph. Also, it defines the schema of the database and provides the funcitonality of dumping/restoring snaphots of the graph.
- `sdk`: The SDK for interacting with the graph in a more user-friendly way. It provides a high-level interface to interact with the graph.
- `store`: Declaration for the store interface which is used to interact with the graph.
- `temporal-versioning`: Temporal versioning is used to store the history of the graph. This crate provides the types and accompanying functionality which is needed to store the history of the graph.
- `test-server`: Utility functions which are used to test the graph. It provides an interface which should not be used in production as data might be lost.
- `type-fetcher`: To avoid that the graph has to communicate with the web directy, the type-fetcher is used as an intermediate layer to fetch the types from the web and send it to the graph.
- `types`: Contains the type which the graph is using to represent the data. It builds on top of the [`type-system`] crate.
- `validation`: A validation layer which is responsible for validating the data that is being inserted into the graph.

[`type-system`]: ../../@blockprotocol/type-system/rust

For a detailed view of each create use the in-code documentation. The documentation for each crate can be generated using `rustdoc`:

```shell
cargo doc --package --no-deps --open < SPEC > --all-features
```

for example

```shell
cargo doc --package hash-graph-store --all-features --no-deps --open
```

If you want to generate the documentation for all crates at once, you can use the following command:

```shell
cargo doc --workspace --all-features --no-deps --open
```
