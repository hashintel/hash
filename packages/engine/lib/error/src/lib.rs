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
//! using [`Report::provide_context()`].
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
//! [`Result<E, C = ()>`] type alias, which uses [`Report<C>`] as [`Err`] variant and can be used as
//! return type:
//!
//! ```
//! # fn has_permission(_: usize, _: usize) -> bool { true }
//! # fn get_user() -> Result<usize> { Ok(0) }
//! # fn get_resource() -> Result<usize> { Ok(0) }
//! use error::{ensure, Result};
//!
//! fn main() -> Result<()> {
//!     let user = get_user()?;
//!     let resource = get_resource()?;
//!
//!     ensure!(
//!         has_permission(user, resource),
//!         "Permission denied for {user} accessing {resource}"
//!     );
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # }; Ok(())
//! }
//! ```
//!
//! A contextual message can be provided to lower level errors.
//!
//! ```
//! use std::collections::HashMap;
//!
//! use error::{ensure, report, Result, ResultExt};
//!
//! fn lookup_key(map: &HashMap<&str, u64>, key: &str) -> Result<u64> {
//!     ensure!(key.len() == 8, "Key must be 8 characters long");
//!
//!     map.get(key)
//!         .cloned()
//!         .ok_or_else(|| report!("key does not exist"))
//! }
//!
//! fn parse_config(config: &HashMap<&str, u64>) -> Result<u64> {
//!     let key = "abcd-efgh";
//!     let value =
//!         lookup_key(&config, key).wrap_err_lazy(|| format!("Could not lookup key {key:?}"))?;
//!
//!     Ok(value)
//! }
//!
//! fn main() -> Result<()> {
//!     # fn fake_main() -> Result<()> { // We want to assert on the result
//!     let config = HashMap::default();
//!     # #[allow(unused_variables)]
//!     let config_value = parse_config(&config).wrap_err("Unable to parse config")?;
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
//!              at main.rs:23:46
//!
//! Caused by:
//!    0: Could not lookup key "abcd-efgh"
//!              at main.rs:16:34
//!    1: Key must be 8 characters long
//!              at main.rs:6:5
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
//! Feature     | Description                                                             | default
//! ------------|-------------------------------------------------------------------------|---------
//! `std`       | Enables support for [`Error`] and, on nightly, [`Backtrace`]            | enabled
//! `hooks`     | Enables the usage of [`set_display_hook`] and [`set_debug_hook`]        | enabled
//! `spantrace` | Enables the capturing of [`SpanTrace`]s                                 | disabled
//! `futures`   | Provides a [`FutureExt`] adaptor                                        | disabled
//!
//!
//! Using the `backtrace` crate instead of `std::backtrace` is a considered feature to support
//! backtraces on non-nightly channels and can be prioritized depending on demand.
//!
//! [`set_display_hook`]: Report::set_display_hook
//! [`set_debug_hook`]: Report::set_debug_hook

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
extern crate core;

mod frame;
pub mod iter;
mod macros;
mod report;
mod result;

#[cfg(feature = "std")]
mod error;
#[cfg(feature = "futures")]
pub mod future;
#[cfg(feature = "hooks")]
mod hook;

use core::fmt;

use provider::Provider;

#[cfg(feature = "futures")]
#[doc(inline)]
pub use self::future::FutureExt;
pub use self::{
    frame::Frame,
    macros::*,
    report::Report,
    result::{IntoReport, Result, ResultExt},
};

/// Trait alias for an error context.
///
/// Note: This is currently defined as trait but will be changed to be a trait alias as soon as
///   it's stabilized
// TODO: change to `pub trait Context = ...`
//   Tracking issue: https://github.com/rust-lang/rust/issues/41517
pub trait Context: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static {}
impl<C: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static> Context for C {}

/// Trait alias for a contextual message.
///
/// Note: This is currently defined as trait but will be changed to be a trait alias as soon as
///   it's stabilized
// TODO: change to `pub trait Context = ...`
//   Tracking issue: https://github.com/rust-lang/rust/issues/41517
pub trait Message: fmt::Display + fmt::Debug + Send + Sync + 'static {}
impl<M: fmt::Display + fmt::Debug + Send + Sync + 'static> Message for M {}

#[cfg(test)]
pub(crate) mod test_helper {
    pub use alloc::{
        string::{String, ToString},
        vec::Vec,
    };
    use core::{fmt, fmt::Formatter};

    use provider::{Demand, Provider};

    use crate::Report;

    pub const MESSAGE_A: &str = "Message A";
    // pub const MESSAGE_B: &str = "Message B";

    #[derive(Debug)]
    pub struct ContextA(pub u32);

    impl fmt::Display for ContextA {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
            fmt.write_str("Context A")
        }
    }

    impl Provider for ContextA {
        fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
            demand.provide_value(|| self.0);
        }
    }

    #[derive(Debug)]
    pub struct ContextB(pub i32);

    impl fmt::Display for ContextB {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
            fmt.write_str("Error Kind B")
        }
    }

    impl Provider for ContextB {
        fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
            demand.provide_ref(&self.0);
        }
    }

    pub fn capture_error<E>(closure: impl FnOnce() -> Result<(), Report<E>>) -> Report<E> {
        match closure() {
            Ok(_) => panic!("Expected an error"),
            Err(report) => report,
        }
    }

    pub fn request_messages<E>(report: &Report<E>) -> Vec<String> {
        report.frames().map(ToString::to_string).collect()
    }
}
