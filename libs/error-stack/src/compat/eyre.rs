use eyre::Report as EyreReport;

use crate::{Frame, IntoReportCompat, Report, Result};

impl<T> IntoReportCompat for core::result::Result<T, EyreReport> {
    type Err = EyreReport;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, EyreReport> {
        match self {
            Ok(t) => Ok(t),
            Err(eyre) => Err(Report::from_frame(Frame::from_error(eyre))),
        }
    }
}
