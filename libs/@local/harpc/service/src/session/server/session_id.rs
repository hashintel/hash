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

// what is in the session is not part of the service, but higher level!
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct SessionId(usize);
