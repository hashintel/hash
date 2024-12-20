//! Extension traits for `Report` and `Result`.
//!
//! These traits are currently unstable and require the `unstable` feature flag to be enabled.
//! They provide additional functionality and convenience methods for error handling and
//! manipulation.
//!
//! # Note
//!
//! The traits and methods in this module are subject to change and may be modified or
//! removed in future versions. Use them with caution in production environments.

pub(crate) mod iter;
#[cfg(feature = "futures")]
pub(crate) mod stream;
pub(crate) mod tuple;

#[cfg(feature = "futures")]
pub use self::stream::{TryCollectReports, TryReportStreamExt};
pub use self::{iter::TryReportIteratorExt, tuple::TryReportTupleExt};
