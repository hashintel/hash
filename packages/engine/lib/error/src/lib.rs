//! Error reporting library based on type-based data access
//!
//! This crate provides the [`Report`] struct and accompanying API.
//!
//! ## Yet another error crate?
//!
//! Error reporting in Rust is a long story and many crates tried to optimize the error reporting
//! strategy. This crates uses a reflection-like API - the [`provider`]-API - to add context data to
//! a [`Report`]. This way, it is possible to attach any data to an error. Also it is possible to
//! enforce providing context information by using [`ErrorKind`].
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
//! # fn has_permission(user: usize, resource: usize) -> bool { true }
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
//! A context can be provided to lower level errors.
//!
//! ```
//! use error::{ReportContext, Result};
//!
//! fn main() -> Result<()> {
//!     # return Ok(());
//!     let config_path = "./path/to/config.file";
//!     let content = std::fs::read_to_string(config_path)
//!         .with_context(|| format!("Failed to read config file {config_path:?}"))?;
//!
//!     # const _: &str = stringify! {
//!     ...
//!     # };
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

extern crate alloc;

mod ext;
mod frame;
mod iter;
mod macros;
mod report;
pub mod tags;

use alloc::boxed::Box;
use core::{fmt, marker::PhantomData, panic::Location};

use provider::{Provider, Requisition};

pub use self::macros::*;
use self::{frame::Error, report::ReportImpl};

/// Contains a [`Frame`] stack consisting of an original error, context information, and optionally
/// a [`Backtrace`] and a [`SpanTrace`].
///
/// To enable the backtrace, make sure `RUST_BACKTRACE` or `RUST_LIB_BACKTRACE` is set according to
/// the [`Backtrace` documentation][`Backtrace`]. To enable the span trace, [`ErrorLayer`] has to
/// be enabled.
///
/// Context information can be added by using [`context()`] or [`ReportContext`]. The [`Frame`]
/// stack can be iterated by using [`frames()`].
///
/// To enforce context information generation, an optional [`ErrorKind`] may be used. When creating
/// a `Report` from a message with [`new()`] or from an std-error by using [`from()`], the `Report`
/// does not have an [`ErrorKind`]. To provide one, the [`provider`] API is used. Use
/// [`error_kind()`] or [`ReportErrorKind`] to add it, which may also be used to provide more
/// context information than only a display message. This information can the be retrieved by
/// calling [`request()`], [`request_ref()`], or [`request_value()`].
///
/// [`Backtrace`]: std::backtrace::Backtrace
/// [`SpanTrace`]: tracing_error::SpanTrace
/// [`ErrorLayer`]: tracing_error::ErrorLayer
/// [`context()`]: Self::context
/// [`from()`]: Self::from
/// [`frames()`]: Self::frames
/// [`new()`]: Self::new
/// [`error_kind()`]: Self::error_kind
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
/// use error::{ReportContext, Result};
///
/// fn main() -> Result<()> {
///     # fn fake_main() -> Result<()> {
///     let config_path = "./path/to/config.file";
///     # #[cfg(not(miri))]
///     let content = std::fs::read_to_string(config_path)
///         .with_context(|| format!("Failed to read config file {config_path:?}"))?;
///     # #[cfg(miri)]
///     # Err(error::format_err!("")).with_context(|| format!("Failed to read config file {config_path:?}"))?;
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
/// use std::fmt::Write;
/// use std::path::{Path, PathBuf};
///
/// use error::{ErrorKind, Report, ReportErrorKind};
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
///     # fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///     # const _: &str = stringify! {
///     ...
///     # };
///     # Ok(())
///     # }
/// }
/// impl fmt::Display for ConfigError {
///     # fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///     # const _: &str = stringify! {
///     ...
///     # };
///     # Ok(())
///     # }
/// }
///
/// impl ErrorKind for RuntimeError {}
/// impl ErrorKind for ConfigError {}
///
/// fn read_config(path: impl AsRef<Path>) -> Result<String, Report<ConfigError>> {
///     # #[cfg(miri)]
///     # { error::bail!(error_kind: ConfigError::IoError, "No such file"); return Ok("".to_string()); }
///     # #[cfg(not(miri))]
///     std::fs::read_to_string(path.as_ref()).error_kind(ConfigError::IoError)
/// }
///
/// fn main() -> Result<(), Report<RuntimeError>> {
///     # fn fake_main() -> Result<(), Report<RuntimeError>> {
///     let config_path = "./path/to/config.file";
///     let config = read_config(config_path)
///             .with_error_kind(|| RuntimeError::InvalidConfig(PathBuf::from(config_path)))?;
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
pub struct Report<ErrorKind = ()> {
    inner: Box<ReportImpl>,
    _scope: PhantomData<ErrorKind>,
}

