#[cfg(any(feature = "std", rust_1_81))]
use alloc::string::{String, ToString};
#[cfg(rust_1_81)]
use core::error::Error;
#[cfg(nightly)]
use core::error::Request;
use core::{any::TypeId, fmt, mem, panic::Location};
#[cfg(all(feature = "std", not(rust_1_81)))]
use std::error::Error;

use crate::{Report, ResultExt};

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
    #[cfg(any(feature = "std", rust_1_81))]
    fn __source(&self) -> Option<&(dyn Error + 'static)> {
        None
    }
}

/// Captures an error message as the context of a [`Report`].
#[cfg(any(feature = "std", rust_1_81))]
pub(crate) struct SourceContext(String);

#[cfg(any(feature = "std", rust_1_81))]
impl SourceContext {
    pub(crate) fn from_error(value: &dyn Error) -> Self {
        Self(value.to_string())
    }
}

#[cfg(any(feature = "std", rust_1_81))]
impl fmt::Debug for SourceContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

#[cfg(any(feature = "std", rust_1_81))]
impl fmt::Display for SourceContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[cfg(any(feature = "std", rust_1_81))]
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

#[cfg(any(feature = "std", rust_1_81))]
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

/// `ThinContext` behaves as an `error_stack::ContextExt`
/// ideally used for zero sized errors or ones that hold a `'static` ref/value
pub trait ThinContext
where
    Self: Sized + Context,
{
    const VALUE: Self;

    fn new() -> Report<Self> {
        Report::new(Self::VALUE)
    }
}

pub trait IntoContext {
    fn into_ctx<C2: ThinContext>(self) -> Report<C2>;
}

impl<C: 'static> IntoContext for Report<C> {
    #[inline]
    #[track_caller]
    fn into_ctx<C2: ThinContext>(self) -> Report<C2> {
        // attach another location if C and C2 match instead of creating a new context
        if TypeId::of::<C>() == TypeId::of::<C2>() {
            unsafe {
                // SAFETY: if C and C2 are a constant value and have the same TypeId then they are
                // covariant
                return mem::transmute::<Self, Report<C2>>(self.attach(*Location::caller()));
            }
        }
        self.change_context(C2::VALUE)
    }
}

pub trait ResultIntoContext: ResultExt {
    fn into_ctx<C2: ThinContext>(self) -> Result<Self::Ok, Report<C2>>;
    // Result::and_then
    fn and_then_ctx<U, F, C2>(self, op: F) -> Result<U, Report<C2>>
    where
        C2: ThinContext,
        F: FnOnce(Self::Ok) -> Result<U, Report<C2>>;
    // Result::map
    fn map_ctx<U, F, C2>(self, op: F) -> Result<U, Report<C2>>
    where
        C2: ThinContext,
        F: FnOnce(Self::Ok) -> U;
}

impl<T, C> ResultIntoContext for Result<T, Report<C>>
where
    C: Context,
{
    #[inline]
    #[track_caller]
    fn into_ctx<C2: ThinContext>(self) -> Result<T, Report<C2>> {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.into_ctx()),
        }
    }

    #[inline]
    #[track_caller]
    fn and_then_ctx<U, F, C2>(self, op: F) -> Result<U, Report<C2>>
    where
        C2: ThinContext,
        F: FnOnce(T) -> Result<U, Report<C2>>,
    {
        match self {
            Ok(t) => op(t),
            Err(ctx) => Err(ctx.into_ctx()),
        }
    }

    #[inline]
    #[track_caller]
    fn map_ctx<U, F, C2>(self, op: F) -> Result<U, Report<C2>>
    where
        C2: ThinContext,
        F: FnOnce(T) -> U,
    {
        match self {
            Ok(t) => Ok(op(t)),
            Err(ctx) => Err(ctx.into_ctx()),
        }
    }
}
