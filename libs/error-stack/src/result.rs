#![expect(deprecated, reason = "We use `Context` to maintain compatibility")]

use core::fmt;

use crate::{Context, IntoReport, Report};

#[expect(rustdoc::invalid_html_tags, reason = "False positive")]
/// <code>[Result](core::result::Result)<T, [Report<C>]></code>
///
/// A reasonable return type to use throughout an application.
///
/// The `Result` type can be used with one or two parameters, where the first parameter represents
/// the [`Ok`] arm and the second parameter `Error` is used as in [`Report<C>`].
///
/// # Examples
///
/// `Result` can also be used in `fn main()`:
///
/// ```rust
/// # fn has_permission(_: (), _: ()) -> bool { true }
/// # fn get_user() -> Result<(), AccessError> { Ok(()) }
/// # fn get_resource() -> Result<(), Report<AccessError>> { Ok(()) }
/// # #[derive(Debug)] enum AccessError { PermissionDenied((), ()) }
/// # impl core::fmt::Display for AccessError {
/// #    fn fmt(&self, _: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { Ok(()) }
/// # }
/// # impl core::error::Error for AccessError {}
/// use error_stack::{ensure, Report};
///
/// fn main() -> Result<(), Report<AccessError>> {
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
#[deprecated(
    note = "Use `core::result::Result<T, Report<C>>` instead",
    since = "0.6.0"
)]
pub type Result<T, C> = core::result::Result<T, Report<C>>;

/// Extension trait for [`Result`][core::result::Result] to provide context information on
/// [`Report`]s.
pub trait ResultExt {
    /// The [`Context`] type of the [`Result`].
    type Context: ?Sized;

    /// Type of the [`Ok`] value in the [`Result`]
    type Ok;

    /// Adds a new attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more information.
    fn attach<A>(self, attachment: A) -> core::result::Result<Self::Ok, Report<Self::Context>>
    where
        A: Send + Sync + 'static;

    /// Lazily adds a new attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more information.
    fn attach_lazy<A, F>(
        self,
        attachment: F,
    ) -> core::result::Result<Self::Ok, Report<Self::Context>>
    where
        A: Send + Sync + 'static,
        F: FnOnce() -> A;

    /// Adds a new printable attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach_printable`] on the [`Err`] variant, refer to it for more
    /// information.
    fn attach_printable<A>(
        self,
        attachment: A,
    ) -> core::result::Result<Self::Ok, Report<Self::Context>>
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static;

    /// Lazily adds a new printable attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach_printable`] on the [`Err`] variant, refer to it for more
    /// information.
    fn attach_printable_lazy<A, F>(
        self,
        attachment: F,
    ) -> core::result::Result<Self::Ok, Report<Self::Context>>
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> A;

    /// Changes the context of the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
    fn change_context<C>(self, context: C) -> core::result::Result<Self::Ok, Report<C>>
    where
        C: Context;

    /// Lazily changes the context of the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
    fn change_context_lazy<C, F>(self, context: F) -> core::result::Result<Self::Ok, Report<C>>
    where
        C: Context,
        F: FnOnce() -> C;
}

impl<T, E> ResultExt for core::result::Result<T, E>
where
    E: IntoReport,
{
    type Context = E::Context;
    type Ok = T;

    #[track_caller]
    fn attach<A>(self, attachment: A) -> core::result::Result<T, Report<E::Context>>
    where
        A: Send + Sync + 'static,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().attach(attachment)),
        }
    }

    #[track_caller]
    fn attach_lazy<A, F>(self, attachment: F) -> core::result::Result<T, Report<E::Context>>
    where
        A: Send + Sync + 'static,
        F: FnOnce() -> A,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().attach(attachment())),
        }
    }

    #[track_caller]
    fn attach_printable<A>(self, attachment: A) -> core::result::Result<T, Report<E::Context>>
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().attach_printable(attachment)),
        }
    }

    #[track_caller]
    fn attach_printable_lazy<A, F>(
        self,
        attachment: F,
    ) -> core::result::Result<T, Report<E::Context>>
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
        F: FnOnce() -> A,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().attach_printable(attachment())),
        }
    }

    #[track_caller]
    fn change_context<C>(self, context: C) -> core::result::Result<T, Report<C>>
    where
        C: Context,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().change_context(context)),
        }
    }

    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> core::result::Result<T, Report<C>>
    where
        C: Context,
        F: FnOnce() -> C,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().change_context(context())),
        }
    }
}
