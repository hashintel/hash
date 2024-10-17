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
        self.next += 1;

        // never overflows because right before it reaches usize::MAX, it will be reset to 0
        if self.next == usize::MAX {
            self.next = 0;
        }

        SessionId(id)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionId(usize);

impl SessionId {
    // the session id for the client is always the same (as it is unaware of the session id) and is
    // usize::MAX, the producer always skips this value
    pub const CLIENT: Self = Self(usize::MAX);
}

#[cfg(any(test, feature = "test-utils"))]
pub(crate) mod test_utils {
    use super::SessionId;

    #[must_use]
    #[cfg_attr(not(feature = "test-utils"), expect(unreachable_pub))]
    pub const fn mock_session_id(id: usize) -> SessionId {
        SessionId(id)
    }

    #[test]
    fn overflows_on_second_to_last() {
        use super::SessionIdProducer;

        let mut producer = SessionIdProducer {
            next: usize::MAX - 1,
        };

        assert_eq!(producer.produce(), SessionId(usize::MAX - 1));
        assert_eq!(producer.produce(), SessionId(0));
    }
}
