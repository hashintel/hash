# Change Log

All notable changes to `error-stack` will be documented in this file.

## Planned

- Support for [`serde`](https://serde.rs) (`Serialize` only)
- Support for [`defmt`](https://defmt.ferrous-systems.com)

## 0.2.0 - Unreleased

### Breaking Changes

- Use `Provider` API from `core::any` ([#697](https://github.com/hashintel/hash/pull/697))
- Hide `futures-core` feature ([#695](https://github.com/hashintel/hash/pull/695))
- Set the MSRV to 1.63 ([#944](https://github.com/hashintel/hash/pull/944))
- Move extension traits into `error_stack::ext` module ([#970](https://github.com/hashintel/hash/pull/970))

### Features

- Implement [`Termination`](https://doc.rust-lang.org/stable/std/process/trait.Termination.html) for `Report` ([#671](https://github.com/hashintel/hash/pull/671))
- Add support for [`core::error::Error`](https://doc.rust-lang.org/nightly/core/error/trait.Error.html) on nightly ([#1038](https://github.com/hashintel/hash/pull/1038))
- Add support for [`Error::provide()`](https://doc.rust-lang.org/nightly/core/error/trait.Error.html#method.provide) ([#904](https://github.com/hashintel/hash/pull/904))
- Add compatibility for `anyhow` and `eyre` to convert their types into `Report` ([#763](https://github.com/hashintel/hash/pull/763))
- Add support for related errors and multiple error sources ([#747](https://github.com/hashintel/hash/pull/747))
- New output for [Debug](https://doc.rust-lang.org/nightly/core/fmt/trait.Debug.html) ([#794](https://github.com/hashintel/hash/pull/794))
- New hook interface for [Debug](https://doc.rust-lang.org/nightly/core/fmt/trait.Debug.html) ([#794](https://github.com/hashintel/hash/pull/794))
- `Report::set_debug_hook` and `Report::set_display_hook` no longer return an error ([#794](https://github.com/hashintel/hash/pull/794))

### Deprecations

- `IntoReport::report`: Use `IntoReport::into_report` instead ([#698](https://github.com/hashintel/hash/pull/698))
- `Report::source`: Use `Report::sources` instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Report::source_mut`: Use `Report::sources_mut` instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Report::backtrace`: Use `Report::downcast_ref::<Backtrace>` (non-nightly), `Report::requested_ref::<Backtrace>` (nightly) instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Report::span_trace`: Use `Report::downcast_ref::<SpanTrace>` (non-nightly), `Report::requested_ref::<SpanTrace>` (nightly) instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Frame::source`: Use `Frame::sources` instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Frame::source_mut`: Use `Frame::sources_mut` instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Report::set_debug_hook`: Use `Report::install_debug_hook` instead ([#794](https://github.com/hashintel/hash/pull/794))
- `Report::set_display_hook`([#794](https://github.com/hashintel/hash/pull/794))

### Internal improvements

- Greatly reduce the usage of `unsafe` code ([#774](https://github.com/hashintel/hash/pull/774))

## [0.1.0](https://github.com/hashintel/hash/tree/d14efbc38559fc38d36e03ebdd499b44cb80c668/packages/libs/error-stack) - 2022-06-10

- Initial release
