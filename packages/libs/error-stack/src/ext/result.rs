use core::fmt;

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
/// # impl error_stack::Context for AccessError {}
/// use error_stack::{ensure, Result};
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

    /// Adds new contextual information to the [`Frame`] stack of a [`Report`].
    ///
    /// This behaves like [`attach_printable()`] but will not be shown when printing the [`Report`].
    ///
    /// **Note:** [`attach_printable()`] will be deprecated when specialization is stabilized. If
    /// `T` implements [`Display`] or [`Debug`] these implementations will be used.
    ///
    /// [`Display`]: core::fmt::Display
    /// [`Debug`]: core::fmt::Debug
    /// [`attach_printable()`]: Self::attach_printable
    /// [`Frame`]: crate::Frame
    #[must_use]
    fn attach<A>(self, attachment: A) -> Self
    where
        A: Send + Sync + 'static;

    /// Lazily adds new contextual information to the [`Frame`] stack of a [`Report`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// This behaves like [`attach_printable_lazy()`] but will not be shown when printing the
    /// [`Report`].
    ///
    /// **Note:** [`attach_printable_lazy()`] will be deprecated when specialization is stabilized.
    /// If `T` implements [`Display`] or [`Debug`] these implementations will be used.
    ///
    /// [`Display`]: core::fmt::Display
    /// [`Debug`]: core::fmt::Debug
    /// [`attach_printable_lazy()`]: Self::attach_printable_lazy
    /// [`Frame`]: crate::Frame
    #[must_use]
    fn attach_lazy<A, F>(self, attachment: F) -> Self
    where
        A: Send + Sync + 'static,
        F: FnOnce() -> A;

    /// Adds new contextual information to the [`Frame`] stack of a [`Report`].
    ///
    /// This behaves like [`attach()`] but will also be shown when printing the [`Report`].
    ///
    /// **Note:** This will be deprecated in favor of [`attach()`] when specialization is
    /// stabilized.
    ///
    /// [`attach()`]: Self::attach
    /// [`Frame`]: crate::Frame
    ///
    /// # Example
    ///
    /// ```
    /// # use error_stack::Result;
    /// # fn load_resource(_: &User, _: &Resource) -> Result<(), ()> { Ok(()) }
    /// # struct User;
    /// # struct Resource;
    /// use error_stack::ResultExt;
    ///
    /// # let user = User;
    /// # let resource = Resource;
    /// # #[allow(unused_variables)]
    /// let resource = load_resource(&user, &resource).attach_printable("Could not load resource")?;
    /// # Result::Ok(())
    /// ```
    #[must_use]
    fn attach_printable<A>(self, attachment: A) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static;

    /// Lazily adds new contextual information to the [`Frame`] stack of a [`Report`].
    ///
    /// The function is only executed in the `Err` arm.
    ///
    /// This behaves like [`attach_lazy()`] but will also be shown when printing the [`Report`].
    ///
    /// **Note:** This will be deprecated in favor of [`attach_lazy()`] when specialization is
    /// stabilized.
    ///
    /// [`attach_lazy()`]: Self::attach_lazy
    /// [`Frame`]: crate::Frame
    ///
    /// # Example
    ///
    /// ```
    /// # use core::fmt;
    /// # use error_stack::Result;
    /// # fn load_resource(_: &User, _: &Resource) -> Result<(), ()> { Ok(()) }
    /// # struct User;
    /// # struct Resource;
    /// # impl fmt::Display for Resource { fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
    /// use error_stack::ResultExt;
    ///
    /// # let user = User;
    /// # let resource = Resource;
    /// # #[allow(unused_variables)]
    /// let resource = load_resource(&user, &resource)
    ///     .attach_printable_lazy(|| format!("Could not load resource {resource}"))?;
    /// # Result::Ok(())
    /// ```
    #[must_use]
    fn attach_printable_lazy<A, F>(self, attachment: F) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> A;

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
    fn change_context_lazy<C, F>(self, context: F) -> Result<Self::Ok, C>
    where
        C: Context,
        F: FnOnce() -> C;
}

impl<T, C> ResultExt for Result<T, C> {
    type Ok = T;

    #[track_caller]
    fn attach<A>(self, attachment: A) -> Self
    where
        A: Send + Sync + 'static,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.attach(attachment)),
        }
    }

    #[track_caller]
    fn attach_lazy<A, F>(self, attachment: F) -> Self
    where
        A: Send + Sync + 'static,
        F: FnOnce() -> A,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.attach(attachment())),
        }
    }

    #[track_caller]
    fn attach_printable<A>(self, attachment: A) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.attach_printable(attachment)),
        }
    }

    #[track_caller]
    fn attach_printable_lazy<A, F>(self, attachment: F) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> A,
    {
        // Can't use `map_err` as `#[track_caller]` is unstable on closures
        match self {
            Ok(ok) => Ok(ok),
            Err(report) => Err(report.attach_printable(attachment())),
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
