use core::panic::Location;

use eyre::Report as EyreReport;

use crate::{Compat, Frame, Report, Result};

impl<T> Compat for core::result::Result<T, EyreReport> {
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

#[cfg(test)]
mod tests {
    use alloc::boxed::Box;

    use eyre::eyre;

    use crate::{test_helper::messages, Compat};

    #[test]
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
