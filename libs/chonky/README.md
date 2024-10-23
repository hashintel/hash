[crates.io]: https://crates.io/crates/chonky
[libs.rs]: https://lib.rs/crates/chonky
[rust-version]: https://www.rust-lang.org
[documentation]: https://docs.rs/chonky
[license]: https://github.com/hashintel/hash/blob/main/libs/chonky/LICENSE.md

[![crates.io](https://img.shields.io/crates/v/chonky)][crates.io]
[![libs.rs](https://img.shields.io/badge/libs.rs-chonky-orange)][libs.rs]
[![rust-version](https://img.shields.io/static/v1?label=Rust&message=nightly-2024-10-21&color=blue)][rust-version]
[![documentation](https://img.shields.io/docsrs/chonky)][documentation]
[![license](https://img.shields.io/static/v1?label=license&message=AGPL-3&color=blue)][license]

[Open issues](https://github.com/hashintel/hash/issues?q=is%3Aissue+is%3Aopen+label%3AA-chonky) / [Discussions](https://github.com/hashintel/hash/discussions?discussions_q=label%3AA-chonky)

# Chunking and embedding library

General-purpose library for segmenting, chunking and embedding files

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

## Contributors

`chonky` was created by [Jesus Fileto](https://github.com/JesusFileto). It is being developed in conjunction with [HASH](https://hash.dev/). As an open-source project, we gratefully accept external contributions and have published a [contributing guide](https://github.com/hashintel/hash/blob/main/.github/CONTRIBUTING.md) that outlines the process. If you have questions, please create a [discussion](https://github.com/orgs/hashintel/discussions). You can also report bugs [directly on the GitHub repo](https://github.com/hashintel/hash/issues/new/choose).

## License

`chonky` is available under the GNU Affero General Public License (v3). Please see the [LICENSE] file to review your options.
