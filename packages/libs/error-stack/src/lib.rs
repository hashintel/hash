//! Error reporting library based on type-based data access
//!
//! This crate provides [`Report`], a trait object based, context sensitive, error handling type.
//!
//! ## Yet another error crate?
//!
//! Error reporting strategies in Rust are still developing and there are many approaches at the
//! moment with various pros and cons. This crates takes inspiration from an
//! [RFC to the core library ](https://rust-lang.github.io/rfcs/3192-dyno.html) to introduce a
//! reflection-like API - the [`provider`]-API - to add context data to a [`Report`]. Using this, it
//! becomes possible to attach any data to an error. Beyond this, the design also allows Errors to
//! have additional requirements, such as _enforcing_ the provision of contextual information by
//! using [`Report::change_context()`].
//!
//! ### Why not...
//!
//! - [`anyhow`]? While the concept is very similar, in `anyhow` you may only provide strings as
//!   context.
//! - [`eyre`]? This is a fork of `anyhow`. Some features are nice and also the naming of this crate
//!   is inspired by `eyre`, however the problem remains the same.
//! - [`thiserror`]? It "only" provides a macro for implementing [`Error`]. While this can be useful
//!   for library code, handling errors can be quite tedious as the nesting gets very deep very
//!   quickly.
//! - [`snafu`]? Another library for generating errors using a macro. While this library is more
//!   fully featured than `thiserror`, it is still nesting errors.
//! - [`failure`]? [`Report`] works similar to `failure::Error`, but also `failure` is only able to
//!   provide string-like contexts. Also `failure` uses a weird `Fail` trait instead of [`Error`].
//!
//! Generally comparing this and similar crates like [`anyhow`] or [`eyre`] with crates like
//! [`thiserror`], context information are stored internally in the latter case, so accessing
//! context requires to destructuring the error. The former kind of crates relies on composition of
//! causes, which can either be retrieved directly ([`Report::request_ref`] or
//! [`Report::request_value`]) or by downcasting.
//!
//! This crates does not claim to be better than the mentioned crates, it's a different approach to
//! error handling.
//!
//! [`Error`]: std::error::Error
//! [`anyhow`]: https://crates.io/crates/anyhow
//! [`eyre`]: https://crates.io/crates/eyre
//! [`thiserror`]: https://crates.io/crates/thiserror
//! [`snafu`]: https://crates.io/crates/snafu
//! [`failure`]: https://crates.io/crates/failure
//! [`Backtrace`]: std::backtrace::Backtrace
//! [`SpanTrace`]: tracing_error::SpanTrace
//!
//! # Usage
//!
//! [`Report`] is supposed to be used as the [`Err`] variant of a `Result`. This crates provides a
//! [`Result<E, C>`] type alias, which uses [`Report<C>`] as [`Err`] variant and can be used as
//! return type:
//!
//! ```
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
//! An attachment can be provided to lower level errors.
//!
//! ```
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
//! struct Suggestion(&'static str);
//!
//! fn parse_config(path: impl AsRef<Path>) -> Result<Config, Report<ParseConfigError>> {
//!     let path = path.as_ref();
//!     # #[cfg(all(not(miri), feature = "std"))]
//!     let content = fs::read_to_string(path)
//!         .report()
//!         .change_context(ParseConfigError::new())
//!         .attach(Suggestion("Use a file you can read next time!"))
//!         .attach_printable_lazy(|| format!("Could not read file {path:?}"))?;
//!     # #[cfg(any(miri, not(feature = "std")))]
//!     # let content = String::new();
//!
//!     Ok(content)
//! }
//!
//! fn main() {
//!     if let Err(report) = parse_config("config.json") {
//!         eprintln!("{report:?}");
//!         # #[cfg(nightly)]
//!         for suggestion in report.request_ref::<Suggestion>() {
//!             eprintln!("Suggestion: {}", suggestion.0);
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
//!       - Could not read file "config.json"
//!       - 1 additional opaque attachment
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
//! # Feature flags
//!
//!  Feature   | Description                                                    | implies | default
//! -----------|----------------------------------------------------------------|---------|--------
//!  `std`     | Enables support for [`Error`] and, on nightly, [`Backtrace`]   |         | enabled
//!  `hooks`   |Enables the usage of [`set_display_hook`] and [`set_debug_hook`]| `std`   | enabled
//! `spantrace`| Enables the capturing of [`SpanTrace`]s                        |         | disabled
//!  `futures` | Provides a [`FutureExt`] adaptor                               |         | disabled
//!
//!
//! Using the `backtrace` crate instead of `std::backtrace` is a considered feature to support
//! backtraces on non-nightly channels and can be prioritized depending on demand.
//!
//! If using the nightly compiler the crate may be used together with the [`Provider` API].
//!
//! [`set_display_hook`]: Report::set_display_hook
//! [`set_debug_hook`]: Report::set_debug_hook
//! [`Provider` API]: https://rust-lang.github.io/rfcs/3192-dyno.html

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
    frame::{AttachmentKind, Frame, FrameKind},
    macros::*,
    report::Report,
};
