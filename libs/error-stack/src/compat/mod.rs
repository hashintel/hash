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
/// **Note**: Most error libraries don't implement [`Error`], so it's not possible to directly
/// convert them to [`Report`]. However, `error-stack` supports converting errors generated from the
/// [`anyhow`] or [`eyre`] crate via [`IntoReportCompat`].
///
/// [`eyre`]: ::eyre
/// [`anyhow`]: ::anyhow
/// [`Error`]: core::error::Error
pub trait IntoReportCompat: Sized {
    /// Type of the [`Ok`] value in the [`Result`].
    type Ok;

    /// Type of the resulting [`Err`] variant wrapped inside a [`Report<E>`].
    ///
    /// [`Report<E>`]: crate::Report
    type Err;

    /// Converts the [`Err`] variant of the [`Result`] to a [`Report`].
    ///
    /// [`Report`]: crate::Report
    fn into_report(self) -> Result<Self::Ok, Report<Self::Err>>;
}
