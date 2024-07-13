use core::fmt::Display;

use bytes::{Buf, BufMut};
use error_stack::{Report, Result, ResultExt};

use crate::codec::{Buffer, BufferError, Decode, Encode};

const MAGIC_LEN: usize = 5;
const MAGIC: &[u8; MAGIC_LEN] = b"harpc";

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ProtocolVersionDecodeError {
    #[error("unsupported version {actual}, expected {expected}")]
    Unsupported {
        actual: ProtocolVersion,
        expected: ProtocolVersion,
    },
    #[error("buffer error")]
    Buffer,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ProtocolVersion(#[cfg_attr(test, strategy(1..=1_u8))] u8);

impl ProtocolVersion {
    pub const V1: Self = Self(1);
}

impl Display for ProtocolVersion {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let Self(version) = self;

        write!(f, "v{version}")
    }
}

impl Encode for ProtocolVersion {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        self.0.encode(buffer)
    }
}

impl Decode for ProtocolVersion {
    type Context = ();
    type Error = ProtocolVersionDecodeError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        let version = u8::decode(buffer, ())
            .map(Self)
            .change_context(ProtocolVersionDecodeError::Buffer)?;

        if version != Self::V1 {
            return Err(Report::new(ProtocolVersionDecodeError::Unsupported {
                actual: version,
                expected: Self::V1,
            }));
        }

        Ok(version)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ProtocolDecodeError {
    #[error("invalid packet identifier: expected {expected:?}, actual {actual:?}")]
    InvalidIdentifier {
        expected: &'static [u8],
        actual: [u8; MAGIC_LEN],
    },
    #[error("indalid protocol version")]
    InvalidVersion,
    #[error("buffer error")]
    Buffer,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct Protocol {
    pub version: ProtocolVersion,
}

impl Encode for Protocol {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        buffer.push_slice(MAGIC)?;

        self.version.encode(buffer)
    }
}

impl Decode for Protocol {
    type Context = ();
    type Error = ProtocolDecodeError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        let magic: [_; MAGIC_LEN] = buffer
            .next_array()
            .change_context(ProtocolDecodeError::Buffer)?;

        if magic != *MAGIC {
            return Err(Report::new(ProtocolDecodeError::InvalidIdentifier {
                expected: MAGIC,
                actual: magic,
            }));
        }

        let version = ProtocolVersion::decode(buffer, ())
            .change_context(ProtocolDecodeError::InvalidVersion)?;

        Ok(Self { version })
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::needless_raw_strings)]
    use expect_test::expect;

    use super::Protocol;
    use crate::{
        codec::test::{assert_codec, assert_decode, assert_decode_error, assert_encode},
        protocol::{ProtocolVersion, ProtocolVersionDecodeError},
    };

    #[test]
    fn encode_version() {
        assert_encode(
            &ProtocolVersion::V1,
            expect![[r#"
            0x01
        "#]],
        );
    }

    #[test]
    fn decode_version() {
        assert_decode(&[0x01_u8] as &[_], &ProtocolVersion::V1, ());
    }

    #[test]
    fn decode_version_invalid() {
        assert_decode_error::<ProtocolVersion>(
            &[0x02_u8] as &[_],
            &ProtocolVersionDecodeError::Unsupported {
                actual: ProtocolVersion(2),
                expected: ProtocolVersion::V1,
            },
            (),
        );
    }

    #[test]
    fn encode_protocol() {
        assert_encode(
            &crate::protocol::Protocol {
                version: ProtocolVersion::V1,
            },
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01
            "#]],
        );
    }

    #[test]
    fn decode_protocol() {
        assert_decode(
            &[b'h', b'a', b'r', b'p', b'c', 0x01] as &[_],
            &Protocol {
                version: ProtocolVersion::V1,
            },
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec_version(version: ProtocolVersion) {
        assert_codec(&version, ());
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec_protocol(protocol: Protocol) {
        assert_codec(&protocol, ());
    }
}
