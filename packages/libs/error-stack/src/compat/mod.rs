//! Compatibility module to convert errors from other libraries into [`Report`].
//!
//! In order to convert these error types, use [`IntoReportCompat::into_report()`].
//!
//! [`Report`]: crate::Report

use crate::Report;

#[cfg(feature = "anyhow")]
mod anyhow;
#[cfg(feature = "eyre")]
mod eyre;

/// Compatibility trait to convert from external libraries to [`Report`].
///
/// *Note*: It's not possible to implement [`IntoReport`] or [`Context`] on other error libraries'
/// types as both traits have blanket implementation relying on [`Error`]. Thus, implementing either
/// trait would violate the orphan rule; the upstream crate could implement [`Error`] and this would
/// imply an implementation for [`IntoReport`]/[`Context`].
///
/// [`Report`]: crate::Report
/// [`IntoReport`]: crate::IntoReport
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
