use core::fmt;
#[cfg(nightly)]
use core::{
    any::{Demand, Provider},
    error::Error,
};
#[cfg(not(nightly))]
use std::error::Error;

use crate::Report;

#[repr(transparent)]
pub(crate) struct ReportError<C>(Report<C>);

impl<C> ReportError<C> {
    pub(crate) const fn new(report: Report<C>) -> Self {
        Self(report)
    }

    pub(crate) const fn from_ref(report: &Report<C>) -> &Self {
        // SAFETY: `ReportError` is a `repr(transparent)` wrapper around `Report`.
        unsafe { &*(report as *const Report<C>).cast() }
    }
}

impl<C> fmt::Debug for ReportError<C> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<C> fmt::Display for ReportError<C> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<C> Error for ReportError<C> {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        self.0.frames().for_each(|frame| frame.provide(demand));
    }
}
