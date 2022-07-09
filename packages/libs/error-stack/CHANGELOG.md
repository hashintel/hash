# Change Log

All notable changes to `error-stack` will be documented in this file.

## 0.2.0 - Unreleased

### Breaking Changes

- Use `Provider` API from `core::any` ([#697](https://github.com/hashintel/hash/pull/697))
- Hide `futures-core` feature ([#695](https://github.com/hashintel/hash/pull/695))

### Features

- Implement [`Termination`](https://doc.rust-lang.org/stable/std/process/trait.Termination.html) for `Report` ([#671](https://github.com/hashintel/hash/pull/671))
- Add support for async `Stream`s ([#718](https://github.com/hashintel/hash/pull/718))
- Add support for `Iterator`s ([#716](https://github.com/hashintel/hash/pull/716))
- Add compatibility for `anyhow` and `eyre` to convert their types into `Report` ([#763](https://github.com/hashintel/hash/pull/763))

### Deprecations

- `IntoReport::report`: Use `IntoReport::into_report` instead ([#698](https://github.com/hashintel/hash/pull/698))

## [0.1.0](https://github.com/hashintel/hash/tree/d14efbc38559fc38d36e03ebdd499b44cb80c668/packages/libs/error-stack) - 2022-06-10

- Initial release
