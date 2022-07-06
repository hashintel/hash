use core::panic::Location;

use crate::{Compat, Frame, Report, Result};

impl<T> Compat for core::result::Result<T, eyre::Report> {
    type Err = eyre::Report;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, eyre::Report> {
        match self {
            Ok(t) => Ok(t),
            Err(eyre) => {
                let sources = eyre
                    .chain()
                    .skip(1)
                    .map(alloc::string::ToString::to_string)
                    .collect::<alloc::vec::Vec<_>>();

                let mut report = Report::from_frame(
                    Frame::from_compat(eyre, Location::caller()),
                    #[cfg(all(nightly, feature = "std"))]
                    Some(std::backtrace::Backtrace::capture()),
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
