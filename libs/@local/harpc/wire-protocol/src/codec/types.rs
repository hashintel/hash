use bytes::{Buf, BufMut};
use error_stack::Result;
use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};

use super::{Buffer, BufferError, Decode};
use crate::codec::Encode;

impl Encode for Version {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        buffer.push_number(self.major)?;
        buffer.push_number(self.minor)?;

        Ok(())
    }
}

impl Decode for Version {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        let major = u8::decode(buffer, ())?;
        let minor = u8::decode(buffer, ())?;

        Ok(Self { major, minor })
    }
}

impl Encode for ProcedureId {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        self.value().encode(buffer)
    }
}

impl Decode for ProcedureId {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        u16::decode(buffer, ()).map(Self::new)
    }
}

impl Encode for ServiceId {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        self.value().encode(buffer)
    }
}

impl Decode for ServiceId {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        u16::decode(buffer, ()).map(Self::new)
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::needless_raw_strings)]
    use expect_test::expect;
    use harpc_types::{service::ServiceId, version::Version};

    use crate::codec::test::{assert_codec, assert_decode, assert_encode};

    #[test]
    fn encode_version() {
        let version = Version { major: 1, minor: 2 };
        assert_encode(&version, expect![[r#"
            0x01 0x02
        "#]]);
    }

    #[test]
    fn decode_version() {
        assert_decode(
            &[0x01_u8, 0x02] as &[_],
            &Version {
                major: 0x01,
                minor: 0x02,
            },
            (),
        );
    }

    #[test]
    fn encode_service_id() {
        assert_encode(&ServiceId::new(0x01_02), expect![[r#"
                0x01 0x02
            "#]]);
    }

    #[test]
    fn decode_service_id() {
        assert_decode(&[0x12_u8, 0x34] as &[_], &ServiceId::new(0x1234), ());
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec_service_id(id: ServiceId) {
        assert_codec(&id, ());
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec_version(version: Version) {
        assert_codec(&version, ());
    }
}
