use error_stack::{Result, ResultExt};
use tokio::{io::AsyncWrite, pin};

use super::{
    codec::{DecodeError, EncodeError},
    procedure::ProcedureDescriptor,
    service::ServiceDescriptor,
};
use crate::{
    codec::{Decode, Encode},
    payload::Payload,
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestBegin {
    pub service: ServiceDescriptor,
    pub procedure: ProcedureDescriptor,

    pub payload: Payload,
}

impl Encode for RequestBegin {
    type Error = EncodeError;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        self.service
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        self.procedure
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        self.payload.encode(write).await.change_context(EncodeError)
    }
}

impl Decode for RequestBegin {
    type Context = ();
    type Error = DecodeError;

    async fn decode(read: impl tokio::io::AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        let service = ServiceDescriptor::decode(&mut read, ())
            .await
            .change_context(DecodeError)?;
        let procedure = ProcedureDescriptor::decode(&mut read, ())
            .await
            .change_context(DecodeError)?;

        let payload = Payload::decode(read, ())
            .await
            .change_context(DecodeError)?;

        Ok(Self {
            service,
            procedure,
            payload,
        })
    }
}

#[cfg(test)]
mod test {

    use expect_test::expect;
    use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        payload::Payload,
        request::{
            begin::RequestBegin, procedure::ProcedureDescriptor, service::ServiceDescriptor,
        },
    };

    static EXAMPLE_REQUEST: RequestBegin = RequestBegin {
        service: ServiceDescriptor {
            id: ServiceId::new(0x12),
            version: Version::new(0x34, 0x56),
        },
        procedure: ProcedureDescriptor {
            id: ProcedureId::new(0x78),
        },
        payload: Payload::from_static(&[0x90, 0xAB, 0xCD]),
    };

    #[tokio::test]
    async fn encode() {
        assert_encode(&EXAMPLE_REQUEST, expect!["001234560078000390abcd"]).await;
    }

    #[tokio::test]
    async fn decode() {
        let bytes: &[u8] = &[
            0x00, 0x12, // service id
            0x34, 0x56, // service version
            0x00, 0x78, // procedure id
            0x00, 0x01, 0x00, 0x01, // encoding
            0x00, 0x03, 0x90, 0xAB, 0xCD, // payload
        ];

        assert_decode::<RequestBegin>(bytes, expect![[""]], ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(request: RequestBegin) {
        assert_codec(&request, ()).await;
    }
}
