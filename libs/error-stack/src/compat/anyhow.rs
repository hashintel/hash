use anyhow::Error as AnyhowError;

use crate::{Frame, IntoReportCompat, Report};

impl<T> IntoReportCompat for Result<T, AnyhowError> {
    type Err = AnyhowError;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, Report<AnyhowError>> {
        match self {
            Ok(value) => Ok(value),
            Err(anyhow) => {
                #[cfg(feature = "std")]
                let sources = anyhow
                    .chain()
                    .skip(1)
                    .map(ToString::to_string)
                    .collect::<alloc::vec::Vec<_>>();

                #[cfg_attr(not(feature = "std"), expect(unused_mut))]
                let mut report: Report<AnyhowError> =
                    Report::from_frame(Frame::from_anyhow(anyhow, alloc::boxed::Box::new([])));

                #[cfg(feature = "std")]
                for source in sources {
                    report = report.attach_printable(source);
                }

                Err(report)
            }
        }
    }
}
