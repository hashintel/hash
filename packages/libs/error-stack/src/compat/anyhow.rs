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
                    .collect::<alloc::vec::Vec<_>>();

                #[cfg_attr(not(feature = "std"), allow(unused_mut))]
                let mut report =
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
