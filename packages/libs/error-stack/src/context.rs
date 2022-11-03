#[cfg(nightly)]
use core::any::Demand;
#[cfg(nightly)]
use core::error::Error;
use core::fmt;
#[cfg(all(not(nightly), feature = "std"))]
use std::error::Error;

use crate::Report;

/// Defines the current context of a [`Report`].
///
/// When in a `std` environment or on a nightly toolchain, every [`Error`] is a valid `Context`.
/// This trait is not limited to [`Error`]s and can also be manually implemented on a type.
///
/// [`Error`]: core::error::Error
///
/// ## Example
///
/// Used for creating a [`Report`] or for switching the [`Report`]'s context:
///
/// ```rust
/// # #![cfg_attr(any(not(feature = "std"), miri), allow(unused_imports))]
/// use std::{fmt, fs, io};
///
/// use error_stack::{Context, IntoReport, Result, ResultExt};
///
/// # type Config = ();
/// #[derive(Debug)]
/// pub enum ConfigError {
///     ParseError,
/// }
///
/// impl fmt::Display for ConfigError {
///     # #[allow(unused_variables)]
///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///         # const _: &str = stringify! {
///         ...
///         # }; Ok(())
///     }
/// }
///
/// // In this scenario, `Error` is not implemented for `ConfigError` for some reason, so implement
/// // `Context` manually.
/// impl Context for ConfigError {}
///
/// # #[cfg(any(not(feature = "std"), miri))]
/// # pub fn read_file(_: &str) -> Result<String, ConfigError> { error_stack::bail!(ConfigError::ParseError) }
/// # #[cfg(all(feature = "std", not(miri)))]
/// pub fn read_file(path: &str) -> Result<String, io::Error> {
///     // Creates a `Report` from `io::Error`, the current context is `io::Error`
///     fs::read_to_string(path).into_report()
/// }
///
/// pub fn parse_config(path: &str) -> Result<Config, ConfigError> {
///     // The return type of `parse_config` requires another context. By calling `change_context`
///     // the context may be changed.
///     read_file(path).change_context(ConfigError::ParseError)?;
///
///     # const _: &str = stringify! {
///     ...
///     # }; Ok(())
/// }
/// # let err = parse_config("invalid-path").unwrap_err();
/// # #[cfg(all(feature = "std", not(miri)))]
/// # assert!(err.contains::<io::Error>());
/// # assert!(err.contains::<ConfigError>());
/// ```
pub trait Context: fmt::Display + fmt::Debug + Send + Sync + 'static {
    /// Provide values which can then be requested by [`Report`].
    #[cfg(nightly)]
    #[allow(unused_variables)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {}
}

impl<C> From<C> for Report<C>
where
    C: Context,
{
    #[track_caller]
    #[inline]
    fn from(context: C) -> Self {
        Self::new(context)
    }
}

#[cfg(any(nightly, feature = "std"))]
impl<C: Error + Send + Sync + 'static> Context for C {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        Error::provide(self, demand);
    }
}
