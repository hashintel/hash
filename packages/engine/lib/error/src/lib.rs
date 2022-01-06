//! Error reporting library based on type-based data access
//!
//! This crate provides [`Report`], a trait object based, context sensitive, error handling type.
//!
//! ## Yet another error crate?
//!
//! Error reporting strategies in Rust are still developing and there are many approaches at the
//! moment with various pros and cons. This crates takes inspiration from an
//! [RFC to the core library ](https://github.com/nrc/rfcs/blob/dyno/text/0000-dyno.md) to introduce
//! a reflection-like API - the [`provider`]-API - to add context data to a [`Report`]. Using this,
//! it becomes possible to attach any data to an error. Beyond this, the design also allows Errors
//! to have additional requirements, such as _enforcing_ the provision of contextual information by
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
//! [`Result`] type alias, which uses [`Report<()>`][Report] as [`Err`] variant and can be used as
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
//!     # };
//!     # Ok(())
//! }
//! ```
//!
//! A contextual message can be provided to lower level errors.
//!
//! ```
//! use error::{ResultExt, Result};
//!
//! fn main() -> Result<()> {
//!     # fn fake_main() -> Result<()> {
//!     let config_path = "./path/to/config.file";
//!     # #[cfg(all(not(miri), feature = "std"))]
//!     # #[allow(unused_variables)]
//!     let content = std::fs::read_to_string(config_path)
//!         .wrap_err_lazy(|| format!("Failed to read config file {config_path:?}"))?;
//!     # #[cfg(any(miri, not(feature = "std")))]
//!     # Err(error::format_err!("")).wrap_err_lazy(|| format!("Failed to read config file {config_path:?}"))?;
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # };
//!     # Ok(()) }
//!     # assert!(fake_main().is_err());
//!     # Ok(())
//! }
//! ```
//!
//! which probably prints something like
//!
//! ```text
//! Error: Failed to read config file "./path/to/config.file"
//!              at main.rs:7:10
//!
//! Caused by:
//!    0: No such file or directory (os error 2)
//!              at main.rs:7:10
//! ```
//!
//! # Feature flags
//!
//! - `std`: Enables support for [`Error`], **enabled** by default
//! - `backtrace`: Enables the capturing of [`Backtrace`]s, implies `std`, **enabled** by default
//! - `spantrace`: Enables the capturing of [`SpanTrace`]s, **disabled** by default

#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(doc, feature(doc_auto_cfg))]
#![cfg_attr(feature = "backtrace", feature(backtrace))]
#![feature(min_specialization)]
#![warn(missing_docs, clippy::pedantic, clippy::nursery)]
#![allow(clippy::missing_errors_doc)] // This is an error handling library producing Results, not Errors
#![cfg_attr(
    not(miri),
    doc(test(attr(deny(warnings, clippy::pedantic, clippy::nursery))))
)]

extern crate alloc;

mod ext;
mod frame;
mod iter;
mod macros;
mod report;
pub mod tags;

use alloc::boxed::Box;
use core::{fmt, marker::PhantomData, mem::ManuallyDrop, panic::Location};

use provider::Provider;

pub use self::macros::*;
use self::{frame::ErrorRepr, report::ReportImpl};

