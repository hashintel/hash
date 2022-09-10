#[cfg(nightly)]
use core::any::Demand;
use core::fmt;

use anyhow::Error as AnyhowError;

use crate::{compat::IntoReportCompat, Context, Report, Result};

/// A [`Context`] wrapper for [`anyhow::Error`].
///
/// It provides the [`anyhow::Error`] and forwards the [`Demand`] to [`Error::provide`].
///
/// [`Error::provide`]: core::error::Error::provide
#[repr(transparent)]
pub struct AnyhowContext(AnyhowError);

impl AnyhowContext {
    /// Returns a reference to the underlying [`anyhow::Error`].
    #[must_use]
    pub const fn as_anyhow(&self) -> &AnyhowError {
        &self.0
    }
}

impl fmt::Debug for AnyhowContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for AnyhowContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl Context for AnyhowContext {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);

        #[cfg(feature = "std")]
        self.0.provide(demand);
    }
}

impl<T> IntoReportCompat for core::result::Result<T, AnyhowError> {
    type Err = AnyhowContext;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, AnyhowContext> {
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
                let mut report = Report::new(AnyhowContext(anyhow));

                #[cfg(feature = "std")]
                for source in sources {
                    report = report.attach_printable(source);
                }

                Err(report)
            }
        }
    }
}
