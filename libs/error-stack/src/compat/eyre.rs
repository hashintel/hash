use eyre::Report as EyreReport;

use crate::{Frame, IntoReportCompat, Report};

impl<T> IntoReportCompat for Result<T, EyreReport> {
    type Err = EyreReport;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, Report<EyreReport>> {
        match self {
            Ok(value) => Ok(value),
            Err(eyre) => {
                let sources = eyre
                    .chain()
                    .skip(1)
                    .map(alloc::string::ToString::to_string)
                    .collect::<alloc::vec::Vec<_>>();

                #[cfg_attr(not(feature = "std"), allow(unused_mut))]
                let mut report: Report<EyreReport> =
                    Report::from_frame(Frame::from_eyre(eyre, Box::new([])));

                for source in sources {
                    report = report.attach_printable(source);
                }

                Err(report)
            }
        }
    }
}
