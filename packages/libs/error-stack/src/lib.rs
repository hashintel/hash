//! # Context-Aware Error Library with Arbitrary Attached User Data
//!
//! This crate is centered around taking a base error and building up a full richer picture of it as
//! it propagates. This is encapsulated in [`Report`], which is made of two main concepts:
//!
//!   1. Contexts
//!   2. Attachments
//!
//! A [`Context`] is a view of the world, it helps describe the current section of code's way of
//! seeing the error -- a high-level description of the error. A [`Report`] always captures the
//! _current context_ in its generic argument.
//!
//! An attachment can be added to the [`Report`]. This could be anything, for example, a contextual
//! message or a `Suggestion`, which helps identify the error.
//!
//! Any context or attachment is used to provide a ([custumizable]) [`Debug`] and [`Display`]
//! output.
//!
//! Please refer to the [in-depth explaination] for further information.
//!
//! [`Debug`]: core::fmt::Debug
//! [`Display`]: core::fmt::Display
//! [in-depth explaination]: #in-depth-explaination
//! [custumizable]: #debug-and-display-hooks
//!
//! ## Quick-Start Guide
//!
//! [`Report`] is supposed to be used as the [`Err`] variant of a `Result`. This crate provides a
//! [`Result<E, C>`] type alias, which uses [`Report<C>`] as [`Err`] variant and can be used as
//! return type:
//!
//! ```rust
//! # fn has_permission(_: usize, _: usize) -> bool { true }
//! # fn get_user() -> Result<usize, AccessError> { Ok(0) }
//! # fn get_resource() -> Result<usize, AccessError> { Ok(0) }
//! # #[derive(Debug)] enum AccessError { PermissionDenied(usize, usize) }
//! # impl core::fmt::Display for AccessError {
//! #    fn fmt(&self, _: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { Ok(()) }
//! # }
//! # impl error_stack::Context for AccessError {}
//! use error_stack::{ensure, Result};
//!
//! fn main() -> Result<(), AccessError> {
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
//! A [`Report`] can be created directly from a [`Context`] using [`Report::new()`] or by any
//! provided macro ([`report!`], [`bail!`], [`ensure!`]). As any [`Error`] can be used as
//! [`Context`], it's possible to create [`Report`] from an existing [`Error`]. For convenience,
//! this crate provides an [`IntoReport`] trait to convert between [`Err`]-variants:
//!
//! ```rust
//! use std::{fs, io, path::Path};
//!
//! use error_stack::{IntoReport, Report};
//!
//! // For clarification, this example is not using `error_stack::Result`.
//! fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
//!     let content = fs::read_to_string(path.as_ref()).report()?;
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # }; Ok(content)
//! }
//! # let report = read_file("test.txt").unwrap_err();
//! # assert_eq!(report.frames().count(), 1);
//! # assert!(report.contains::<io::Error>());
//! ```
//!
//! The generic parameter in [`Report`] is called the _current context_. When creating a new
//! [`Report`], the used [`Context`] will be the current context. To change the context,
//! [`Report::change_context()`] is used. Again, for convenience, using [`ResultExt`] will do that
//! on the [`Err`] variant:
//!
//! ```rust
//! # use std::{fmt, fs, io, path::Path};
//! use error_stack::{Context, IntoReport, Result, ResultExt};
//! # pub type Config = String;
//!
//! #[derive(Debug)]
//! struct ParseConfigError;
//!
//! impl fmt::Display for ParseConfigError {
//!     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
//!         fmt.write_str("Could not parse configuration file")
//!     }
//! }
//!
//! // It's also possible to implemement `Error` instead.
//! impl Context for ParseConfigError {}
//!
//! // For clarification, this example is not using `error_stack::Result`.
//! fn parse_config(path: impl AsRef<Path>) -> Result<Config, ParseConfigError> {
//!     let content = fs::read_to_string(path.as_ref())
//!         .report()
//!         .change_context(ParseConfigError)?;
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # }; Ok(content)
//! }
//! # let report = parse_config("test.txt").unwrap_err();
//! # assert_eq!(report.frames().count(), 2);
//! # assert!(report.contains::<io::Error>());
//! # assert!(report.contains::<ParseConfigError>());
//! ```
//!
//! In addition to changing the current context, it's also possible to attach additional
//! information by using [`Report::attach()`]:
//!
//! ```rust
//! # #![cfg_attr(not(feature = "std"), allow(dead_code, unused_variables, unused_imports))]
//! # use std::{fs, path::Path};
//! # use error_stack::{Context, IntoReport, Report, ResultExt};
//! # pub type Config = String;
//! # #[derive(Debug)] struct ParseConfigError;
//! # impl ParseConfigError { pub fn new() -> Self { Self } }
//! # impl std::fmt::Display for ParseConfigError {
//! #     fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
//! #         fmt.write_str("Could not parse configuration file")
//! #     }
//! # }
//! # impl Context for ParseConfigError {}
//! #[derive(Debug)]
//! struct Suggestion(&'static str);
//!
//! impl std::fmt::Display for Suggestion {
//!     fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
//!         write!(fmt, "{}", self.0)
//!     }
//! }
//!
//! fn parse_config(path: impl AsRef<Path>) -> Result<Config, Report<ParseConfigError>> {
//!     let path = path.as_ref();
//!     # #[cfg(all(not(miri), feature = "std"))]
//!     let content = fs::read_to_string(path)
//!         .report()
//!         .change_context(ParseConfigError::new())
//!         .attach(Suggestion("Use a file you can read next time!"))
//!         .attach_lazy(|| format!("Could not read file {path:?}"))?;
//!     # #[cfg(any(miri, not(feature = "std")))]
//!     # let content = String::new();
//!
//!     Ok(content)
//! }
//! # let report = parse_config("test.txt").unwrap_err();
//! # assert_eq!(report.frames().count(), 4);
//! # assert!(report.contains::<std::io::Error>());
//! # assert!(report.contains::<ParseConfigError>());
//! ```
//!
//! It's possible to request the attachments or the data provided by [`Context`] by calling
//! [`Report::request_ref()`]:
//!
//! ```rust
//! # use error_stack::{Report, Result};
//! # use std::{io::{Error, ErrorKind}, fmt::{Display, Formatter, self}};
//! # struct Suggestion;
//! # impl Display for Suggestion { fn fmt(&self, _: &mut Formatter<'_>) -> fmt::Result { Ok(()) }}
//! # fn parse_config(_: &str) -> Result<(), Error> { Err(Report::new(Error::from(ErrorKind::NotFound)))}
//! fn main() {
//!     if let Err(report) = parse_config("config.json") {
//!         eprintln!("{report:?}");
//!         # #[cfg(nightly)]
//!         for suggestion in report.request_ref::<Suggestion>() {
//!             eprintln!("Suggestion: {suggestion}");
//!         }
//!     }
//! }
//! ```
//!
//! which will produce an error and will output something like
//!
//! ```text
//! Could not parse configuration file
//!              at main.rs:17:10
//!       - Use a file you can read next time!
//!       - Could not read file "config.json"
//!
//! Caused by:
//!    0: No such file or directory (os error 2)
//!              at main.rs:16:10
//!
//! Stack backtrace:
//!    0: error_stack::report::Report<T>::new
//!              at error-stack/src/report.rs:187:18
//!    1: error_stack::context::<impl core::convert::From<C> for error::report::Report<C>>::from
//!              at error-stack/src/context.rs:87:9
//!    2: <core::result::Result<T,E> as error::result::IntoReport>::report
//!              at error-stack/src/result.rs:204:31
//!    3: parse_config
//!              at main.rs:15:19
//!    4: main
//!              at main.rs:25:26
//!    5: ...
//!
//! Suggestion: Use a file you can read next time!
//! ```
//!
//! ## Crate Philosophy
//!
//! This crate adds some development overheads in comparison to other error handling strategies,
//! where you could use string-like types as root errors. The idea is that errors should happen in
//! well-scoped environments like reading a file or parsing a string into an integer. For these
//! errors, a well-defined error type should be used (i.e. `io::Error` or `ParseIntError`) instead
//! of creating an error from a string.
//!
//! By capturing the [`Context`] in the type parameter, the user directly has all type information
//! without optimistically trying to downcast back to an error type (which remains possible). This
//! also implies that **more time than not** the user is _forced_ to add a new context because the
//! type system requires it. This encourages the user to provide a new error type if the scope is
//! changed, usually by crossing module/crate boundaries (for example, a `ConfigParseError` when
//! parsing a configuration file vs. an `IoError` when reading a file from disk). By this, the user
//! is required to be more specific on their error and the [`Report`] can generate more
//! useful error messages.
//!
//! ## Additional Features
//!
//! The above examples will probably cover 90% of the common use case. This crates however have some
//! additional features.
//!
//! ### No-Std compatible
//!
//! The complete crate is written for `no-std` environments, which can be used by passing
//! `--no-default-features` to the `cargo` command. However, when using `std`, a blanket
//! implementation for `Context` for any `Error` is provided. The blanket implementation for
//! [`Error`] also makes the library compatible with almost all other libraries using the [`Error`]
//! trait. Additionally, when on a nightly compiler, [`Report`] will use the [`Backtrace`] from
//! [`Error`] or try to capture one.
//!
//! Using the `backtrace` crate instead of `std::backtrace` is a considered feature to support
//! backtraces on non-nightly channels and can be prioritized depending on demand.
//!
//! ### Provider API
//!
//! This crate uses the [`Provider` API] to provide arbitrary data. This can be done either by
//! [`attach`]ing them to a [`Report`] or by providing it directly when implementing [`Context`].
//! The blanket implementation of [`Context`] for [`Error`] will provide the [`Backtrace`] to be
//! requested later.
//!
//! To request a provided type, [`Report::request_ref`] or [`Report::request_value`] are used. Both
//! return an iterator of all provided values with the specified type. The value, which was provided
//! most recently will be returned first.
//!
//! **Currently, the API has not yet landed in `core::any`, thus it's available at
//! [`error_stack::provider`]. Using it requires a nightly compiler.**
//!
//! [`attach`]: Report::attach
//! [`error_stack::provider`]: crate::provider
//! [`Provider` API]: https://rust-lang.github.io/rfcs/3192-dyno.html
//!
//! ### Conventient Macros
//!
//! Three macros are provided to simplify the generation of a [`Report`].
//!
//! - [`report!`] will only create a [`Report`] from its parameter. It will take into account if the
//!   passed type itself is a [`Report`] or a [`Context`]. For the former case, it will retain the
//!   details stored on a [`Report`], for the latter case it will create a new [`Report`] from the
//!   [`Context`].
//! - [`bail!`] acts like [`report!`] but also immediately returns the [`Report`] as [`Err`]
//!   variant.
//! - [`ensure!`] will check an expression and if it's evaluated to `false`, it will act like
//!   [`bail!`].
//!
//! ### Span Traces
//!
//! The crate comes with built-in support for `tracing`s [`SpanTrace`]. If the `spantrace` feature
//! is enabled and an [`ErrorLayer`] is set, a [`SpanTrace`] is either used when provided by the
//! root [`Context`] or will be captured when creating the [`Report`].
//!
//! [`ErrorLayer`]: tracing_error::ErrorLayer
//!
//! ### Debug and Display Hooks
//!
//! When the `hooks` feature is enabled, it's possible to provide a custom implementation to print a
//! [`Report`]. This is done by passing a hook to [`Report::set_debug_hook()`] and/or
//! [`Report::set_display_hook()`]. If no hook was set, a sensible default implementation will be
//! used. Possible custom hooks would for example be a machine-readable output, e.g. JSON, or a
//! colored output. If an application is attaching other data than strings, these data could also be
//! printed when outputting the [`Report`].
//!
//! ### Additional Adaptors
//!
//! [`ResultExt`] is a convenient wrapper around `Result<_, Report<_>>`. It's offering
//! [`attach`](ResultExt::attach) and [`change_context`](ResultExt::change_context) on the
//! [`Result`] directly, but also a lazy variant that receives a function, which is only called, if
//! an error happens.
//!
//! In addition to [`ResultExt`], this crate also comes with [`FutureExt`] (enabled by the
//! `futures` feature flag), which provides the same functionality for [`Future`]s.
//!
//! [`Future`]: core::future::Future
//!
//! ### Feature Flags
//!
//!  Feature   | Description                                                    | implies | default
//! -----------|----------------------------------------------------------------|---------|--------
//!  `std`     | Enables support for [`Error`] and, on nightly, [`Backtrace`]   |         | enabled
//!  `hooks`   |Enables the usage of [`set_display_hook`] and [`set_debug_hook`]| `std`   | enabled
//! `spantrace`| Enables the capturing of [`SpanTrace`]s                        |         | disabled
//!  `futures` | Provides a [`FutureExt`] adaptor                               |         | disabled
//!
//! [`set_display_hook`]: Report::set_display_hook
//! [`set_debug_hook`]: Report::set_debug_hook
//!
//! [`Error`]: std::error::Error
//! [`Backtrace`]: std::backtrace::Backtrace
//! [`SpanTrace`]: tracing_error::SpanTrace

#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(all(doc, nightly), feature(doc_auto_cfg))]
#![cfg_attr(all(nightly, feature = "std"), feature(backtrace))]
#![warn(
    missing_docs,
    clippy::pedantic,
    clippy::nursery,
    clippy::undocumented_unsafe_blocks
)]
#![allow(clippy::missing_errors_doc)] // This is an error handling library producing Results, not Errors
#![allow(clippy::module_name_repetitions)]
#![cfg_attr(
    not(miri),
    doc(test(attr(deny(warnings, clippy::pedantic, clippy::nursery))))
)]

extern crate alloc;

mod frame;
pub mod iter;
mod macros;
mod report;

mod context;
mod ext;
#[cfg(feature = "hooks")]
mod hook;
#[cfg(nightly)]
pub mod provider;
#[cfg(test)]
pub(crate) mod test_helper;

#[doc(inline)]
pub use self::ext::*;
#[cfg(feature = "hooks")]
pub use self::hook::HookAlreadySet;
pub use self::{
    context::Context,
    frame::{Frame, FrameKind},
    macros::*,
    report::Report,
};
