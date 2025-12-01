//! A context-aware error library with arbitrary attached user data.
//!
//! [![crates.io](https://img.shields.io/crates/v/error-stack)][crates.io]
//! [![libs.rs](https://img.shields.io/badge/libs.rs-error--stack-orange)][libs.rs]
//! [![rust-version](https://img.shields.io/static/v1?label=Rust&message=1.83.0/nightly-2025-12-01&color=blue)][rust-version]
//!
//! [crates.io]: https://crates.io/crates/error-stack
//! [libs.rs]: https://lib.rs/crates/error-stack
//! [rust-version]: https://www.rust-lang.org
//!
//! # Overview
//!
//! `error-stack` is an error-handling library centered around the idea of building a [`Report`] of
//! the error as it propagates. A [`Report`] is made up of two concepts:
//!
//!   1. Contexts
//!   2. Attachments
//!
//! A context is a view of the world, it helps describe how the current section of code interprets
//! the error. This is used to capture how various scopes require differing levels of detail and
//! understanding of the error as it propagates. A [`Report`] always captures the _current context_
//! in its generic argument.
//!
//! As the [`Report`] is built, various pieces of supporting information can be _attached_. These
//! can be anything that can be shared between threads whether it be a supporting message or a
//! custom-defined `Suggestion` struct.
//!
//! # Quick-Start Guide
//!
//! ## In a new project
//!
//! ```rust
//! # #![allow(dead_code)]
//! use error_stack::{Report, ResultExt};
//! // using `thiserror` is not neccessary, but convenient
//! use thiserror::Error;
//!
//! // Errors can enumerate variants users care about
//! // but notably don't need to chain source/inner error manually.
//! #[derive(Error, Debug)]
//! enum AppError {
//!     #[error("serious app error: {consequences}")]
//!     Serious { consequences: &'static str },
//!     #[error("trivial app error")]
//!     Trivial,
//! }
//!
//! type AppResult<T> = Result<T, Report<AppError>>;
//!
//! // Errors can also be a plain `struct`, somewhat like in `anyhow`.
//! #[derive(Error, Debug)]
//! #[error("logic error")]
//! struct LogicError;
//!
//! type LogicResult<T> = Result<T, Report<LogicError>>;
//!
//! fn do_logic() -> LogicResult<()> {
//!     Ok(())
//! }
//!
//! fn main() -> AppResult<()> {
//!     // `error-stack` requires developer to properly handle
//!     // changing error contexts
//!     do_logic().change_context(AppError::Serious {
//!         consequences: "math no longer works",
//!     })?;
//!
//!     Ok(())
//! }
//! ```
//!
//! ## Where to use a Report
//!
//! [`Report`] has been designed to be used as the [`Err`] variant of a [`Result`]:
//!
//! ```rust
//! # fn has_permission(_: (), _: ()) -> bool { true }
//! # fn get_user() -> Result<(), AccessError> { Ok(()) }
//! # fn get_resource() -> Result<(), AccessError> { Ok(()) }
//! # #[derive(Debug)] enum AccessError { PermissionDenied((), ()) }
//! # impl core::fmt::Display for AccessError {
//! #    fn fmt(&self, _: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { Ok(()) }
//! # }
//! # impl core::error::Error for AccessError {}
//! use error_stack::{ensure, Report};
//!
//! fn main() -> Result<(), Report<AccessError>> {
//!     let user = get_user()?;
//!     let resource = get_resource()?;
//!
//!     ensure!(
//!         has_permission(user, resource),
//!         AccessError::PermissionDenied(user, resource)
//!     );
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # }; Ok(())
//! }
//! ```
//!
//! ### Initializing a Report
//!
//! A [`Report`] can be created directly from anything that implements [`Error`] by using
//! [`Report::new()`], [`IntoReport::into_report()`], or through any of the provided macros
//! ([`bail!`], [`ensure!`]).
//!
//! ```rust
//! use std::{fs, io, path::Path};
//!
//! use error_stack::Report;
//!
//! // Note: For demonstration purposes this example does not use `error_stack::Result`.
//! // As can be seen, it's possible to implicitly convert `io::Error` to `Report<io::Error>`
//! fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
//!     let content = fs::read_to_string(path)?;
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # }; Ok(content)
//! }
//! # let report = read_file("test.txt").unwrap_err();
//! # assert!(report.contains::<io::Error>());
//! ```
//!
//! ## Using and Expanding the Report
//!
//! As mentioned, the library centers around the idea of building a [`Report`] as it propagates.
//!
//! ### Changing Context
//!
//! The generic parameter in [`Report`] is called the _current context_. When creating a new
//! [`Report`], the [`Error`] that's provided will be set as the current context. The current
//! context should encapsulate how the current code interprets the error. As the error propagates,
//! it will cross boundaries where new information is available, and the previous level of detail is
//! no longer applicable. These boundaries will often occur when crossing between major modules, or
//! when execution crosses between crates. At this point the [`Report`] should start to operate in a
//! new context. To change the context, [`Report::change_context()`] is used:
//!
//! (Again, for convenience, using [`ResultExt`] will do that on the [`Err`] variant)
//!
//! ```rust
//! # use std::{fmt, fs, io, path::Path};
//! use core::error::Error;
//!
//! use error_stack::{Report, ResultExt};
//! # pub type Config = String;
//!
//! #[derive(Debug)]
//! struct ParseConfigError;
//!
//! impl fmt::Display for ParseConfigError {
//!     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
//!         fmt.write_str("could not parse configuration file")
//!     }
//! }
//!
//! // It's also possible to implement `Error` instead.
//! impl Error for ParseConfigError {}
//!
//! // For clarification, this example is not using `error_stack::Result`.
//! fn parse_config(path: impl AsRef<Path>) -> Result<Config, Report<ParseConfigError>> {
//!     let content = fs::read_to_string(path.as_ref())
//!         .change_context(ParseConfigError)?;
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # }; Ok(content)
//! }
//! # let report = parse_config("test.txt").unwrap_err();
//! # assert!(report.contains::<io::Error>());
//! # assert!(report.contains::<ParseConfigError>());
//! ```
//!
//! ### Building up the Report - Attachments
//!
//! Module/crate boundaries are not the only places where information can be embedded within the
//! [`Report`] however. Additional information can be attached within the current context, whether
//! this be a string, or any thread-safe object. These attachments are added by using
//! [`Report::attach_opaque()`] and [`Report::attach()`]:
//!
//! ```rust
//! # // we only test the snapshot on nightly, therefore report is unused (so is render)
//! # #![cfg_attr(not(nightly), allow(dead_code, unused_variables, unused_imports))]
//! # use std::{fs, path::Path};
//! # use error_stack::{Report, ResultExt};
//! # pub type Config = String;
//! # #[derive(Debug)] struct ParseConfigError;
//! # impl ParseConfigError { pub fn new() -> Self { Self } }
//! # impl std::fmt::Display for ParseConfigError {
//! #     fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
//! #         fmt.write_str("could not parse configuration file")
//! #     }
//! # }
//! # impl core::error::Error for ParseConfigError {}
//! # #[derive(Debug, PartialEq)]
//! struct Suggestion(&'static str);
//!
//! fn parse_config(path: impl AsRef<Path>) -> Result<Config, Report<ParseConfigError>> {
//!     let path = path.as_ref();
//!
//!     let content = fs::read_to_string(path)
//!         .change_context(ParseConfigError::new())
//!         .attach_opaque(Suggestion("use a file you can read next time!"))
//!         .attach_with(|| format!("could not read file {path:?}"))?;
//!
//!     Ok(content)
//! }
//! # let report = parse_config("test.txt").unwrap_err();
//! # assert!(report.contains::<std::io::Error>());
//! # assert_eq!(report.downcast_ref::<Suggestion>().unwrap(), &Suggestion("use a file you can read next time!"));
//! # #[cfg(nightly)]
//! # assert_eq!(report.request_ref::<Suggestion>().next().unwrap(), &Suggestion("use a file you can read next time!"));
//! # #[cfg(nightly)]
//! # assert_eq!(report.request_ref::<String>().next().unwrap(), "could not read file \"test.txt\"");
//! # assert!(report.contains::<ParseConfigError>());
//! #
//! # Report::set_color_mode(error_stack::fmt::ColorMode::Emphasis);
//! # fn render(value: String) -> String {
//! #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
//! #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
//! #
//! #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
//! #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
//! #
//! #     ansi_to_html::convert(value.as_ref()).unwrap()
//! # }
//! #
//! # #[cfg(nightly)]
//! # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/lib__suggestion.snap")].assert_eq(&render(format!("{report:?}")));
//! ```
//!
//! As seen above, there are ways on attaching more information to the [`Report`]: [`attach`] and
//! [`attach_opaque`]. These two functions behave similar, but the former has a more restrictive
//! bound on the attachment: [`Display`] and [`Debug`]. Depending on the function used, printing the
//! [`Report`] will also use the [`Display`] and [`Debug`] traits to describe the attachment.
//!
//! This outputs something like:
//!
//! <pre>
#![cfg_attr(doc, doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/lib__suggestion.snap")))]
//! </pre>
//!
//! The `Suggestion` which was added via [`attach`] is not shown directly and only increases the
//! counter of opaque attachments for the containing [`Error`]. The message which was passed to
//! [`attach_opaque`], however, is displayed in full. To be able to show attachments that have
//! been added via [`attach`], one must make use of [hooks](#debug-and-display-hooks) instead.
//!
//! [`attach_opaque`]: Report::attach_opaque
//! [`Display`]: core::fmt::Display
//! [`Debug`]: core::fmt::Debug
//!
//! ### Multiple Errors
//!
//! [`Report`] provides native support for combining and propagating multiple errors. This feature
//! is particularly useful in scenarios such as parallel processing, where multiple errors might
//! occur independently. In these cases, you can utilize the [`Extend`] trait implementation and the
//! [`push()`] method to aggregate and propagate all encountered errors, rather than just a single
//! one.
//!
//! error-stack is designed to be explicit about the presence of single or multiple current
//! contexts. This distinction is reflected in the generic type parameter:
//!
//! - [`Report<C>`] indicates that a single current context is present.
//! - [`Report<[C]>`](Report) signifies that at least one current context is present, with the
//!   possibility of multiple contexts.
//!
//! You can seamlessly convert between these representations using [`Report::expand`] to transform
//! a single-context report into a multi-context one. Using [`Report::change_context`] will
//! transform a [`Report<[C]>`](Report) to a [`Report<C2>`], where `C2` is a new context type.
//!
//! [`push()`]: Report::push
//!
//! ```rust
//! # use std::{fs, path::Path};
//! # use error_stack::Report;
//! # pub type Config = String;
//!
//! fn parse_configs(paths: &[impl AsRef<Path>]) -> Result<Vec<Config>, Report<[std::io::Error]>> {
//!     let mut configs = Vec::new();
//!     let mut error: Option<Report<[std::io::Error]>> = None;
//!
//!     for path in paths {
//!         let path = path.as_ref();
//!
//!         match fs::read_to_string(path) {
//!             Ok(ok) => {
//!                 configs.push(ok);
//!             }
//!             Err(err) => {
//!                 if let Some(error) = error.as_mut() {
//!                     error.push(Report::from(err));
//!                 } else {
//!                     error = Some(Report::from(err).expand());
//!                 }
//!             }
//!         }
//!     }
//!
//!     if let Some(error) = error {
//!         return Err(error);
//!     }
//!
//!     Ok(configs)
//! }
//!
//! # let report = parse_configs(&["test.txt", "test2.txt", "test3.txt"]).unwrap_err();
//! # assert!(report.contains::<std::io::Error>());
//! ```
//!
//! # In-Depth Explanation
//!
//! ## Crate Philosophy
//!
//! This crate adds some development overhead in comparison to other error handling strategies,
//! especially around creating custom root-errors (specifically `error-stack` does not allow using
//! string-like types). The intention is that this reduces overhead at other parts of the process,
//! whether that be implementing error-handling, debugging, or observability. The idea that
//! underpins this is that errors should happen in well-scoped environments like reading a file or
//! parsing a string into an integer. For these errors, a well-defined error type should be used
//! (i.e. `io::Error` or `ParseIntError`) instead of creating an error from a string. Requiring a
//! well-defined type forces users to be conscious about how they classify and group their
//! **custom** error types, which improves their usability in error-_handling_.
//!
//! ### Improving `Result::Err` Types
//!
//! By capturing the current [`Error`] in the type parameter, return types in function signatures
//! continue to explicitly capture the perspective of the current code. This means that **more often
//! than not** the user is _forced_ to re-describe the error when entering a substantially different
//! part of the code because the constraints of typed return types will require it. This will happen
//! most often when crossing module/crate boundaries.
//!
//! An example of this is a `ConfigParseError` when produced when parsing a configuration file at
//! a high-level in the code vs. the lower-level `io::Error` that occurs when reading the file from
//! disk. The `io::Error` may no longer be valuable at the level of the code that's handling parsing
//! a config, and re-framing the error in a new type allows the user to incorporate contextual
//! information that's only available higher-up in the stack.
//!
//! ### Compatibility with other Libraries
//!
//! `error-stack` uses the standard [`Error`] type which makes it compatible with almost all other
//! libraries that use that trait.
//!
//! This has the added benefit that migrating from other error libraries can often be incremental,
//! as a lot of popular error library types will work within the [`Report`] struct.
//!
//! In addition, `error-stack` supports converting errors generated from the [`anyhow`] or [`eyre`]
//! crate via [`IntoReportCompat`].
//!
//! ### Doing more
//!
//! Beyond making new [`Error`] types, the library supports the attachment of arbitrary
//! thread-safe data. These attachments (and data that is [`provide`]d by the [`Error`] can be
//! requested through [`Report::request_ref()`]. This gives a novel way to expand standard
//! error-handling approaches, without decreasing the ergonomics of creating the actual error
//! variants:
//!
//! ```rust
//! # #![cfg_attr(not(nightly), allow(unused_variables, dead_code))]
//! # struct Suggestion(&'static str);
//! # fn parse_config(_: &str) -> Result<(), error_stack::Report<std::io::Error>> { Ok(()) }
//! fn main() {
//!     if let Err(report) = parse_config("config.json") {
//!         # #[cfg(nightly)]
//!         for suggestion in report.request_ref::<Suggestion>() {
//!             eprintln!("suggestion: {}", suggestion.0);
//!         }
//!     }
//! }
//! ```
//!
//! [`provide`]: core::error::Error::provide
//!
//! ## Additional Features
//!
//! The above examples will probably cover 90% of the common use case. This crate does have
//! additional features for more specific scenarios:
//!
//! ### Automatic Backtraces
//!
//! [`Report`] will try to capture a [`Backtrace`] if `RUST_BACKTRACE` or `RUST_BACKTRACE_LIB` is
//! set and the `backtrace` feature is enabled (by default this is the case). If on a nightly
//! toolchain, it will use the [`Backtrace`] if provided by the base [`Error`], and will try to
//! capture one otherwise.
//!
//! Unlike some other approaches, this does not require the user modifying their custom error types
//! to be aware of backtraces, and doesn't require manual implementations to forward calls down any
//! wrapped errors.
//!
//! ### No-Std compatible
//!
//! The complete crate is written for `no-std` environments, which can be used by setting
//! `default-features = false` in _Cargo.toml_.
//!
//! ### Provider API
//!
//! This crate uses the [`Provider` API] to provide arbitrary data. This can be done either by
//! [`attach`]ing them to a [`Report`] or by providing it directly when implementing [`Error`].
//!
//! To request a provided type, [`Report::request_ref`] or [`Report::request_value`] are used. Both
//! return an iterator of all provided values with the specified type. The value, which was provided
//! most recently will be returned first.
//!
//! [`attach`]: Report::attach
//! [`Provider` API]: https://rust-lang.github.io/rfcs/3192-dyno.html
//!
//! ### Macros for Convenience
//!
//! Two macros are provided to simplify the generation of a [`Report`].
//!
//! - [`bail!`] acts like calling [`IntoReport::into_report()`] but also immediately returns the
//!   [`Report`] as [`Err`] variant.
//! - [`ensure!`] will check an expression and if it's evaluated to `false`, it will act like
//!   [`bail!`].
//!
//! ### Span Traces
//!
//! The crate comes with built-in support for `tracing`s [`SpanTrace`]. If the `spantrace` feature
//! is enabled and an [`ErrorLayer`] is set, a [`SpanTrace`] is either used when provided by the
//! root [`Error`] or will be captured when creating the [`Report`].
//!
//! [`ErrorLayer`]: tracing_error::ErrorLayer
//!
//! ### Debug Hooks
//!
//! One can provide hooks for types added as attachments when the `std` feature is enabled. These
//! hooks are then used while formatting [`Report`]. This functionality is also used internally by
//! `error-stack` to render [`Backtrace`], and [`SpanTrace`], which means overwriting and
//! customizing them is as easy as providing another hook.
//!
//! You can add new hooks with [`Report::install_debug_hook`]. Refer to the module-level
//! documentation of [`fmt`] for further information.
//!
//! ### Additional Adaptors
//!
//! [`ResultExt`] is a convenient wrapper around `Result<_, impl Error>` and `Result<_, Report<impl
//! Error>`. It offers [`attach`](ResultExt::attach) and
//! [`change_context`](ResultExt::change_context) on the [`Result`] directly, but also a lazy
//! variant that receives a function which is only called if an error happens.
//!
//! In addition to [`ResultExt`], this crate also comes with [`FutureExt`], which provides the same
//! functionality for [`Future`]s.
//!
//! [`Future`]: core::future::Future
//!
//! ### Colored output and charset selection
//!
//! You can override the color support by using the [`Report::set_color_mode`]. To override the
//! charset used, you can use [`Report::set_charset`]. The default color mode is emphasis.
//! The default charset is `UTF-8`.
//!
//! To automatically detect support if your target output supports unicode and colors you can check
//! out the `detect.rs` example.
//!
//! ### Feature Flags
//!
//!  Feature       | Description                                                         | default
//! ---------------|---------------------------------------------------------------------|----------
//! `std`          | Enables support for [`Error`]                                       | enabled
//! `backtrace`    | Enables automatic capturing of [`Backtrace`]s (requires Rust 1.65+) | enabled
//! `spantrace`    | Enables automatic capturing of [`SpanTrace`]s                       | disabled
//! `hooks`        | Enables hooks on `no-std` platforms using spin locks                | disabled
//! `serde`        | Enables serialization support for [`Report`]                        | disabled
//! `anyhow`       | Provides `into_report` to convert [`anyhow::Error`] to [`Report`]   | disabled
//! `eyre`         | Provides `into_report` to convert [`eyre::Report`] to [`Report`]    | disabled
//! `futures`      | Enables support for [`Stream`], requires `unstable`                 | disabled
//! `unstable`     | Enables unstable features, these features are not covered by semver | disabled
//!
//!
//! [`Error`]: core::error::Error
//! [`Error::provide`]: core::error::Error::provide
//! [`Backtrace`]: std::backtrace::Backtrace
//! [`Display`]: core::fmt::Display
//! [`Debug`]: core::fmt::Debug
//! [`SpanTrace`]: tracing_error::SpanTrace
//! [`Stream`]: futures_core::Stream
#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(nightly, feature(error_generic_member_access))]
#![cfg_attr(all(nightly, feature = "unstable"), feature(try_trait_v2))]
#![cfg_attr(all(doc, nightly), feature(doc_cfg))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace_frames))]
#![cfg_attr(
    not(miri),
    doc(test(attr(
        deny(warnings, clippy::pedantic, clippy::nursery),
        allow(exported_private_dependencies)
    )))
)]
#![allow(unsafe_code)]
// This is an error handling library producing Results, not Errors
#![allow(clippy::missing_errors_doc)]

