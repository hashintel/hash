#[cfg(nightly)]
use core::any::Demand;
use core::fmt;

use eyre::Report as EyreReport;

use crate::{compat::IntoReportCompat, Context, Report, Result};

/// A [`Context`] wrapper for [`eyre::Report`].
///
/// It provides the [`eyre::Report`] and forwards the [`Demand`] to [`Error::provide`].
///
/// [`Error::provide`]: core::error::Error::provide
#[repr(transparent)]
pub struct EyreContext(EyreReport);

impl EyreContext {
    /// Returns a reference to the underlying [`anyhow::Error`].
    pub const fn as_eyre(&self) -> &EyreReport {
        &self.0
    }
}

impl fmt::Debug for EyreContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for EyreContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl Context for EyreContext {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);

        self.0.provide(demand);
    }
}

impl<T> IntoReportCompat for core::result::Result<T, EyreReport> {
    type Err = EyreContext;
    type Ok = T;

    #[track_caller]
    fn into_report(self) -> Result<T, EyreContext> {
        match self {
            Ok(t) => Ok(t),
            Err(eyre) => {
                let sources = eyre
                    .chain()
                    .skip(1)
                    .map(alloc::string::ToString::to_string)
                    .collect::<alloc::vec::Vec<_>>();

                #[cfg_attr(not(feature = "std"), allow(unused_mut))]
                let mut report = Report::new(EyreContext(eyre));

                for source in sources {
                    report = report.attach_printable(source);
                }

                Err(report)
            }
        }
    }
}
