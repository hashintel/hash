use anyhow::Error as AnyhowError;

use crate::{Frame, IntoReportCompat, Report, Result};

impl<T> IntoReportCompat for core::result::Result<T, AnyhowError> {
    type Err = AnyhowError;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, AnyhowError> {
        match self {
            Ok(t) => Ok(t),
            Err(anyhow) => Err(Report::from_frame(Frame::from_error(anyhow))),
        }
    }
}
