use std::io;

use error_stack::Result;
use tokio::io::{AsyncWrite, AsyncWriteExt};

use crate::codec::Encode;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RequestId(u16);

impl RequestId {
    const fn zero() -> Self {
        Self(0)
    }

    fn next(&mut self) -> Self {
        let value = self.0;
        self.0 = self.0.overflowing_add(1).0;
        Self(value)
    }
}

impl Encode for RequestId {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_u16(self.0).await.map_err(From::from)
    }
}

pub struct RequestIdProducer {
    current: RequestId,
}

impl RequestIdProducer {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            current: RequestId::zero(),
        }
    }
}

impl Iterator for RequestIdProducer {
    type Item = RequestId;

    fn next(&mut self) -> Option<Self::Item> {
        Some(self.current.next())
    }
}

impl Default for RequestIdProducer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod test {
    use super::RequestIdProducer;
    use crate::request::id::RequestId;

    #[test]
    fn next() {
        let mut producer = RequestIdProducer::new();

        assert_eq!(producer.next().expect("infallible").0, 0);
        assert_eq!(producer.next().expect("infallible").0, 1);
        assert_eq!(producer.next().expect("infallible").0, 2);
        assert_eq!(producer.next().expect("infallible").0, 3);
    }

    #[test]
    fn overflow() {
        let mut producer = RequestIdProducer::new();
        producer.current = RequestId(u16::MAX);

        assert_eq!(producer.next().expect("infallible").0, u16::MAX);
        assert_eq!(producer.next().expect("infallible").0, 0);
    }

    #[tokio::test]
    async fn encode_id() {
        let id = RequestId(0x1234);

        // encoding should be BE
        crate::codec::test::assert_encode(&id, &[0x12, 0x34]).await;
    }
}
