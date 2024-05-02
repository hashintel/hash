use bytes::{Buf, BufMut};
use error_stack::Result;

use crate::codec::{Buffer, BufferError, Decode, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestId(u32);

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
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        self.0.encode(buffer)
    }
}

impl Decode for RequestId {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        u32::decode(buffer, ()).map(Self)
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
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;

    use super::RequestIdProducer;
    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        request::id::RequestId,
    };

    pub(crate) const fn mock_request_id(id: u32) -> RequestId {
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
        producer.current = RequestId(u32::MAX);

        assert_eq!(producer.next().expect("infallible").0, u32::MAX);
        assert_eq!(producer.next().expect("infallible").0, 0);
    }

    #[test]
    fn encode_id() {
        assert_encode(
            &RequestId(0x01_02_03_04),
            expect![[r#"
                0x01 0x02 0x03 0x04
            "#]],
        );
    }

    #[test]
    fn decode_id() {
        assert_decode(
            &[0x12_u8, 0x34, 0x56, 0x78] as &[_],
            &RequestId(0x12_34_56_78),
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec_id(id: RequestId) {
        assert_codec(&id, ());
    }
}
