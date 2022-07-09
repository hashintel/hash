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
                    Frame::from_compat::<EyreReport, EyreContext>(
                        EyreContext(eyre),
                        Location::caller(),
                    ),
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

#[cfg(test)]
mod tests {
    use alloc::boxed::Box;

    use eyre::eyre;

    use crate::{test_helper::messages, IntoReportCompat};

    #[test]
    #[cfg_attr(
        miri,
        ignore = "bug: miri is failing for `eyre`, this is unrelated to our implementation"
    )]
    fn conversion() {
        eyre::set_hook(Box::new(eyre::DefaultHandler::default_with)).expect("Could not set hook");

        let eyre: Result<(), _> = Err(eyre!("A").wrap_err("B").wrap_err("C"));

        let report = eyre.into_report().unwrap_err();
        let expected_output = ["A", "B", "C"];
        for (eyre, expected) in messages(&report).into_iter().zip(expected_output) {
            assert_eq!(eyre, expected);
        }
    }
}
