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
//! - `std`: Enables support for [`Error`], **enabled** by default
//! - `backtrace`: Enables the capturing of [`Backtrace`]s, implies `std`, **enabled** by default
//! - `spantrace`: Enables the capturing of [`SpanTrace`]s, **disabled** by default

#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(doc, feature(doc_auto_cfg))]
#![cfg_attr(feature = "backtrace", feature(backtrace))]
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
// pub mod tags;

use alloc::boxed::Box;
use core::{fmt, marker::PhantomData, mem::ManuallyDrop, panic::Location};

use provider::Provider;

pub use self::macros::*;
use self::{frame::FrameRepr, report::ReportImpl};

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
/// [`request_ref()`] or [`request_value()`].
///
/// [`Backtrace`]: std::backtrace::Backtrace
/// [`SpanTrace`]: tracing_error::SpanTrace
/// [`ErrorLayer`]: tracing_error::ErrorLayer
/// [`wrap()`]: Self::wrap
/// [`from()`]: Self::from
/// [`frames()`]: Self::frames
/// [`new()`]: Self::new
/// [`provide_context()`]: Self::provide_context
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
///     # Err(error::report!("")).wrap_err_lazy(|| format!("Failed to read config file {config_path:?}"))?;
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
/// use provider::{Demand, Provider};
/// use error::{Report, ResultExt};
///
/// #[derive(Debug)]
/// # #[derive(PartialEq)]
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
///     fn provide<'a>(&'a self, _demand: &mut Demand<'a>) {}
/// }
/// impl Provider for ConfigError {
///     fn provide<'a>(&'a self, _demand: &mut Demand<'a>) {}
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
///     # assert!(err.contains::<ConfigError>());
///     # assert_eq!(err.downcast_ref::<RuntimeError>(), Some(&RuntimeError::InvalidConfig(PathBuf::from("./path/to/config.file"))));
///     # Ok(())
/// }
/// ```
#[must_use]
pub struct Report<C = ()> {
    inner: Box<ReportImpl>,
    _context: PhantomData<C>,
}

/// A single error, contextual message, or error context inside of a [`Report`].
///
/// `Frame`s are organized as a singly linked list, which can be iterated by calling
/// [`Report::frames()`]. The head is pointing to the most recent context or contextual message,
/// the tail is the root error created by [`Report::new()`], [`Report::from_context()`], or
/// [`Report::from()`]. The next `Frame` can be accessed by requesting it by calling
/// [`Report::request_ref()`].
pub struct Frame {
    inner: ManuallyDrop<Box<FrameRepr>>,
    location: &'static Location<'static>,
    source: Option<Box<Frame>>,
}

/// `Result<T, Report<C>>`
///
/// A reasonable return type to use throughout an application.
///
/// The `Result` type can be used with one or two parameters, where the first parameter represents
/// the [`Ok`] arm and the second parameter `Context` is used as in [`Report<C>`].
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
pub type Result<T, C = ()> = core::result::Result<T, Report<C>>;

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

/// Extension trait for [`Result`][core::result::Result] to provide context information on
/// [`Report`]s.
pub trait ResultExt<T> {
    /// Type of the resulting context `C` inside of [`Report<C>`] when not providing a context.
    type Context;

    /// Adds new contextual message to the [`Frame`] stack of a [`Report`].
    ///
    /// # Example
    ///
    /// ```
    /// # use error::Result;
    /// # fn load_resource(_: &User, _: &Resource) -> Result<()> { Ok(()) }
    /// # struct User;
    /// # struct Resource;
    /// use error::ResultExt;
    ///
    /// # let user = User;
    /// # let resource = Resource;
    /// # #[allow(unused_variables)]
    /// let resource = load_resource(&user, &resource).wrap_err("Could not load resource")?;
    /// # Result::Ok(())
    /// ```
    fn wrap_err<M>(self, message: M) -> Result<T, Self::Context>
    where
        M: Message;

    /// Lazily adds new contextual message to the [`Frame`] stack of a [`Report`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// # Example
    ///
    /// ```
    /// # use core::fmt;
    /// # use error::Result;
    /// # fn load_resource(_: &User, _: &Resource) -> Result<()> { Ok(()) }
    /// # struct User;
    /// # struct Resource;
    /// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
    /// use error::ResultExt;
    ///
    /// # let user = User;
    /// # let resource = Resource;
    /// # #[allow(unused_variables)]
    /// let resource = load_resource(&user, &resource)
    ///     .wrap_err_lazy(|| format!("Could not load resource {resource}"))?;
    /// # Result::Ok(())
    /// ```
    fn wrap_err_lazy<M, F>(self, op: F) -> Result<T, Self::Context>
    where
        M: Message,
        F: FnOnce() -> M;

    /// Adds a context provider to the [`Frame`] stack of a [`Report`] returning
    /// [`Result<T, Context>`]).
    // TODO: come up with a decent example
    fn provide_context<C>(self, context: C) -> Result<T, C>
    where
        C: Context;

    /// Lazily adds a context provider to the [`Frame`] stack of a [`Report`] returning
    /// [`Result<T, C>`]).
    // TODO: come up with a decent example
    fn provide_context_lazy<C, F>(self, op: F) -> Result<T, C>
    where
        C: Context,
        F: FnOnce() -> C;
}

/// Iterator over the [`Frame`] stack of a [`Report`].
///
/// Use [`Report::frames()`] to create this iterator.
#[must_use]
#[derive(Clone)]
pub struct Frames<'r> {
    current: Option<&'r Frame>,
}

/// Iterator over requested references in the [`Frame`] stack of a [`Report`].
///
/// Use [`Report::request_ref()`] to create this iterator.
#[must_use]
pub struct RequestRef<'r, T: ?Sized> {
    frames: Frames<'r>,
    _marker: PhantomData<&'r T>,
}

/// Iterator over requested values in the [`Frame`] stack of a [`Report`].
///
/// Use [`Report::request_value()`] to create this iterator.
#[must_use]
pub struct RequestValue<'r, T> {
    frames: Frames<'r>,
    _marker: PhantomData<T>,
}

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
