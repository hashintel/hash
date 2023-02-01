# Change Log

All notable changes to `error-stack` will be documented in this file.

## Planned

- Support for [`defmt`](https://defmt.ferrous-systems.com)

## [0.3.0](https://github.com/hashintel/hash/tree/error-stack%400.3.0/libs/error-stack) - 2023-02-01

### Breaking Changes

- Remove all previously deprecated methods ([#1485](https://github.com/hashintel/hash/pull/1485))
- Remove `pretty-print` feature ([#1800](https://github.com/hashintel/hash/pull/1800))

### Features

- Add initial serializing support using [`serde`](https://serde.rs) ([#1290](https://github.com/hashintel/hash/pull/1290))
- Support `Debug` hooks on `no-std` platforms via the `hooks` feature ([#1556](https://github.com/hashintel/hash/pull/1556))
- Support converting `Report` into [`Error`](https://doc.rust-lang.org/core/error/trait.Error.html) via `Report::as_error` and `Report::into_error` ([#1749](https://github.com/hashintel/hash/pull/1749))
- Support converting `Report` into `Box<dyn Error>` via the `From` trait ([#1749](https://github.com/hashintel/hash/pull/1749))
- Programmatic selection of color mode and charset used for `Debug` output ([#1800](https://github.com/hashintel/hash/pull/1800))

## [0.2.4](https://github.com/hashintel/hash/tree/error-stack%400.2.4/packages/libs/error-stack) - 2022-11-04

- The output of [`Location`](https://doc.rust-lang.org/std/panic/struct.Location.html) is no longer hard-coded and can now be adjusted through hooks. ([#1237](https://github.com/hashintel/hash/pull/1237))
- The `TypeId` of a value contained in a `Frame` can now be accessed via `Frame::type_id` ([#1289](https://github.com/hashintel/hash/pull/1289))
- Deprecate `Frame::location` in favor of an additional attachment on context change/creation ([#1311](https://github.com/hashintel/hash/pull/1311))

## [0.2.3](https://github.com/hashintel/hash/tree/error-stack%400.2.3/packages/libs/error-stack) - 2022-10-12

- Add Apache 2.0 as an additional license option ([#1172](https://github.com/hashintel/hash/pull/1172))

## [0.2.2](https://github.com/hashintel/hash/tree/error-stack%400.2.2/packages/libs/error-stack) - 2022-10-07

- Add a space before attachment formatting ([#1174](https://github.com/hashintel/hash/pull/1174))

## [0.2.0](https://github.com/hashintel/hash/tree/error-stack%400.2.0/packages/libs/error-stack) - 2022-10-03

### Breaking Changes

- Set the MSRV to 1.63 ([#944](https://github.com/hashintel/hash/pull/944))
- Use `Provider` API from `core::any` ([#697](https://github.com/hashintel/hash/pull/697))
- Remove the unused features `hooks`, `futures`, and `futures-core` ([#695](https://github.com/hashintel/hash/pull/695), [#1138](https://github.com/hashintel/hash/pull/1138))

### Features

- Support backtraces on non-nightly channels starting with 1.65.0-beta ([#1098](https://github.com/hashintel/hash/pull/1098))
- Add support for [`core::error::Error`](https://doc.rust-lang.org/nightly/core/error/trait.Error.html) on nightly ([#1038](https://github.com/hashintel/hash/pull/1038))
- Add support for [`Error::provide()`](https://doc.rust-lang.org/nightly/core/error/trait.Error.html#method.provide) ([#904](https://github.com/hashintel/hash/pull/904))
- New output for [Debug](https://doc.rust-lang.org/nightly/core/fmt/trait.Debug.html) ([#794](https://github.com/hashintel/hash/pull/794))
- New hook interface for [Debug](https://doc.rust-lang.org/nightly/core/fmt/trait.Debug.html) ([#794](https://github.com/hashintel/hash/pull/794))
- Add support for related errors and multiple error sources ([#747](https://github.com/hashintel/hash/pull/747))
- Add compatibility for `anyhow` and `eyre` to convert their types into `Report` ([#763](https://github.com/hashintel/hash/pull/763))
- Implement [`Termination`](https://doc.rust-lang.org/stable/std/process/trait.Termination.html) for `Report` ([#671](https://github.com/hashintel/hash/pull/671))
- `Report::set_debug_hook` and `Report::set_display_hook` no longer return an error ([#794](https://github.com/hashintel/hash/pull/794))

### Deprecations

- `IntoReport::report`: Use `IntoReport::into_report` instead ([#698](https://github.com/hashintel/hash/pull/698))
- `Report::backtrace`: Use `Report::downcast_ref::<Backtrace>` (non-nightly), `Report::request_ref::<Backtrace>` (nightly) instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Report::span_trace`: Use `Report::downcast_ref::<SpanTrace>` (non-nightly), `Report::request_ref::<SpanTrace>` (nightly) instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Frame::source`: Use `Frame::sources` instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Frame::source_mut`: Use `Frame::sources_mut` instead ([#747](https://github.com/hashintel/hash/pull/747))
- `Report::set_debug_hook`: Use `Report::install_debug_hook` instead ([#794](https://github.com/hashintel/hash/pull/794))
- `Report::set_display_hook`([#794](https://github.com/hashintel/hash/pull/794))

### Internal improvements

- Greatly reduce the amount of `unsafe` code ([#774](https://github.com/hashintel/hash/pull/774))

## [0.1.0](https://github.com/hashintel/hash/tree/error-stack%400.1.0/packages/libs/error-stack) - 2022-06-10

- Initial release