/// Contains a [`Frame`] stack consisting of an original error, context information, and optionally
/// a [`Backtrace`] and a [`SpanTrace`].
///
/// To enable the backtrace, make sure `RUST_BACKTRACE` or `RUST_LIB_BACKTRACE` is set according to
/// the [`Backtrace` documentation][`Backtrace`]. To enable the span trace, [`ErrorLayer`] has to
/// be enabled.
///
/// Context information can be added by using [`wrap()`] or [`ResultExt`]. The [`Frame`] stack can
/// be iterated by using [`frames()`].
///
/// To enforce context information generation, an optional context [`Provider`] may be used. When
/// creating a `Report` from a message with [`new()`] or from an std-error by using [`from()`], the
/// `Report` does not have an context associated. To provide one, the [`provider`] API is used. Use
/// [`provide_context()`] or [`ResultExt`] to add it, which may also be used to provide more context
/// information than only a display message. This information can the be retrieved by calling
/// [`request()`], [`request_ref()`], or [`request_value()`].
///
/// [`Backtrace`]: std::backtrace::Backtrace
/// [`SpanTrace`]: tracing_error::SpanTrace
/// [`ErrorLayer`]: tracing_error::ErrorLayer
/// [`wrap()`]: Self::wrap
/// [`from()`]: Self::from
/// [`frames()`]: Self::frames
/// [`new()`]: Self::new
/// [`provide_context()`]: Self::provide_context
/// [`request()`]: Self::request
/// [`request_ref()`]: Self::request_ref
/// [`request_value()`]: Self::request_value
///
/// # Examples
///
/// Provide a context for an error:
///
///
/// ```
/// use error::{ResultExt, Result};
///
/// fn main() -> Result<()> {
///     # fn fake_main() -> Result<()> {
///     let config_path = "./path/to/config.file";
///     # #[cfg(all(not(miri), feature = "std"))]
///     # #[allow(unused_variables)]
///     let content = std::fs::read_to_string(config_path)
///         .wrap_err_lazy(|| format!("Failed to read config file {config_path:?}"))?;
///     # #[cfg(any(miri, not(feature = "std")))]
///     # Err(error::format_err!("")).wrap_err_lazy(|| format!("Failed to read config file {config_path:?}"))?;
///
///     # const _: &str = stringify! {
///     ...
///     # };
///     # Ok(()) }
///     # let err = fake_main().unwrap_err();
///     # assert_eq!(err.frames().count(), 2);
///     # Ok(())
/// }
/// ```
///
/// Enforce a context for an error:
///
/// ```
/// use core::fmt;
/// use std::path::{Path, PathBuf};
///
/// use provider::{Provider, Requisition};
/// use error::{Report, ResultExt};
///
/// #[derive(Debug)]
/// enum RuntimeError {
///     InvalidConfig(PathBuf),
/// # }
/// # const _: &str = stringify! {
///     ...
/// }
/// # ;
///
/// #[derive(Debug)]
/// enum ConfigError {
///     IoError,
/// # }
/// # const _: &str = stringify! {
///     ...
/// }
/// # ;
///
/// impl fmt::Display for RuntimeError {
///     # fn fmt(&self, _fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///     # const _: &str = stringify! {
///     ...
///     # };
///     # Ok(())
///     # }
/// }
/// impl fmt::Display for ConfigError {
///     # fn fmt(&self, _fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///     # const _: &str = stringify! {
///     ...
///     # };
///     # Ok(())
///     # }
/// }
///
/// impl Provider for RuntimeError {
///     fn provide<'p>(&'p self, _req: &mut Requisition<'p, '_>) {}
/// }
/// impl Provider for ConfigError {
///     fn provide<'p>(&'p self, _req: &mut Requisition<'p, '_>) {}
/// }
///
/// # #[allow(unused_variables)]
/// fn read_config(path: impl AsRef<Path>) -> Result<String, Report<ConfigError>> {
///     # #[cfg(any(miri, not(feature = "std")))]
///     # error::bail!(context: ConfigError::IoError, "No such file");
///     # #[cfg(all(not(miri), feature = "std"))]
///     std::fs::read_to_string(path.as_ref()).provide_context(ConfigError::IoError)
/// }
///
/// fn main() -> Result<(), Report<RuntimeError>> {
///     # fn fake_main() -> Result<(), Report<RuntimeError>> {
///     let config_path = "./path/to/config.file";
///     # #[allow(unused_variables)]
///     let config = read_config(config_path)
///             .provide_context_lazy(|| RuntimeError::InvalidConfig(PathBuf::from(config_path)))?;
///
///     # const _: &str = stringify! {
///     ...
///     # };
///     # Ok(()) }
///     # let err = fake_main().unwrap_err();
///     # assert_eq!(err.frames().count(), 3);
///     # Ok(())
/// }
/// ```
#[must_use]
pub struct Report<Context = ()> {
    inner: Box<ReportImpl>,
    _context: PhantomData<Context>,
}

