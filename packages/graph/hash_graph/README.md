# The HASH Graph API

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
