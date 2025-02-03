use bytes::{Buf, BufMut};
use error_stack::Report;
use harpc_types::{
    subsystem::{SubsystemDescriptor, SubsystemId},
    version::Version,
};

use crate::codec::{Buffer, BufferError, Decode, Encode};

impl Encode for SubsystemDescriptor {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Report<Self::Error>>
    where
        B: BufMut,
    {
        self.id.encode(buffer)?;
        self.version.encode(buffer)?;

        Ok(())
    }
}

impl Decode for SubsystemDescriptor {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Report<Self::Error>>
    where
        B: Buf,
    {
        let id = SubsystemId::decode(buffer, ())?;
        let version = Version::decode(buffer, ())?;

        Ok(Self { id, version })
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::needless_raw_strings)]
    use expect_test::expect;
    use harpc_types::{subsystem::SubsystemId, version::Version};

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        request::subsystem::SubsystemDescriptor,
    };

    #[test]
    fn encode() {
        let subsystem = SubsystemDescriptor {
            id: SubsystemId::new(0x01_02),
            version: Version {
                major: 0x03,
                minor: 0x04,
            },
        };

        assert_encode(
            &subsystem,
            expect![[r#"
                0x01 0x02 0x03 0x04
            "#]],
        );
    }

    #[test]
    fn decode() {
        assert_decode(
            &[0x12_u8, 0x34, 0x56, 0x78] as &[_],
            &SubsystemDescriptor {
                id: SubsystemId::new(0x12_34),
                version: Version {
                    major: 0x56,
                    minor: 0x78,
                },
            },
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn encode_decode(subsystem: SubsystemDescriptor) {
        assert_codec(&subsystem, ());
    }
}
