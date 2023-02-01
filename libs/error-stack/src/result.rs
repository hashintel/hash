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

    /// Adds a new attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more information.
    #[must_use]
    fn attach<A>(self, attachment: A) -> Self
    where
        A: Send + Sync + 'static;

    /// Lazily adds a new attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more information.
    #[must_use]
    fn attach_lazy<A, F>(self, attachment: F) -> Self
    where
        A: Send + Sync + 'static,
        F: FnOnce() -> A;

    /// Adds a new printable attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach_printable`] on the [`Err`] variant, refer to it for more
    /// information.
    #[must_use]
    fn attach_printable<A>(self, attachment: A) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static;

    /// Lazily adds a new printable attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach_printable`] on the [`Err`] variant, refer to it for more
    /// information.
    #[must_use]
    fn attach_printable_lazy<A, F>(self, attachment: F) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> A;

    /// Changes the context of the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
    fn change_context<C>(self, context: C) -> Result<Self::Ok, C>
    where
        C: Context;

    /// Lazily changes the context of the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
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
    fn into_report(self) -> Result<Self::Ok, Self::Err>;
}

impl<T, E> IntoReport for core::result::Result<T, E>
where
    Report<E>: From<E>,
{
    type Err = E;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, E> {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(Report::from(error)),
        }
    }
}
