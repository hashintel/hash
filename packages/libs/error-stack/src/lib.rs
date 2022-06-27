//! A context-aware error library with arbitrary attached user data.
//!
//! # Overview
//!
//! `error-stack` is an error-handling library centered around the idea of building a [`Report`] of
//! the error as it propagates. A [`Report`] is made up of two concepts:
//!
//!   1. Contexts
//!   2. Attachments
//!
//! A [`Context`] is a view of the world, it helps describe how the current section of code
//! interprets the error. This is used to capture how various scopes require differing levels of
//! detail and understanding of the error as it propagates. A [`Report`] always captures the
//! _current context_ in its generic argument.
//!
//! As the [`Report`] is built, various pieces of supporting information can be _attached_. These
//! can be anything that can be shared between threads whether it be a supporting message or a
//! custom-defined `Suggestion` struct.
//!
//! # Quick-Start Guide
//!
//! ## Where to use a Report
//!
//! [`Report`] has been designed to be used as the [`Err`] variant of a `Result`. This crate
//! provides a [`Result<E, C>`] type alias for convenience which uses [`Report<C>`] as the [`Err`]
//! variant and can be used as a return type:
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
//! ### Initializing a Report
//!
//! A [`Report`] can be created directly from anything that implements [`Context`] by using
//! [`Report::new()`] or through any of the provided macros ([`report!`], [`bail!`], [`ensure!`]).
//! Any [`Error`] can be used as a [`Context`], so it's possible to create [`Report`] from an
//! existing [`Error`]:
//!
//! (For convenience, this crate provides an [`IntoReport`] trait to convert between
//! [`Err`]-variants)
//!
//! ```rust
//! # #[cfg(all(not(miri), feature = "std"))] {
//! use std::{fs, io, path::Path};
//!
//! use error_stack::{IntoReport, Report};
//!
//! // Note: For demonstration purposes this example does not use `error_stack::Result`.
//! // As can be seen, it's possible to call `IntoReport::report` to easily create a `Report` from
//! // an `io::Error`
//! fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
//!     let content = fs::read_to_string(path).into_report()?;
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # }; Ok(content)
//! }
//! # let report = read_file("test.txt").unwrap_err();
//! # assert_eq!(report.frames().count(), 1);
//! # assert!(report.contains::<io::Error>());
//! # }
//! ```
//!
//! ## Using and Expanding the Report
//!
//! As mentioned, the library centers around the idea of building a [`Report`] as it propagates.
//!
//! ### Changing Context
//!
//! The generic parameter in [`Report`] is called the _current context_. When creating a new
//! [`Report`], the [`Context`] that's provided will be set as the current context. The current
//! context should encapsulate how the current code interprets the error. As the error propagates,
//! it will cross boundaries where new information is available, and the previous level of detail
//! is no longer applicable. These boundaries will often occur when crossing between major modules,
//! or when execution crosses between crates. At this point the [`Report`] should start to operate
//! in a new context. To change the context, [`Report::change_context()`] is used:
//!
//! (Again, for convenience, using [`ResultExt`] will do that on the [`Err`] variant)
//!
//! ```rust
//! # #![cfg_attr(not(feature = "std"), allow(dead_code, unused_variables, unused_imports))]
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
//! // It's also possible to implement `Error` instead.
//! impl Context for ParseConfigError {}
//!
//! # #[cfg(all(not(miri), feature = "std"))] {
//! // For clarification, this example is not using `error_stack::Result`.
//! fn parse_config(path: impl AsRef<Path>) -> Result<Config, ParseConfigError> {
//!     let content = fs::read_to_string(path.as_ref())
//!         .into_report()
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
//! # }
//! ```
//!
//! ### Building up the Report - Attachments
//!
//! Module/crate boundaries are not the only places where information can be embedded within the
//! [`Report`] however. Additional information can be attached within the current context, whether
//! this be a string, or any thread-safe object. These attachments are added by using
//! [`Report::attach()`] and [`Report::attach_printable()`]:
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
//! # #[derive(Debug, PartialEq)]
//! struct Suggestion(&'static str);
//!
//! # #[cfg(all(not(miri), feature = "std"))] {
//! fn parse_config(path: impl AsRef<Path>) -> Result<Config, Report<ParseConfigError>> {
//!     let path = path.as_ref();
//!
//!     let content = fs::read_to_string(path)
//!         .into_report()
//!         .change_context(ParseConfigError::new())
//!         .attach(Suggestion("Use a file you can read next time!"))
//!         .attach_printable_lazy(|| format!("Could not read file {path:?}"))?;
//!
//!     Ok(content)
//! }
//! # let report = parse_config("test.txt").unwrap_err();
//! # assert_eq!(report.frames().count(), 4);
//! # assert!(report.contains::<std::io::Error>());
//! # assert_eq!(report.downcast_ref::<Suggestion>().unwrap(), &Suggestion("Use a file you can read next time!"));
//! # #[cfg(nightly)]
//! # assert_eq!(report.request_ref::<Suggestion>().next().unwrap(), &Suggestion("Use a file you can read next time!"));
//! # #[cfg(nightly)]
//! # assert_eq!(report.request_ref::<String>().next().unwrap(), "Could not read file \"test.txt\"");
//! # assert!(report.contains::<ParseConfigError>());
//! # }
//! ```
//!
//! As seen above, there are ways on attaching more information to the [`Report`]: [`attach`] and
//! [`attach_printable`]. These two functions behave similar, but the latter has a more restrictive
//! bound on the attachment: [`Display`] and [`Debug`]. Depending on the function used, printing the
//! [`Report`] will also use the [`Display`] and [`Debug`] traits to describe the attachment:
//!
//! ```text
//! Could not parse configuration file
//!              at main.rs:9:10
//!       - Could not read file "config.json"
//!       - 1 additional opaque attachment
//!
//! Caused by:
//!    0: No such file or directory (os error 2)
//!              at main.rs:7:10
//! ```
//!
//! The `Suggestion` passed to [`attach`] shown as an opaque attachment. The message passed to
//! [`attach_printable`] however is printed next to the [`Context`] where it was attached to.
//!
//! [`attach_printable`]: Report::attach_printable
//! [`Display`]: core::fmt::Display
//! [`Debug`]: core::fmt::Debug
//!
//! # In-Depth Explanation
//!
//! ## Crate Philosophy
//!
//! This crate adds some development overhead in comparison to other error handling strategies,
//! especially around creating custom root-errors (specifically `error-stack` does not allow using
//! string-like types). The intention is that this reduces overhead at other parts of the process,
//! whether that be implementing error-handling, debugging, or observability. The idea that
//! underpins this is that errors should happen in well-scoped environments like reading a file
//! or parsing a string into an integer. For these errors, a well-defined error type should be used
//! (i.e. `io::Error` or `ParseIntError`) instead of creating an error from a string. Requiring a
//! well-defined type forces users to be conscious about how they classify and group their
//! **custom** error types, which improves their usability in error-_handling_.
//!
//! ### Improving Result::Err Types
//!
//! By capturing the current [`Context`] in the type parameter, return types in function signatures
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
//! In `std` environments a blanket implementation for `Context` for any `Error` is provided. This
//! blanket implementation for [`Error`] means `error-stack` is compatible with almost all other
//! libraries that use the [`Error`] trait.
//!
//! This has the added benefit that migrating from other error libraries can often be incremental,
//! as a lot of popular error library types will work within the [`Report`] struct.
//!
//! ### Doing more
//!
//! Beyond making new [`Context`] types, the library supports the attachment of arbitrary
//! thread-safe data. These attachments (and data that is [`provide`]d by the [`Context`] can be
//! requested through [`Report::request_ref()`]. This gives a novel way to expand standard
//! error-handling approaches, without decreasing the ergonomics of creating the actual error
//! variants:
//!
//! ```rust
//! # #![cfg_attr(not(nightly), allow(unused_variables, dead_code))]
//! # use error_stack::Result;
//! # struct Suggestion(&'static str);
//! # fn parse_config(_: &str) -> Result<(), std::io::Error> { Ok(()) }
//! fn main() {
//!     if let Err(report) = parse_config("config.json") {
//!         # #[cfg(nightly)]
//!         for suggestion in report.request_ref::<Suggestion>() {
//!             eprintln!("Suggestion: {}", suggestion.0);
//!         }
//!     }
//! }
//! ```
//!
//! [`provide`]: Context::provide
//!
//! ## Additional Features
//!
//! The above examples will probably cover 90% of the common use case. This crate does have
//! additional features for more specific scenarios:
//!
//! ### Automatic Backtraces
//!
//! When on a nightly compiler, [`Report`] will use the [`Backtrace`] from the base [`Context`] if
//! it exists, or it will try to capture one. Unlike some other approaches, this does not require
//! the user modifying their custom error types to be aware of backtraces, and doesn't require
//! manual implementations to forward calls down any wrapped errors that are often needed with other
//! approaches.
//!
//! Using the `backtrace` crate instead of `std::backtrace` is a considered feature to support
//! backtraces on non-nightly channels and can be prioritized depending on demand.
//!
//! ### No-Std compatible
//!
//! The complete crate is written for `no-std` environments, which can be used by passing
//! `--no-default-features` to the `cargo` command.
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
//! [`attach`]: Report::attach
//! [`Provider` API]: https://rust-lang.github.io/rfcs/3192-dyno.html
//!
//! ### Macros for Convenience
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
//! [`Report::set_display_hook()`]. If no hook was set a sensible default implementation will be
//! used. Possible custom hooks would for example be a machine-readable output, e.g. JSON, or a
//! colored output. If attachments include things that don't implement [`Display`] or [`Debug`] then
//! a custom hook could be used to offer some other output about these things when printing a
//! [`Report`].
//!
//! ### Additional Adaptors
//!
//! [`ResultExt`] is a convenient wrapper around `Result<_, Report<_>>`. It offers
//! [`attach`](ResultExt::attach) and [`change_context`](ResultExt::change_context) on the
//! [`Result`] directly, but also a lazy variant that receives a function which is only called if
//! an error happens.
//!
//! In addition to [`ResultExt`], this crate also comes with [`FutureExt`] (enabled by the
//! `futures` feature flag), which provides the same functionality for [`Future`]s.
//!
//! Adding adaptors for [`Iterator`] and [`Stream`]  is a considered feature and can be prioritized
//! depending on demand.
//!
//! [`Future`]: core::future::Future
//! [`Stream`]: futures_core::stream::Stream
//!
//! ### Feature Flags
//!
//!  Feature   | Description                                                    | implies | default
//! -----------|----------------------------------------------------------------|---------|--------
//!  `std`     | Enables support for [`Error`] and, on nightly, [`Backtrace`]   |         | enabled
//!  `hooks`   |Enables the usage of [`set_display_hook`] and [`set_debug_hook`]| `std`   | disabled
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
#![cfg_attr(nightly, feature(provide_any))]
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
#[cfg(test)]
pub(crate) mod test_helper;

#[doc(inline)]
pub use self::ext::*;
#[cfg(feature = "hooks")]
pub use self::hook::HookAlreadySet;
pub use self::{
    context::Context,
    frame::{AttachmentKind, Frame, FrameKind},
    macros::*,
    report::Report,
};
