use alloc::string::{String, ToString};
#[cfg(nightly)]
use core::error::Request;
use core::{error::Error, fmt};

use crate::Report;

/// Defines the current context of a [`Report`].
///
/// When in a `std` environment or on a nightly toolchain, every [`Error`] is a valid `Context`.
/// This trait is not limited to [`Error`]s and can also be manually implemented on a type.
///
/// ## Example
///
/// Used for creating a [`Report`] or for switching the [`Report`]'s context:
///
/// ```rust
/// use std::{fmt, fs, io};
///
/// use error_stack::{Context, Result, ResultExt, Report};
///
/// # type Config = ();
/// #[derive(Debug)]
/// pub enum ConfigError {
///     ParseError,
/// }
///
/// impl fmt::Display for ConfigError {
///     # #[allow(unused_variables)] // `fmt` is not used in this example
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
/// pub fn read_file(path: &str) -> Result<String, io::Error> {
///     // Creates a `Report` from `io::Error`, the current context is `io::Error`
///     fs::read_to_string(path).map_err(Report::from)
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
/// # assert!(err.contains::<io::Error>());
/// # assert!(err.contains::<ConfigError>());
/// ```
pub trait Context: fmt::Display + fmt::Debug + Send + Sync + 'static {
    /// Provide values which can then be requested by [`Report`].
    #[cfg(nightly)]
    #[allow(unused_variables)]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {}

    /// Returns the source of the error, if any.
    ///
    /// This method only exists to avoid the requirement of specialization and to get the sources
    /// for `Error`.
    #[doc(hidden)]
    fn __source(&self) -> Option<&(dyn Error + 'static)> {
        None
    }
}

/// Captures an error message as the context of a [`Report`].
pub(crate) struct SourceContext(String);

impl SourceContext {
    pub(crate) fn from_error(value: &dyn Error) -> Self {
        Self(value.to_string())
    }
}

impl fmt::Debug for SourceContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for SourceContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl Context for SourceContext {}

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

impl<C: Error + Send + Sync + 'static> Context for C {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        Error::provide(self, request);
    }

    #[doc(hidden)]
    #[inline]
    fn __source(&self) -> Option<&(dyn Error + 'static)> {
        self.source()
    }
}
