[crates.io]: https://crates.io/crates/error-stack-experimental
[libs.rs]: https://lib.rs/crates/error-stack-experimental
[rust-version]: https://www.rust-lang.org
[documentation]: https://docs.rs/error-stack-macros
[license]: https://github.com/hashintel/hash/blob/main/libs/error-stack/LICENSE.md

[![crates.io](https://img.shields.io/crates/v/error-stack-experimental)][crates.io]
[![libs.rs](https://img.shields.io/badge/libs.rs-error--stack--experimental-orange)][libs.rs]
[![rust-version](https://img.shields.io/static/v1?label=Rust&message=1.63.0/nightly-2024-09-09&color=blue)][rust-version]
[![documentation](https://img.shields.io/docsrs/error-stack-experimental)][documentation]
[![license](https://img.shields.io/crates/l/error-stack)][license]

[Open issues](https://github.com/hashintel/hash/issues?q=is%3Aissue+is%3Aopen+label%3AA-error-stack) / [Discussions](https://github.com/hashintel/hash/discussions?discussions_q=label%3AA-error-stack)

# error-stack-experimental

`error-stack-experimental` serves as a testing ground for novel features and concepts that are not yet ready for inclusion in the main `error-stack` crate. This separate crate allows us to explore and refine new ideas without impacting the stability of the core library.

While `error-stack-experimental` is designed for experimentation, it adheres to semantic versioning principles to maintain a degree of reliability for users. However, it's important to note that features introduced in this crate may be subject to removal or integration into the main crate in future updates. As such, users should approach the experimental features with caution and not rely on them as permanent components of the error handling ecosystem. To ease the transition of features from `error-stack-experimental` to `error-stack`, we aim to maintain compatibility between the two crates as much as possible, using techniques such as re-exports in case of feature promotion to allow for a deprecation window.
