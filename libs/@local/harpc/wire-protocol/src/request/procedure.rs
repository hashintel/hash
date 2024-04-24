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
    use super::{ProcedureDescriptor, ProcedureId};
    use crate::codec::test::{assert_decode, assert_encode, assert_encode_decode};

    #[tokio::test]
    async fn encode_id() {
        let id = ProcedureId::new(0x1234);

        // encoding should be BE
        assert_encode(&id, &[0x12, 0x34]).await;
    }

    #[tokio::test]
    async fn decode_id() {
        let id = ProcedureId::new(0x1234);

        // decoding should be BE
        assert_decode(&[0x12, 0x34], &id, ()).await;
    }

    #[tokio::test]
    async fn encode() {
        let id = ProcedureId::new(0x1234);
        let procedure = super::ProcedureDescriptor { id };

        // encoding should be BE
        assert_encode(&procedure, &[0x12, 0x34]).await;
    }

    #[tokio::test]
    async fn decode() {
        let id = ProcedureId::new(0x1234);
        let procedure = super::ProcedureDescriptor { id };

        // decoding should be BE
        assert_decode(&[0x12, 0x34], &procedure, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(id: ProcedureDescriptor) {
        assert_encode_decode(&id, ()).await;
    }
}
