use core::error::Error;

use crate::{Attachment, IntoReport, OpaqueAttachment, Report};

/// Extension trait for [`Result`] to provide context information on
/// [`Report`]s.
pub trait ResultExt {
    /// The context type of the [`Result`] which becomes the `C` in `Report<C>`.
    type Context: ?Sized;

    /// Type of the [`Ok`] value in the [`Result`].
    type Ok;

    /// Adds a new printable attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more
    /// information.
    fn attach<A>(self, attachment: A) -> Result<Self::Ok, Report<Self::Context>>
    where
        A: Attachment;

    /// Lazily adds a new printable attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach`] on the [`Err`] variant, refer to it for more
    /// information.
    fn attach_with<A, F>(self, attachment: F) -> Result<Self::Ok, Report<Self::Context>>
    where
        A: Attachment,
        F: FnOnce() -> A;

    /// Adds a new attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach_opaque`] on the [`Err`] variant, refer to it for more information.
    fn attach_opaque<A>(self, attachment: A) -> Result<Self::Ok, Report<Self::Context>>
    where
        A: OpaqueAttachment;

    /// Lazily adds a new attachment to the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::attach_opaque`] on the [`Err`] variant, refer to it for more information.
    fn attach_opaque_with<A, F>(self, attachment: F) -> Result<Self::Ok, Report<Self::Context>>
    where
        A: OpaqueAttachment,
        F: FnOnce() -> A;

    /// Changes the context of the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
    fn change_context<C>(self, context: C) -> Result<Self::Ok, Report<C>>
    where
        C: Error + Send + Sync + 'static;

    /// Lazily changes the context of the [`Report`] inside the [`Result`].
    ///
    /// Applies [`Report::change_context`] on the [`Err`] variant, refer to it for more information.
    fn change_context_lazy<C, F>(self, context: F) -> Result<Self::Ok, Report<C>>
    where
        C: Error + Send + Sync + 'static,
        F: FnOnce() -> C;
}

impl<T, E> ResultExt for Result<T, E>
where
    E: IntoReport,
{
    type Context = E::Context;
    type Ok = T;

    #[track_caller]
    fn attach<A>(self, attachment: A) -> Result<T, Report<E::Context>>
    where
        A: Attachment,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().attach(attachment)),
        }
    }

    #[track_caller]
    fn attach_with<A, F>(self, attachment: F) -> Result<T, Report<E::Context>>
    where
        A: Attachment,
        F: FnOnce() -> A,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().attach(attachment())),
        }
    }

    #[track_caller]
    fn attach_opaque<A>(self, attachment: A) -> Result<T, Report<E::Context>>
    where
        A: OpaqueAttachment,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().attach_opaque(attachment)),
        }
    }

    #[track_caller]
    fn attach_opaque_with<A, F>(self, attachment: F) -> Result<T, Report<E::Context>>
    where
        A: OpaqueAttachment,
        F: FnOnce() -> A,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().attach_opaque(attachment())),
        }
    }

    #[track_caller]
    fn change_context<C>(self, context: C) -> Result<T, Report<C>>
    where
        C: Error + Send + Sync + 'static,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().change_context(context)),
        }
    }

    #[track_caller]
    fn change_context_lazy<C, F>(self, context: F) -> Result<T, Report<C>>
    where
        C: Error + Send + Sync + 'static,
        F: FnOnce() -> C,
    {
        match self {
            Ok(value) => Ok(value),
            Err(error) => Err(error.into_report().change_context(context())),
        }
    }
}
