use core::fmt;

#[cfg(nightly)]
use crate::provider::Demand;
use crate::Context;

/// Wrapper around an attachment to unify the interface for a [`Frame`].
///
/// A piece of information can be requested by calling [`Report::request_ref()`]. It's used for the
/// [`Display`] and [`Debug`] implementation for a [`Frame`].
///
/// [`Frame`]: crate::Frame
/// [`Report::request_ref()`]: crate::Report::request_ref
/// [`Display`]: core::fmt::Display
/// [`Debug`]: core::fmt::Debug
pub(in crate::frame) struct AttachedObject<A>(A);

impl<A> AttachedObject<A> {
    /// Wrapps an attachment to make it providable.
    pub const fn new(attachment: A) -> Self {
        Self(attachment)
    }
}

impl<A: fmt::Display> fmt::Display for AttachedObject<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<A: fmt::Debug> fmt::Debug for AttachedObject<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<A: fmt::Display + fmt::Debug + Send + Sync + 'static> Context for AttachedObject<A> {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);
    }
}
