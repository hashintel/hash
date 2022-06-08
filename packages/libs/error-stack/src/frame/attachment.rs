#[cfg(nightly)]
use crate::provider::{Demand, Provider};

/// Wrapper around an attachment to provide the inner type.
#[repr(transparent)]
pub(in crate::frame) struct AttachmentProvider<A: 'static>(A);

impl<A: 'static> AttachmentProvider<A> {
    /// Wrapps an attachment to make it providable.
    pub const fn new(attachment: A) -> Self {
        Self(attachment)
    }
}

#[cfg(nightly)]
impl<A: 'static> Provider for AttachmentProvider<A> {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);
    }
}