/// A single error, error [`Context`], or [`ErrorKind`] inside of a [`Report`].
///
/// `Frame`s are an intrusive singly linked list. The head is pointing to the most recent
/// [`Context`] or [`ErrorKind`], the tail is the root error created by [`Report::new()`],
/// [`Report::from_error_kind()`], or [`Report::from()`]. The list can be advanced by [`request`]ing
/// [`tags::FrameSource`] or be iterated by calling [`Report::frames()`].
///
/// [`request`]: Self::request
pub struct Frame {
    error: Error,
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
/// # fn has_permission(user: usize, resource: usize) -> bool { true }
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
/// # struct MyErrorKind;
/// type Result<T, E = error::Report<MyErrorKind>> = error::Result<T, E>;
/// ```
pub type Result<T, E = Report> = core::result::Result<T, E>;

/// Provides error information for a [`Frame`].
///
/// In comparison to [`Context`], `ErrorKind` is not implemented for [`Display`] automatically. It
/// can be used to force the user to provide more context information.
///
/// See the [`tags`] submodule for built-in [`TypeTag`]s used by this API.
///
/// [`TypeTag`]: provider::TypeTag
/// [`Display`]: core::fmt::Display
///
/// ```
/// use core::fmt;
///
/// use error::ErrorKind;
/// use provider::Requisition;
///
/// # struct User;
/// # struct Resource;
/// # impl fmt::Display for User { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// # impl fmt::Display for Resource { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
/// struct PermissionDenied {
///     user: User,
///     resource: Resource,
/// }
///
/// impl fmt::Display for PermissionDenied {
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         write!(fmt, "Permission denied accessing {} as {}", self.resource, self.user)
///     }
/// }
///
/// impl ErrorKind for PermissionDenied {
///     fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
///         req.provide_ref(&self.user).provide_ref(&self.resource);
///     }
/// }
/// ```
pub trait ErrorKind: fmt::Display + Send + Sync + 'static {
    /// Provides error information for a [`Frame`] similar to the [`provider`] API.
    fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
        let _ = req;
    }
}

impl<P> ErrorKind for P
where
    P: Provider + fmt::Display + Send + Sync + 'static,
{
    fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
        Provider::provide(self, req);
    }
}

/// Provides error information for a [`Frame`].
///
/// In comparison to [`ErrorKind`], `Context` is implemented for [`Display`] automatically, so even
/// simple data like [`&str`][str] can be used to provide a better error context.
///
/// See the [`tags`] submodule for built-in [`TypeTag`]s used by this API.
///
/// [`TypeTag`]: provider::TypeTag
/// [`Display`]: core::fmt::Display
///
/// # Example
///
/// You can create new context objects by implementing this trait, however the `min_specialization`
/// feature has to be enabled:
///
/// ```
/// #![feature(min_specialization)]
///
/// use core::fmt;
///
/// use error::Context;
/// use provider::Requisition;
///
/// struct MyContext;
///
/// impl fmt::Display for MyContext {
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         fmt.write_str("Context information")
///     }
/// }
///
/// impl Context for MyContext {
///     fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {}
/// }
/// ```
pub trait Context: fmt::Display + Send + Sync + 'static {
    /// Provides error information for a [`Frame`] similar to the [`provider`] API.
    fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>);
}

impl<E> Context for E
where
    E: fmt::Display + Send + Sync + 'static,
{
    default fn provide<'p>(&'p self, _req: &mut Requisition<'p, '_>) {}
}

/// Extension trait to provide context information on [`Report`]s.
pub trait ReportContext<T> {
    /// Type of the resulting error `E` inside of [`Report<E>`][`Report`].
    type ErrorKind;

    /// Adds new context information to the [`Frame`] stack of a [`Report`].
    fn context<C>(self, context: C) -> Result<T, Report<Self::ErrorKind>>
    where
        C: Context;

    /// Lazily adds new context information to the [`Frame`] stack of a [`Report`].
    fn with_context<C, F>(self, context: F) -> Result<T, Report<Self::ErrorKind>>
    where
        C: Context,
        F: FnOnce() -> C;
}

/// Extension trait to provide the error `E` inside of [`Report<E>`][`Report`].
pub trait ReportErrorKind<T> {
    /// Adds a new error kind to the [`Frame`] stack of a [`Report`].
    fn error_kind<E>(self, error_kind: E) -> Result<T, Report<E>>
    where
        E: ErrorKind;

    /// Lazily adds a new error kind to the [`Frame`] stack of a [`Report`].
    fn with_error_kind<E, F>(self, error_kind: F) -> Result<T, Report<E>>
    where
        E: ErrorKind,
        F: FnOnce() -> E;
}

/// Iterator over the [`Frame`] stack of a [`Report`].
///
/// Use [`Report::frames()`] to create this iterator.
#[must_use]
#[derive(Clone)]
pub struct FrameStack<'r> {
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
pub struct RequestStack<'r, I> {
    chain: FrameStack<'r>,
    _marker: PhantomData<I>,
}

#[cfg(test)]
pub(crate) mod test_helper {
    pub use alloc::{
        string::{String, ToString},
        vec::Vec,
    };
    use core::{fmt, fmt::Formatter};

    use provider::{Requisition, TypeTag};

    use crate::{ErrorKind, Report};

    pub const CONTEXT_A: &str = "Context A";
    pub const CONTEXT_B: &str = "Context B";

    #[derive(Debug)]
    pub struct ErrorKindA(pub u32);

    impl fmt::Display for ErrorKindA {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
            fmt.write_str("Error Kind A")
        }
    }

    pub struct TagA;

    impl TypeTag<'_> for TagA {
        type Type = u32;
    }

    impl ErrorKind for ErrorKindA {
        fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
            req.provide::<TagA>(self.0);
        }
    }

    #[derive(Debug)]
    pub struct ErrorKindB(pub i32);

    impl fmt::Display for ErrorKindB {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
            fmt.write_str("Error Kind B")
        }
    }

    pub struct TagB;

    impl TypeTag<'_> for TagB {
        type Type = i32;
    }

    impl ErrorKind for ErrorKindB {
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
