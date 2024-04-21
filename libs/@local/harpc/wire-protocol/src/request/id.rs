use std::io;

use error_stack::Result;
use tokio::io::{AsyncRead, AsyncWrite};

use crate::codec::{DecodePure, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
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

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.0.encode(write).await
    }
}

impl DecodePure for RequestId {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        u16::decode_pure(read).await.map(Self)
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

    pub fn produce(&mut self) -> RequestId {
        self.current.next()
    }
}

impl Iterator for RequestIdProducer {
    type Item = RequestId;

    fn next(&mut self) -> Option<Self::Item> {
        Some(self.produce())
    }
}

impl Default for RequestIdProducer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
pub(crate) mod test {
    use super::RequestIdProducer;
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        request::id::RequestId,
    };

    pub(crate) const fn mock_request_id(id: u16) -> RequestId {
        RequestId(id)
    }

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
        assert_encode(&id, &[0x12, 0x34]).await;
    }

    #[tokio::test]
    async fn decode_id() {
        let id = RequestId(0x1234);

        // decoding should be BE
        assert_decode(&[0x12, 0x34], &id, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode_id(id: RequestId) {
        assert_encode_decode(&id, ()).await;
    }
}
