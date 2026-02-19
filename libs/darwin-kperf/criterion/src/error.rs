//! Error type for hardware counter initialization.

use core::{error, fmt};

/// An error from [`HardwareCounter`](crate::HardwareCounter) construction.
///
/// On macOS this wraps [`SamplerError`](darwin_kperf::SamplerError). On other
/// platforms the constructors are infallible, so this type is uninhabited.
#[cfg(target_os = "macos")]
pub struct MeasurementError(darwin_kperf::SamplerError);

#[cfg(not(target_os = "macos"))]
pub struct MeasurementError(core::convert::Infallible);

#[cfg(target_os = "macos")]
impl MeasurementError {
    /// Returns the underlying [`SamplerError`](darwin_kperf::SamplerError).
    ///
    /// This method is only available on macOS.
    #[must_use]
    pub fn into_inner(self) -> darwin_kperf::SamplerError {
        self.0
    }
}

impl fmt::Debug for MeasurementError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for MeasurementError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[cfg(target_os = "macos")]
impl error::Error for MeasurementError {
    fn source(&self) -> Option<&(dyn error::Error + 'static)> {
        Some(&self.0)
    }
}

#[cfg(not(target_os = "macos"))]
impl error::Error for MeasurementError {}

#[cfg(target_os = "macos")]
impl From<darwin_kperf::SamplerError> for MeasurementError {
    fn from(error: darwin_kperf::SamplerError) -> Self {
        Self(error)
    }
}
