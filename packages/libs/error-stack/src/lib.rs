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
//! use std::{collections::HashMap, fmt};
//!
//! use error_stack::{Context, ensure, report, Result, ResultExt};
//!
//! #[derive(Debug)]
//! enum LookupError {
//!     InvalidKey,
//!     NotFound,
//! }
//!
//! impl fmt::Display for LookupError {
//!     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
//!         match self {
//!             Self::InvalidKey => fmt.write_str("Key must be 8 characters long"),
//!             Self::NotFound => fmt.write_str("key does not exist"),
//!         }
//!     }
//! }
//!
//! impl Context for LookupError {}
//!
//! fn lookup_key(map: &HashMap<&str, u64>, key: &str) -> Result<u64, LookupError> {
//! // `ensure!` returns `Err(Report)` if the condition fails
//!     ensure!(key.len() == 8, LookupError::InvalidKey);
//!
//!     // A `Report` can also be created directly
//!     map.get(key)
//!         .cloned()
//!         .ok_or_else(|| report!(LookupError::NotFound))
//! }
//!
//! fn parse_config(config: &HashMap<&str, u64>) -> Result<u64, LookupError> {
//!     let key = "abcd-efgh";
//!
//!     // `ResultExt` provides different methods for adding additional information to the `Report`
//!     let value =
//!         lookup_key(config, key).attach_lazy(|| format!("Could not lookup key {key:?}"))?;
//!
//!     Ok(value)
//! }
//!
//! fn main() -> Result<(), LookupError> {
//!     # fn fake_main() -> Result<(), LookupError> { // We want to assert on the result
//!     let config = HashMap::default();
//!     # #[allow(unused_variables)]
//!     let config_value = parse_config(&config).attach("Unable to parse config")?;
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # }; Ok(())
//! }
//! # assert_eq!(fake_main().unwrap_err().frames().count(), 3);
//! # Ok(()) }
//! ```
//!
//! which will produce an error and prints it
//!
//! ```text
//! Error: Unable to parse config
//!              at main.rs:44:47
//!
//! Caused by:
//!    0: Could not lookup key "abcd-efgh"
//!              at main.rs:37:33
//!    1: Key must be 8 characters long
//!              at main.rs:24:5
//!
//! Stack backtrace:
//!    0: <error::Report>::new::<error::Report>
//!              at error/src/report.rs:37:18
//!    1: main::lookup_key
//!              at main.rs:6:5
//!    2: main::parse_config
//!              at main.rs:16:9
//!    3: main::main
//!              at main.rs:23:24
//!    4: ...
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
mod result;

mod context;
#[cfg(feature = "futures")]
pub mod future;
#[cfg(feature = "hooks")]
mod hook;
#[cfg(nightly)]
pub mod provider;

#[cfg(feature = "futures")]
#[doc(inline)]
pub use self::future::FutureExt;
#[cfg(feature = "hooks")]
pub use self::hook::HookAlreadySet;
pub use self::{
    context::Context,
    frame::{Frame, FrameKind},
    macros::*,
    report::Report,
    result::{IntoReport, Result, ResultExt},
};

#[cfg(test)]
pub(crate) mod test_helper {
    pub use alloc::{
        string::{String, ToString},
        vec::Vec,
    };
    use core::{fmt, fmt::Formatter};

    use crate::{Context, Frame, FrameKind, Report};

    #[derive(Debug, PartialEq)]
    pub struct ContextA;

    impl fmt::Display for ContextA {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
            fmt.write_str("Context A")
        }
    }

    impl Context for ContextA {}

    #[derive(Debug, PartialEq)]
    pub struct ContextB;

    impl fmt::Display for ContextB {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
            fmt.write_str("Context B")
        }
    }

    #[cfg(feature = "std")]
    impl std::error::Error for ContextB {}

    pub fn capture_error<E>(closure: impl FnOnce() -> Result<(), Report<E>>) -> Report<E> {
        match closure() {
            Ok(_) => panic!("Expected an error"),
            Err(report) => report,
        }
    }

    pub fn messages<E>(report: &Report<E>) -> Vec<String> {
        report.frames().map(ToString::to_string).collect()
    }

    pub fn kinds<E>(report: &Report<E>) -> Vec<FrameKind> {
        report.frames().map(Frame::kind).collect()
    }
}