extern crate alloc;

pub mod future;
pub mod iter;

mod compat;
mod frame;
mod macros;
mod report;
mod result;

mod context;
mod error;
#[cfg(feature = "unstable")]
pub mod ext;
pub mod fmt;
#[cfg(any(feature = "std", feature = "hooks"))]
mod hook;
#[cfg(feature = "serde")]
mod serde;
#[cfg(feature = "unstable")]
mod sink;

#[cfg(all(feature = "unstable", feature = "futures"))]
pub use self::ext::stream::TryReportStreamExt;
#[cfg(feature = "unstable")]
pub use self::ext::{iter::TryReportIteratorExt, tuple::TryReportTupleExt};
#[cfg(feature = "unstable")]
pub use self::sink::ReportSink;
pub use self::{
    compat::IntoReportCompat,
    context::{Attachment, OpaqueAttachment},
    frame::{AttachmentKind, Frame, FrameKind},
    report::{IntoReport, Report},
};
#[doc(inline)]
pub use self::{future::FutureExt, result::ResultExt};

#[cfg(test)]
#[expect(dead_code)]
mod tests {

    use core::mem;

    use crate::Report;

    const fn assert_send<T: Send>() {}

    const fn assert_sync<T: Sync>() {}

    const fn assert_static<T: 'static>() {}

    const fn report() {
        assert_send::<Report<()>>();
        assert_sync::<Report<()>>();
        assert_static::<Report<()>>();
    }

    #[test]
    fn size() {
        assert_eq!(mem::size_of::<Report<()>>(), mem::size_of::<*const ()>());
    }
}
