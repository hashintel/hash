#[cfg(feature = "anyhow")]
mod anyhow;
#[cfg(feature = "eyre")]
mod eyre;

/// Compatibility trait to convert from external libraries to [`Report`].
///
/// [`Report`]: crate::Report
#[cfg(any(feature = "anyhow", feature = "eyre"))]
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
    fn into_report(self) -> crate::Result<Self::Ok, Self::Err>;
}
