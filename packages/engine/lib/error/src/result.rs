use core::fmt;

#[cfg(nightly)]
use crate::provider::Provider;
use crate::{Context, Report};

/// [`Result`](std::result::Result)`<T, `[`Report<C>`](Report)`>`
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
/// # fn get_user() -> Result<usize, AccessError> { Ok(0) }
/// # fn get_resource() -> Result<usize, AccessError> { Ok(0) }
/// # #[derive(Debug)] enum AccessError { PermissionDenied(usize, usize) }
/// # impl core::fmt::Display for AccessError {
/// #    fn fmt(&self, _: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { Ok(()) }
/// # }
/// # impl error::Context for AccessError {}
/// use error::{ensure, Result};
///
/// fn main() -> Result<(), AccessError> {
///     let user = get_user()?;
///     let resource = get_resource()?;
///
///     ensure!(
///         has_permission(user, resource),
///         AccessError::PermissionDenied(user, resource)
///     );
///
///     # const _: &str = stringify! {
///     ...
///     # }; Ok(())
/// }
/// ```
pub type Result<T, C> = core::result::Result<T, Report<C>>;

/// Extension trait for [`Result`][core::result::Result] to provide context information on
/// [`Report`]s.
pub trait ResultExt {
    /// Type of the [`Ok`] value in the [`Result`]
    type Ok;

    /// Adds new contextual message to the [`Frame`] stack of a [`Report`].
    ///
    /// [`Frame`]: crate::Frame
    ///
    /// # Example
    ///
    /// ```
    /// # use error::Result;
    /// # fn load_resource(_: &User, _: &Resource) -> Result<(), ()> { Ok(()) }
    /// # struct User;
    /// # struct Resource;
    /// use error::ResultExt;
    ///
    /// # let user = User;
    /// # let resource = Resource;
    /// # #[allow(unused_variables)]
    /// let resource = load_resource(&user, &resource).attach_message("Could not load resource")?;
    /// # Result::Ok(())
    /// ```
    #[must_use]
    fn attach_message<M>(self, message: M) -> Self
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static;

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
    /// # fn load_resource(_: &User, _: &Resource) -> Result<(), ()> { Ok(()) }
    /// # struct User;
    /// # struct Resource;
    /// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
    /// use error::ResultExt;
    ///
    /// # let user = User;
    /// # let resource = Resource;
    /// # #[allow(unused_variables)]
    /// let resource = load_resource(&user, &resource)
    ///     .attach_message_lazy(|| format!("Could not load resource {resource}"))?;
    /// # Result::Ok(())
    /// ```
    #[must_use]
    fn attach_message_lazy<M, F>(self, op: F) -> Self
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> M;

    /// Adds a [`Provider`] to the [`Frame`] stack.
    ///
    /// The provider is used to [`provide`] values either by calling
    /// [`request_ref()`]/[`request_value()`] to return an iterator over all specified values, or by
    /// using the [`Provider`] implementation on a [`Frame`].
    ///
    /// [`provide`]: Provider::provide
    /// [`request_ref()`]: crate::Report::request_ref
    /// [`request_value()`]: crate::Report::request_value
    /// [`Frame`]: crate::Frame
    #[cfg(nightly)]
    #[must_use]
    fn attach_provider<P>(self, provider: P) -> Self
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static;

    /// Lazily adds a [`Provider`] to the [`Frame`] stack.
    ///
    /// The provider is used to [`provide`] values either by calling
    /// [`request_ref()`]/[`request_value()`] to return an iterator over all specified values, or by
    /// using the [`Provider`] implementation on a [`Frame`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// [`provide`]: Provider::provide
    /// [`request_ref()`]: crate::Report::request_ref
    /// [`request_value()`]: crate::Report::request_value
    /// [`Frame`]: crate::Frame
    #[cfg(nightly)]
    #[must_use]
    fn attach_provider_lazy<P, F>(self, provider: F) -> Self
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> P;

