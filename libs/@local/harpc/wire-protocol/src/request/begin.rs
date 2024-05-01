use bytes::{Buf, BufMut};
use error_stack::{Report, ResultExt};
use tokio::{
    io::{AsyncReadExt, AsyncWrite, AsyncWriteExt},
    pin,
};

use super::{procedure::ProcedureDescriptor, service::ServiceDescriptor};
use crate::{
    codec::{Buffer, BufferError, BytesEncodeError, Decode, Encode},
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
    type Error = Report<BytesEncodeError>;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        let Ok(()) = self.service.encode(buffer);

        let Ok(()) = self.procedure.encode(buffer);

        // write 13 empty bytes (reserved for future use)
        buffer.push_repeat(0, 13);

        self.payload.encode(buffer)
    }
}

impl Decode for RequestBegin {
    type Context = ();
    type Error = Report<BufferError>;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        let service = ServiceDescriptor::decode(buffer, ())?;
        let procedure = ProcedureDescriptor::decode(buffer, ())?;

        // skip 13 bytes (reserved for future use)
        buffer.next_discard(13)?;

        let payload = Payload::decode(buffer, ())?;

        Ok(Self {
            service,
            procedure,
            payload,
        })
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
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
            id: ServiceId::new(0x01_02),
            version: Version {
                major: 0x03,
                minor: 0x04,
            },
        },
        procedure: ProcedureDescriptor {
            id: ProcedureId::new(0x05_06),
        },
        payload: Payload::from_static(b"Hello, world!"),
    };

    const EXAMPLE_REQUEST_BYTES: &[u8] = &[
        0x01, 0x02, // service id
        0x03, 0x04, // service version
        0x05, 0x06, // procedure id
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, // reserved
        0x00, 0x0D, b'H', b'e', b'l', b'l', b'o', b',', b' ', b'w', b'o', b'r', b'l', b'd', b'!',
    ];

    #[tokio::test]
    async fn encode() {
        assert_encode(
            &EXAMPLE_REQUEST,
            expect![[r#"
                0x01 0x02 0x03 0x04 0x05 0x06 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 '\r' b'H' b'e' b'l' b'l' b'o' b',' b' ' b'w' b'o' b'r' b'l'
                b'd' b'!'
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode(
            EXAMPLE_REQUEST_BYTES,
            &RequestBegin {
                service: ServiceDescriptor {
                    id: ServiceId::new(0x01_02),
                    version: Version {
                        major: 0x03,
                        minor: 0x04,
                    },
                },
                procedure: ProcedureDescriptor {
                    id: ProcedureId::new(0x05_06),
                },
                payload: Payload::from_static(b"Hello, world!"),
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(request: RequestBegin) {
        assert_codec(&request, ()).await;
    }
}
