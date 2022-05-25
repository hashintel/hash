#[cfg(feature = "std")]
use crate::Report;
use crate::{Context, Message, Result};

/// Extension trait for [`Result`][core::result::Result] to provide context information on
/// [`Report`]s.
pub trait ResultExt<T> {
    /// Type of the resulting context `C` inside of [`Report<C>`] when not providing a context.
    type Context;

    /// Adds new contextual message to the [`Frame`] stack of a [`Report`].
    ///
    /// [`Frame`]: crate::Frame
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
    /// [`Frame`]: crate::Frame
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
    ///
    /// [`Frame`]: crate::Frame
    // TODO: come up with a decent example
    fn provide_context<C>(self, context: C) -> Result<T, C>
    where
        C: Context;

    /// Lazily adds a context provider to the [`Frame`] stack of a [`Report`] returning
    /// [`Result<T, C>`]).
    ///
    /// [`Frame`]: crate::Frame
    // TODO: come up with a decent example
    fn provide_context_lazy<C, F>(self, op: F) -> Result<T, C>
    where
        C: Context,
        F: FnOnce() -> C;
}

#[cfg(feature = "std")]
impl<T, E> ResultExt<T> for std::result::Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    type Context = ();

    #[track_caller]
    fn wrap_err<M>(self, message: M) -> Result<T>
    where
        M: Message,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(error) => Err(Report::from(error).wrap(message)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, message: F) -> Result<T, Self::Context>
    where
        M: Message,
        F: FnOnce() -> M,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(error) => Err(Report::from(error).wrap(message())),
        }
    }

    #[track_caller]
    fn provide_context<C>(self, context: C) -> Result<T, C>
    where
        C: Context,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(error) => Err(Report::from(error).provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<C, F>(self, context: F) -> Result<T, C>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(error) => Err(Report::from(error).provide_context(context())),
        }
    }
}

impl<T, C> ResultExt<T> for Result<T, C> {
    type Context = C;

    #[track_caller]
    fn wrap_err<M>(self, message: M) -> Self
    where
        M: Message,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.wrap(message)),
        }
    }

    #[track_caller]
    fn wrap_err_lazy<M, F>(self, message: F) -> Result<T, Self::Context>
    where
        M: Message,
        F: FnOnce() -> M,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.wrap(message())),
        }
    }

    #[track_caller]
    fn provide_context<C2>(self, context: C2) -> Result<T, C2>
    where
        C2: Context,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.provide_context(context)),
        }
    }

    #[track_caller]
    fn provide_context_lazy<C2, F>(self, context: F) -> Result<T, C2>
    where
        C2: Context,
        F: FnOnce() -> C2,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.provide_context(context())),
        }
    }
}
