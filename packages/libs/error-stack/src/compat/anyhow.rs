use core::panic::Location;

use anyhow::Error as AnyhowError;

use crate::{Frame, IntoReportCompat, Report, Result};

impl<T> IntoReportCompat for core::result::Result<T, AnyhowError> {
    type Err = AnyhowError;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, AnyhowError> {
        match self {
            Ok(t) => Ok(t),
            Err(anyhow) => {
                #[cfg(feature = "std")]
                let sources = anyhow
                    .chain()
                    .skip(1)
                    .map(ToString::to_string)
                    .collect::<Vec<_>>();

                #[cfg_attr(not(feature = "std"), allow(unused_mut))]
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

#[cfg(test)]
mod tests {
    use anyhow::anyhow;

    use crate::{test_helper::messages, IntoReportCompat};

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
