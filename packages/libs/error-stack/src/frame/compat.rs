use core::fmt;

use crate::Context;

#[repr(transparent)]
pub struct CompatContext<T>(T);

impl<T: fmt::Debug> fmt::Debug for CompatContext<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<T: fmt::Display> fmt::Display for CompatContext<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<T: fmt::Debug + fmt::Display + Send + Sync + 'static> Context for CompatContext<T> {}