/// A single error, contextual message, or error context inside of a [`Report`].
///
/// `Frame`s are an intrusive singly linked list. The head is pointing to the most recent error
/// message or context, the tail is the root error created by [`Report::new()`],
/// [`Report::from_context()`], or [`Report::from()`]. The list can be advanced by [`request`]ing
/// [`tags::FrameSource`] or be iterated by calling [`Report::frames()`].
///
/// [`request`]: Self::request
pub struct Frame {
    error: ManuallyDrop<Box<ErrorRepr<()>>>,
    location: &'static Location<'static>,
    source: Option<Box<Frame>>,
}

/// `Result<T, Report>`
///
/// A reasonable return type to use throughout an application if no scope is used.
///
/// The `Result` type can be used with one or two parameters.
///
/// # Examples
///
/// `Result` can also be used in `fn main()`:
///
/// ```
/// # fn has_permission(_: usize, _: usize) -> bool { true }
/// # fn get_user() -> Result<usize> { Ok(0) }
/// # fn get_resource() -> Result<usize> { Ok(0) }
/// use error::{ensure, Result};
///
/// fn main() -> Result<()> {
///     let user = get_user()?;
///     let resource = get_resource()?;
///
///     ensure!(
///         has_permission(user, resource),
///         "Permission denied for {user} accessing {resource}"
///     );
///
///     //...
///     # Ok(())
/// }
/// ```
///
/// If additional error kinds are required, `Result` should be redefined:
///
/// ```
/// # #![allow(dead_code)]
/// # struct MyErrorKind;
/// type Result<T, E = error::Report<MyErrorKind>> = error::Result<T, E>;
/// ```
pub type Result<T, E = Report> = core::result::Result<T, E>;

/// Extension trait for [`Result`][core::result::Result] to provide context information on
/// [`Report`]s.
pub trait ResultExt<T> {
    /// Type of the resulting error `E` inside of [`Report<E>`][`Report`] when not providing an
    /// error kind.
    type ErrorKind;

    /// Adds new context information to the [`Frame`] stack of a [`Report`].
    fn wrap_err<C>(self, context: C) -> Result<T, Report<Self::ErrorKind>>
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static;

    /// Lazily adds new context information to the [`Frame`] stack of a [`Report`].
    fn wrap_err_lazy<C, F>(self, context: F) -> Result<T, Report<Self::ErrorKind>>
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> C;

    /// Adds a new error kind to the [`Frame`] stack of a [`Report`].
    fn provide_context<E>(self, context: E) -> Result<T, Report<E>>
    where
        E: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static;

    /// Lazily adds a new error kind to the [`Frame`] stack of a [`Report`].
    fn provide_context_lazy<E, F>(self, context: F) -> Result<T, Report<E>>
    where
        E: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> E;
}

/// Iterator over the [`Frame`] stack of a [`Report`].
///
/// Use [`Report::frames()`] to create this iterator.
#[must_use]
#[derive(Clone)]
pub struct Frames<'r> {
    current: Option<&'r Frame>,
}

/// Iterator over requested values in the [`Frame`] stack of a [`Report`] for the type specified by
/// [`I::Type`].
///
/// Use [`Report::request()`], [`Report::request_ref()`], or [`Report::request_value()`] to create
/// this iterator.
///
/// [`I::Type`]: provider::TypeTag::Type
#[must_use]
pub struct Requests<'r, I> {
    chain: Frames<'r>,
    _marker: PhantomData<I>,
}

#[cfg(test)]
pub(crate) mod test_helper {
    pub use alloc::{
        string::{String, ToString},
        vec::Vec,
    };
    use core::{fmt, fmt::Formatter};

    use provider::{Provider, Requisition, TypeTag};

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

    pub struct TagA;

    impl TypeTag<'_> for TagA {
        type Type = u32;
    }

    impl Provider for ContextA {
        fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
            req.provide::<TagA>(self.0);
        }
    }

    #[derive(Debug)]
    pub struct ContextB(pub i32);

    impl fmt::Display for ContextB {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
            fmt.write_str("Error Kind B")
        }
    }

    pub struct TagB;

    impl TypeTag<'_> for TagB {
        type Type = i32;
    }

    impl Provider for ContextB {
        fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
            req.provide::<TagB>(self.0);
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
