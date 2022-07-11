#[cfg(nightly)]
use core::any::Demand;
use core::{fmt, panic::Location};
#[cfg(all(nightly, feature = "std"))]
use std::{
    backtrace::{Backtrace, BacktraceStatus},
    ops::Deref,
};

use eyre::Report as EyreReport;

use crate::{compat::IntoReportCompat, Context, Frame, Report, Result};

/// A [`Context`] wrapper for [`eyre::Report`].
///
/// It provides the [`eyre::Report`] and [`Backtrace`] if it was captured.
#[repr(transparent)]
pub struct EyreContext(EyreReport);

impl EyreContext {
    /// Returns a reference to the underlying [`anyhow::Error`].
    pub const fn as_eyre(&self) -> &EyreReport {
        &self.0
    }
}

impl fmt::Debug for EyreContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for EyreContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl Context for EyreContext {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);
        #[cfg(feature = "std")]
        if let Some(backtrace) = self
            .0
            .deref()
            .backtrace()
            .filter(|backtrace| backtrace.status() == BacktraceStatus::Captured)
        {
            demand.provide_ref(backtrace);
        }
    }
}

impl<T> IntoReportCompat for core::result::Result<T, EyreReport> {
    type Err = EyreContext;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, EyreContext> {
        match self {
            Ok(t) => Ok(t),
            Err(eyre) => {
                let sources = eyre
                    .chain()
                    .skip(1)
                    .map(alloc::string::ToString::to_string)
                    .collect::<alloc::vec::Vec<_>>();

                #[cfg(all(nightly, feature = "std"))]
                let backtrace = if eyre
                    .deref()
                    .backtrace()
                    .filter(|backtrace| backtrace.status() == BacktraceStatus::Captured)
                    .is_some()
                {
                    None
                } else {
                    Some(Backtrace::capture())
                };

                let mut report = Report::from_frame(
                    Frame::from_context(EyreContext(eyre), Location::caller(), None),
                    #[cfg(all(nightly, feature = "std"))]
                    backtrace,
                    #[cfg(feature = "spantrace")]
                    Some(tracing_error::SpanTrace::capture()),
                );

                for source in sources {
                    report = report.attach_printable(source);
                }

                Err(report)
            }
        }
    }
}
