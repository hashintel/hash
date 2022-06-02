use core::fmt;

use crate::provider::{Demand, Provider};

/// Wrapper-structure to provide `T`.
pub struct SingleProvider<T>(pub T);

impl<T: fmt::Debug> fmt::Debug for SingleProvider<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<T: fmt::Display> fmt::Display for SingleProvider<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<T: 'static> Provider for SingleProvider<T> {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);
    }
}
