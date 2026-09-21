//! Failures while preparing a visibility cache entry.

use core::fmt;

/// A failure preparing a visibility cache entry.
#[derive(Debug)]
pub(crate) enum VisibilityCacheError {
    /// The offloaded schedule construction panicked or its worker returned no value.
    ///
    /// Both [`OffloadError`](crate::offload::OffloadError) cases collapse into this context.
    Panic,
}

impl fmt::Display for VisibilityCacheError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Panic => write!(fmt, "visibility cache panicked"),
        }
    }
}

impl core::error::Error for VisibilityCacheError {}
