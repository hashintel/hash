//! Compatibility module to convert errors from other libraries into [`Report`].
//!
//! In order to convert these error types, use [`IntoReportCompat::into_report()`].

use crate::Report;

#[cfg(feature = "anyhow")]
mod anyhow;
#[cfg(feature = "eyre")]
mod eyre;

/// Compatibility trait to convert from external libraries to [`Report`].
///
/// **Note**: It's not possible to implement [`Context`] on other error libraries' types from within
/// `error-stack` as the trait has a blanket implementation relying on [`Error`]. Thus, implementing
/// the trait would violate the orphan rule; the upstream crate could implement [`Error`] and this
/// would imply an implementation for [`Context`]. This also implies, that it's not possible to
/// implement [`ResultExt`] from within `error-stack`.
///
/// [`ResultExt`]: crate::ResultExt
/// [`Context`]: crate::Context
/// [`Error`]: core::error::Error
pub trait IntoReportCompat: Sized {
    /// Type of the [`Ok`] value in the [`Result`]
    type Ok;

    /// Type of the resulting [`Err`] variant wrapped inside a [`Report<E>`].
    ///
    /// [`Report<E>`]: crate::Report
    type Err;

    /// Converts the [`Err`] variant of the [`Result`] to a [`Report`]
    ///
    /// [`Report`]: crate::Report
    fn into_report(self) -> Result<Self::Ok, Report<Self::Err>>;
}
