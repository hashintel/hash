# Chunking and embedding library

## Development

The library relies on common Rust tools as configured in the repository root. This includes:

- For linting, [`clippy`](https://github.com/rust-lang/rust-clippy) is used: `cargo clippy --package chonky`
- [`rustfmt`](https://github.com/rust-lang/rustfmt) serves as the formatter: `cargo fmt`

### Testing

The tests for the package can either be run by using the default test harness:

```sh
cargo test --package chonky
```

or by using [`nextest`](https://nexte.st):

```bash
cargo nextest run --package chonky
# nextest currently does not support doc-tests
cargo test --package chonky --doc
```

### Documentation

The documentation can be generated via

```bash
cargo doc --package chonky --no-deps --open
```