    /// Adds the provided object to the [`Frame`] stack.
    ///
    /// The object can later be retrieved by calling [`request_value()`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// [`request_ref()`]: crate::Report::request_ref
    /// [`Frame`]: crate::Frame
    #[cfg(nightly)]
    #[must_use]
    fn provide<P>(self, provided: P) -> Self
    where
        P: fmt::Display + fmt::Debug + Send + Sync + 'static;

    /// Lazily adds the provided object to the [`Frame`] stack.
    ///
    /// The object can later be retrieved by calling [`request_value()`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// [`request_ref()`]: crate::Report::request_ref
    /// [`Frame`]: crate::Frame
    #[cfg(nightly)]
    #[must_use]
    fn provide_lazy<P, F>(self, provided: F) -> Self
    where
        P: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> P;

    /// Changes the [`Context`] of a [`Report`] returning [`Result<T, C>`].
    ///
    /// Please see the [`Context`] documentation for more information.
    ///
    /// [`Frame`]: crate::Frame
    // TODO: come up with a decent example
    fn change_context<C>(self, context: C) -> Result<Self::Ok, C>
    where
        C: Context;

    /// Lazily changes the [`Context`] of a [`Report`] returning [`Result<T, C>`].
    ///
    /// Please see the [`Context`] documentation for more information.
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// [`Frame`]: crate::Frame
    // TODO: come up with a decent example
    fn change_context_lazy<C, F>(self, op: F) -> Result<Self::Ok, C>
    where
        C: Context,
        F: FnOnce() -> C;

    // TODO: Temporary, remove before releasing
    //   Currently only used to be backward compatible with hEngine. After binaries and orchestrator
    //   are adjusted, this can safely be removed.
    #[doc(hidden)]
    fn generalize(self) -> Result<Self::Ok, ()>;
}

impl<T, C> ResultExt for Result<T, C> {
    type Ok = T;

    #[track_caller]
    fn attach_message<M>(self, message: M) -> Self
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.attach_message(message)),
        }
    }

    #[track_caller]
    fn attach_message_lazy<M, F>(self, message: F) -> Self
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> M,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.attach_message(message())),
        }
    }

    #[cfg(nightly)]
    #[track_caller]
    fn provide<P>(self, provided: P) -> Self
    where
        P: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.provide(provided)),
        }
    }

    #[cfg(nightly)]
    #[track_caller]
    fn provide_lazy<P, F>(self, provided: F) -> Self
    where
        P: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> P,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.provide(provided())),
        }
    }

    #[cfg(nightly)]
    #[track_caller]
    fn attach_provider<P>(self, provider: P) -> Self
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.attach_provider(provider)),
        }
    }

    #[cfg(nightly)]
    #[track_caller]
    fn attach_provider_lazy<P, F>(self, provider: F) -> Self
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> P,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.attach_provider(provider())),
        }
    }

    #[track_caller]
    fn change_context<C2>(self, context: C2) -> Result<T, C2>
    where
        C2: Context,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.change_context(context)),
        }
    }

    #[track_caller]
    fn change_context_lazy<C2, F>(self, context: F) -> Result<T, C2>
    where
        C2: Context,
        F: FnOnce() -> C2,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.change_context(context())),
        }
    }

    fn generalize(self) -> Result<T, ()> {
        self.map_err(Report::generalize)
    }
}

/// Extends [`Result`] to convert the [`Err`] variant to a [`Report`]
pub trait IntoReport: Sized {
    /// Type of the [`Ok`] value in the [`Result`]
    type Ok;

    /// Type of the resulting [`Err`] variant wrapped inside a [`Report<E>`].
    type Err;

    /// Converts the [`Err`] variant of the [`Result`] to a [`Report`]
    fn report(self) -> Result<Self::Ok, Self::Err>;
}

impl<T, E> IntoReport for core::result::Result<T, E>
where
    Report<E>: From<E>,
{
    type Err = E;
    type Ok = T;

    #[track_caller]
    fn report(self) -> Result<T, E> {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(Report::from(error)),
        }
    }
}
