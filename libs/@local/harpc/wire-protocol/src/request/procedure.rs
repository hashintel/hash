use bytes::{Buf, BufMut};
use error_stack::Report;
use harpc_types::procedure::{ProcedureDescriptor, ProcedureId};

use crate::codec::{Buffer, BufferError, Decode, Encode};

impl Encode for ProcedureDescriptor {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Report<Self::Error>>
    where
        B: BufMut,
    {
        self.id.encode(buffer)
    }
}

impl Decode for ProcedureDescriptor {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Report<Self::Error>>
    where
        B: Buf,
    {
        let id = ProcedureId::decode(buffer, ())?;

        Ok(Self { id })
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::needless_raw_strings)]
    use expect_test::expect;

    use super::{ProcedureDescriptor, ProcedureId};
    use crate::codec::test::{assert_codec, assert_decode, assert_encode};

    #[test]
    fn encode_id() {
        assert_encode(
            &ProcedureId::new(0x01_02),
            expect![[r#"
                0x01 0x02
            "#]],
        );
    }

    #[test]
    fn decode_id() {
        assert_decode(&[0x12_u8, 0x34] as &[_], &ProcedureId::new(0x12_34), ());
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec_id(id: ProcedureId) {
        assert_codec(&id, ());
    }

    #[test]
    fn encode() {
        assert_encode(
            &ProcedureDescriptor {
                id: ProcedureId::new(0x01_02),
            },
            expect![[r#"
                0x01 0x02
            "#]],
        );
    }

    #[test]
    fn decode() {
        assert_decode(
            &[0x12_u8, 0x34] as &[_],
            &ProcedureDescriptor {
                id: ProcedureId::new(0x12_34),
            },
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(id: ProcedureDescriptor) {
        assert_codec(&id, ());
    }
}
