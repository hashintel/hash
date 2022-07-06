use core::panic::Location;

use anyhow::Error;

use crate::{Compat, Frame, Report, Result};

impl<T> Compat for core::result::Result<T, Error> {
    type Err = Error;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, Error> {
        match self {
            Ok(t) => Ok(t),
            Err(anyhow) => {
                #[cfg(feature = "std")]
                let sources = anyhow
                    .chain()
                    .skip(1)
                    .map(ToString::to_string)
                    .collect::<Vec<_>>();

                let mut report = Report::from_frame(
                    Frame::from_compat(anyhow, Location::caller()),
                    #[cfg(all(nightly, feature = "std"))]
                    Some(std::backtrace::Backtrace::capture()),
                    #[cfg(feature = "spantrace")]
                    Some(tracing_error::SpanTrace::capture()),
                );

                #[cfg(feature = "std")]
                for source in sources {
                    report = report.attach_printable(source);
                }

                Err(report)
            }
        }
    }
}
