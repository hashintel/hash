# The Project Layout

Currently the hEngine consists of two binaries located within the [`./bin`](bin) folder.
To read the documentation for the various components, run:

```sh
cargo doc --open --workspace
```

and explore the documentation for the relevant crates (starting with the following two)

## The CLI

Located within [`./bin/cli`](bin/cli), the CLI binary is responsible for the orchestration of a HASH simulation project, handling the management of engine processes for its experiments.

## The Engine Process(es)

Located within [`./bin/hash_engine`](bin/hash_engine), the HASH Engine binary implements all of the logic required for running a single experiment and its one or more simulations.
