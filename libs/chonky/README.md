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

[Open issues](https://github.com/hashintel/hash/issues?q=is%3Aissue+is%3Aopen+label%3A%22area%2Flibs+%3E+chonky%22) / [Discussions](https://github.com/orgs/hashintel/discussions?discussions_q=label%3A%22area%2Flibs+%3E+chonky%22+)

# Chunking and embedding library

General-purpose library for segmenting, chunking and embedding files

## Development

The library relies on common Rust tools as configured in the repository root. This includes:

- For linting, [`clippy`](https://github.com/rust-lang/rust-clippy) is used: `cargo clippy --package chonky`
- [`rustfmt`](https://github.com/rust-lang/rustfmt) serves as the formatter: `cargo fmt`

## Usage

To run this package, a compiled library of `pdfium` must be provided. The library can either be statically or dynamically linked. The `libs/` folder is reserved to store the libraries.

### Dynamic linking

A dynamic library can be downloaded from [`bblanchon/pdfium-binaries`](https://github.com/bblanchon/pdfium-binaries/releases). It's possible to download the library from the command line. For example, to download the library for `mac-arm64` from the release `6721` and store it in `./libs/`:

```sh
temp_dir=$(mktemp -d)
gh release download chromium/6721 --repo bblanchon/pdfium-binaries --pattern 'pdfium-mac-arm64.tgz' --dir $temp_dir
tar -xzf $temp_dir/pdfium-mac-arm64.tgz -C $temp_dir
mv $temp_dir/lib/* libs/
rm -rf $temp_dir
```

To link the library dynamically, don't enable the `static`. The binary will read `PDFIUM_DYNAMIC_LIB_PATH` to search for the library. If the variable is not set it will use `libs/`:

```sh
export PDFIUM_DYNAMIC_LIB_PATH="$(pwd)/libs/"
cargo build
```

### Static linking

A static library can be downloaded from [`paulocoutinhox/pdfium-lib`](https://github.com/paulocoutinhox/pdfium-lib/releases). It's possible to download the library from the command line. For example, to download the library for `macos` from the release `6694` and store it in `./libs/`:

```sh
temp_dir=$(mktemp -d)
gh release download 6694 --repo paulocoutinhox/pdfium-lib --pattern 'macos.tgz' --dir $temp_dir
tar -xzf $temp_dir/macos.tgz -C $temp_dir
mv $temp_dir/release/lib/* libs/
rm -rf $temp_dir
```

To link the library statically, enable the `static` feature by passing `--features static` to any `cargo` invocation. When building the library it will search for `PDFIUM_STATIC_LIB_PATH`. For example if the library is located at `libs/libpdfium.a` you can build the library with:

```sh
export PDFIUM_STATIC_LIB_PATH="$(pwd)/libs/"
cargo build --features static
```

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
