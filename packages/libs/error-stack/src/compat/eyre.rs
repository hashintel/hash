#[cfg(nightly)]
use core::any::Demand;
use core::{fmt, panic::Location};
#[cfg(all(nightly, feature = "std"))]
use std::{backtrace::Backtrace, error::Error};

use eyre::Report as EyreReport;

use crate::{Context, Frame, IntoReportCompat, Report, Result};

#[repr(transparent)]
struct EyreContext(EyreReport);

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
        if let Some(backtrace) = self.0.chain().find_map(Error::backtrace) {
            demand.provide_ref(backtrace);
        }
    }
}

impl<T> IntoReportCompat for core::result::Result<T, EyreReport> {
    type Err = EyreReport;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, EyreReport> {
        match self {
            Ok(t) => Ok(t),
            Err(eyre) => {
                let sources = eyre
                    .chain()
                    .skip(1)
                    .map(alloc::string::ToString::to_string)
                    .collect::<alloc::vec::Vec<_>>();

                #[cfg(all(nightly, feature = "std"))]
                let backtrace = eyre
                    .chain()
                    .all(|error| error.backtrace().is_none())
                    .then(Backtrace::capture);

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
