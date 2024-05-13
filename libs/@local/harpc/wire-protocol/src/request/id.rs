use core::{
    fmt::Display,
    sync::atomic::{AtomicU32, Ordering},
};

use bytes::{Buf, BufMut};
use error_stack::Result;

use crate::codec::{Buffer, BufferError, Decode, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestId(u32);

impl RequestId {
    /// Creates a new `RequestId` with the given `id`.
    ///
    /// This method is hidden, as it should only be used sparangly in rare cases where a
    /// predetermined `RequestId` is acceptable, such as in tests.
    #[doc(hidden)]
    #[must_use]
    pub const fn new_unchecked(id: u32) -> Self {
        Self(id)
    }
}

impl Display for RequestId {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        Display::fmt(&self.0, f)
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
    current: AtomicU32,
}

impl RequestIdProducer {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            current: AtomicU32::new(0),
        }
    }

    pub fn produce(&self) -> RequestId {
        // we don't care about ordering here, and `fetch_add` is a single atomic operation.
        // We do not care if on simultanous calls to `produce` one caller is before the other (the
        // order of the `RequestId`s is not important)
        // Therefore `Relaxed` is enough of a guarantee here, because we rely on the atomicity of
        // the operation, not on the ordering.
        // (This would be different if this wasn't just a counter)
        RequestId::new_unchecked(self.current.fetch_add(1, Ordering::Relaxed))
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
    use core::sync::atomic::AtomicU32;

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
        producer.current = AtomicU32::new(u32::MAX);

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
