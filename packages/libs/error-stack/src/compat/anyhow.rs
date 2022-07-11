#[cfg(nightly)]
use core::any::Demand;
use core::{fmt, panic::Location};
#[cfg(all(nightly, feature = "std"))]
use std::{backtrace::Backtrace, error::Error};

use anyhow::Error as AnyhowError;

use crate::{Context, Frame, IntoReportCompat, Report, Result};

#[repr(transparent)]
struct AnyhowContext(AnyhowError);

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
        if let Some(backtrace) = self.0.chain().find_map(Error::backtrace) {
            demand.provide_ref(backtrace);
        }
    }
}

impl<T> IntoReportCompat for core::result::Result<T, AnyhowError> {
    type Err = AnyhowError;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, AnyhowError> {
        match self {
            Ok(t) => Ok(t),
            Err(anyhow) => {
                #[cfg(all(nightly, feature = "std"))]
                let backtrace = anyhow
                    .chain()
                    .all(|error| error.backtrace().is_none())
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
                let mut report =
                    Report::from_frame(Frame::from_context(AnyhowContext(anyhow), Location::caller(), None));

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

#[cfg(test)]
mod tests {
    use anyhow::anyhow;

    #[allow(clippy::wildcard_imports)]
    use crate::{test_helper::*, IntoReportCompat};

    #[test]
    fn conversion() {
        let anyhow: Result<(), _> = Err(anyhow!("A").context("B").context("C"));

        let report = anyhow.into_report().unwrap_err();
        #[cfg(feature = "std")]
        let expected_output = ["A", "B", "C"];
        #[cfg(not(feature = "std"))]
        let expected_output = ["C"];
        for (anyhow, expected) in messages(&report).into_iter().zip(expected_output) {
            assert_eq!(anyhow, expected);
        }
    }
}
