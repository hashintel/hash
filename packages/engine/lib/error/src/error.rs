use std::{error::Error, panic::Location};

use crate::{Frame, Report};

#[cfg(feature = "std")]
impl<E> From<E> for Report<E>
where
    E: Error + Send + Sync + 'static,
{
    #[track_caller]
    fn from(error: E) -> Self {
        #[cfg(nightly)]
        let backtrace = if error.backtrace().is_some() {
            None
        } else {
            Some(std::backtrace::Backtrace::capture())
        };

        Self::from_frame(
            Frame::from_std(error, Location::caller(), None),
            #[cfg(all(nightly, feature = "std"))]
            backtrace,
            #[cfg(feature = "spantrace")]
            Some(tracing_error::SpanTrace::capture()),
        )
    }
}
