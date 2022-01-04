//! Contains predefined [`TypeTag`]s used by a [`Report`].
//!
//! [`Report`]: crate::Report

use core::panic::Location;

use provider::TypeTag;

use crate::Frame;

/// The [`Location`] where a [`Frame`] was created.
///
/// This may be overwritten by a [`Provider`], otherwise it's generated.
///
/// [`Frame`]: crate::Frame
/// [`Provider`]: provider::Provider
pub struct FrameLocation;

impl<'p> TypeTag<'p> for FrameLocation {
    type Type = &'static Location<'static>;
}

/// The lower-level source of this a [`Frame`].
///
/// [`Frame`]: crate::Frame
pub struct FrameSource;

impl<'p> TypeTag<'p> for FrameSource {
    type Type = &'p Frame;
}

/// The [`Backtrace`] of the [`Report`].
///
/// This may be provided by a [`Provider`], otherwise it is generated.
///
/// [`Backtrace`]: std::backtrace::Backtrace
/// [`Report`]: crate::Report
/// [`Provider`]: provider::Provider
#[cfg(feature = "backtrace")]
pub struct ReportBackTrace;

#[cfg(feature = "backtrace")]
impl<'p> TypeTag<'p> for ReportBackTrace {
    type Type = &'p std::backtrace::Backtrace;
}

/// The [`SpanTrace`] of the [`Report`].
///
/// This may be provided by a [`Provider`], otherwise it is generated.
///
/// [`SpanTrace`]: tracing_error::SpanTrace
/// [`Report`]: crate::Report
/// [`Provider`]: provider::Provider
#[cfg(feature = "spantrace")]
pub struct ReportSpanTrace;

#[cfg(feature = "spantrace")]
impl<'p> TypeTag<'p> for ReportSpanTrace {
    type Type = &'p tracing_error::SpanTrace;
}
