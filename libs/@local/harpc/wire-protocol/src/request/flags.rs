use bytes::{Buf, BufMut};
use enumflags2::BitFlags;
use error_stack::Result;

use super::body::RequestBody;
use crate::{
    codec::{Buffer, BufferError, Decode, Encode},
    flags::BitFlagsOp,
};

#[enumflags2::bitflags]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum RequestFlag {
    // Computed flags
    BeginOfRequest = 0b1000_0000,
    // Controlled flags
    EndOfRequest = 0b0000_0001,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestFlags(
    #[cfg_attr(test, strategy(proptest::arbitrary::any::<u8>()))]
    #[cfg_attr(test, map(BitFlags::from_bits_truncate))]
    BitFlags<RequestFlag>,
);

impl RequestFlags {
    pub(super) fn apply_body(self, body: &RequestBody) -> Self {
        self.set(
            RequestFlag::BeginOfRequest,
            matches!(body, RequestBody::Begin(_)),
        )
    }
}

impl BitFlagsOp for RequestFlags {
    type Flag = RequestFlag;

    const EMPTY: Self = Self(BitFlags::EMPTY);

    fn value(&self) -> BitFlags<Self::Flag> {
        self.0
    }
}

impl From<BitFlags<RequestFlag>> for RequestFlags {
    fn from(flags: BitFlags<RequestFlag>) -> Self {
        Self(flags)
    }
}

impl From<RequestFlag> for RequestFlags {
    fn from(flag: RequestFlag) -> Self {
        Self::from(BitFlags::from(flag))
    }
}

impl Encode for RequestFlags {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        let bits = self.0.bits();

        bits.encode(buffer)
    }
}

impl Decode for RequestFlags {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        u8::decode(buffer, ())
            .map(BitFlags::from_bits_truncate)
            .map(From::from)
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::needless_raw_strings)]
    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        flags::BitFlagsOp as _,
        request::flags::{RequestFlag, RequestFlags},
    };

    #[test]
    fn encode() {
        assert_encode(&RequestFlags::EMPTY, expect![[r#"
            0x00
        "#]]);

        assert_encode(&RequestFlags::from(RequestFlag::BeginOfRequest), expect![[
            r#"
                0x80
            "#
        ]]);

        assert_encode(
            &RequestFlags::from(RequestFlag::BeginOfRequest | RequestFlag::EndOfRequest),
            expect![[r#"
                0x81
            "#]],
        );

        assert_encode(&RequestFlags::from(RequestFlag::EndOfRequest), expect![[
            r#"
                0x01
            "#
        ]]);
    }

    #[test]
    fn decode() {
        assert_decode(&[0b0000_0000_u8] as &[_], &RequestFlags::EMPTY, ());

        assert_decode::<RequestFlags>(
            &[0b1100_0001_u8] as &[_],
            &RequestFlags::from(RequestFlag::EndOfRequest | RequestFlag::BeginOfRequest),
            (),
        );

        assert_decode::<RequestFlags>(
            &[0b1000_0001_u8] as &[_],
            &RequestFlags::from(RequestFlag::EndOfRequest | RequestFlag::BeginOfRequest),
            (),
        );

        assert_decode(
            &[0b0100_0001_u8] as &[_],
            &RequestFlags::from(RequestFlag::EndOfRequest),
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(flags: RequestFlags) {
        assert_codec(&flags, ());
    }
}
