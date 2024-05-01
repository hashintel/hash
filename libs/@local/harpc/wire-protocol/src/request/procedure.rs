use std::io;

use error_stack::Result;
use harpc_types::procedure::ProcedureId;
use tokio::io::{AsyncRead, AsyncWrite};

use crate::codec::{Decode, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ProcedureDescriptor {
    pub id: ProcedureId,
}

impl Encode for ProcedureDescriptor {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        self.id.encode(write).await
    }
}

impl Decode for ProcedureDescriptor {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        Ok(Self {
            id: ProcedureId::decode(read, ()).await?,
        })
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;

    use super::{ProcedureDescriptor, ProcedureId};
    use crate::codec::test::{assert_codec, assert_decode, assert_encode};

    #[tokio::test]
    async fn encode_id() {
        assert_encode(
            &ProcedureId::new(0x01_02),
            expect![[r#"
                0x01 0x02
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode_id() {
        assert_decode(&[0x12, 0x34], &ProcedureId::new(0x12_34), ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    #[cfg_attr(miri, ignore)]
    async fn codec_id(id: ProcedureId) {
        assert_codec(&id, ()).await;
    }

    #[tokio::test]
    async fn encode() {
        assert_encode(
            &ProcedureDescriptor {
                id: ProcedureId::new(0x01_02),
            },
            expect![[r#"
                0x01 0x02
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode(
            &[0x12, 0x34],
            &ProcedureDescriptor {
                id: ProcedureId::new(0x12_34),
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    #[cfg_attr(miri, ignore)]
    async fn codec(id: ProcedureDescriptor) {
        assert_codec(&id, ()).await;
    }
}
