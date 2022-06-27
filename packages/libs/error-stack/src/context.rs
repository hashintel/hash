#[cfg(nightly)]
use core::any::Demand;
#[cfg(all(nightly, any(feature = "std", feature = "spantrace")))]
use core::any::Provider;
use core::fmt;

use crate::Report;

/// Defines the current context of a [`Report`].
///
/// When in a `std` environment, every [`Error`] is a valid `Context`. This trait is not limited to
/// [`Error`]s and can also be manually implemented for custom objects.
///
/// [`Error`]: std::error::Error
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
///     fs::read_to_string(path).report()
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
/// # assert_eq!(err.frames().count(), 2);
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

/// Turns a [`Context`] into a temporary [`Provider`].
///
/// To enable the usage of the [`Provider`] trait without implementing [`Provider`] for [`Context`]
/// this function wraps a reference to a [`Context`] inside of a [`Provider`]
// We can't implement `Provider` on Context as `Error` will implement `Provider` and `Context` will
// be implemented on `Error`. For `request`ing a type from `Context`, we need a `Provider`
// implementation however.
#[cfg(all(nightly, any(feature = "std", feature = "spantrace")))]
pub fn temporary_provider(context: &impl Context) -> impl Provider + '_ {
    struct ProviderImpl<'a, C>(&'a C);
    impl<C: Context> Provider for ProviderImpl<'_, C> {
        fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
            self.0.provide(demand);
        }
    }
    ProviderImpl(context)
}

#[cfg(feature = "std")]
impl<C: std::error::Error + Send + Sync + 'static> Context for C {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        if let Some(backtrace) = self.backtrace() {
            demand.provide_ref(backtrace);
        }
    }
}
