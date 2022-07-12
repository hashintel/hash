use alloc::boxed::Box;
#[cfg(nightly)]
use core::any::Demand;
use core::{fmt, panic::Location};
#[cfg(all(nightly, feature = "std"))]
use std::{
    backtrace::{Backtrace, BacktraceStatus},
    ops::Deref,
};

use anyhow::Error as AnyhowError;

use crate::{compat::IntoReportCompat, Context, Frame, Report, Result};

/// A [`Context`] wrapper for [`anyhow::Error`].
///
/// It provides the [`anyhow::Error`] and [`Backtrace`] if it was captured.
#[repr(transparent)]
pub struct AnyhowContext(AnyhowError);

impl AnyhowContext {
    /// Returns a reference to the underlying [`anyhow::Error`].
    #[must_use]
    pub const fn as_anyhow(&self) -> &AnyhowError {
        &self.0
    }
}

impl fmt::Debug for AnyhowContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for AnyhowContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl Context for AnyhowContext {
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

impl<T> IntoReportCompat for core::result::Result<T, AnyhowError> {
    type Err = AnyhowContext;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, AnyhowContext> {
        match self {
            Ok(t) => Ok(t),
            Err(anyhow) => {
                // we cannot use `Report::new()` directly, due to the fact that it captures traces,
                // regardless of the fact if anyhow already provided one.

                // only capture a backtrace if needed, otherwise the anyhow context provides one
                #[cfg(all(nightly, feature = "std"))]
                let backtrace = anyhow
                    .deref()
                    .backtrace()
                    .filter(|bt| matches!(bt.status(), std::backtrace::BacktraceStatus::Captured))
                    .is_none()
                    .then(Backtrace::capture)
                    .filter(|bt| matches!(bt.status(), std::backtrace::BacktraceStatus::Captured));

                #[cfg(feature = "spantrace")]
                let spantrace = Some(tracing_error::SpanTrace::capture())
                    .filter(|st| st.status() == tracing_error::SpanTraceStatus::CAPTURED);

                #[cfg(feature = "std")]
                let sources = anyhow
                    .chain()
                    .skip(1)
                    .map(ToString::to_string)
                    .collect::<alloc::vec::Vec<_>>();

                #[allow(unused_mut)]
                let mut report = Report::from_frame(Frame::from_context(
                    AnyhowContext(anyhow),
                    Location::caller(),
                    Box::new([]),
                ));

                #[cfg(all(nightly, feature = "std"))]
                if let Some(backtrace) = backtrace {
                    report = report.attach(backtrace);
                }

                #[cfg(feature = "spantrace")]
                if let Some(spantrace) = spantrace {
                    report = report.attach(spantrace);
                }

                #[cfg(feature = "std")]
                for source in sources {
                    report = report.attach_printable(source);
                }

                Err(report)
            }
        }
    }
}
