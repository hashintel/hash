pub(crate) struct SessionIdProducer {
    next: usize,
}

impl SessionIdProducer {
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self { next: 0 }
    }

    pub(crate) fn produce(&mut self) -> SessionId {
        let id = self.next;
        self.next = self.next.wrapping_add(1);

        SessionId(id)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionId(usize);

#[cfg(any(test, feature = "test-utils"))]
pub(crate) mod test_utils {
    use super::SessionId;

    #[must_use]
    #[cfg_attr(all(test, not(feature = "test-utils")), expect(unreachable_pub))]
    pub const fn mock_session_id(id: usize) -> SessionId {
        SessionId(id)
    }
}
