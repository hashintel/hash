use bytes::{Buf, BufMut};
use error_stack::{Result, ResultExt as _};

use super::{procedure::ProcedureDescriptor, service::ServiceDescriptor};
use crate::{
    codec::{Buffer, BufferError, Decode, Encode},
    payload::Payload,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("unable to encode request begin frame")]
pub struct RequestBeginEncodeError;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestBegin {
    pub service: ServiceDescriptor,
    pub procedure: ProcedureDescriptor,

    pub payload: Payload,
}

impl Encode for RequestBegin {
    type Error = RequestBeginEncodeError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        self.service
            .encode(buffer)
            .change_context(RequestBeginEncodeError)?;

        self.procedure
            .encode(buffer)
            .change_context(RequestBeginEncodeError)?;

        // write 13 empty bytes (reserved for future use)
        buffer
            .push_repeat(0, 13)
            .change_context(RequestBeginEncodeError)?;

        self.payload
            .encode(buffer)
            .change_context(RequestBeginEncodeError)
    }
}

impl Decode for RequestBegin {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        let service = ServiceDescriptor::decode(buffer, ())?;
        let procedure = ProcedureDescriptor::decode(buffer, ())?;

        // skip 13 bytes (reserved for future use)
        buffer.discard(13)?;

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

    #[test]
    fn encode() {
        assert_encode(&EXAMPLE_REQUEST, expect![[r"
                0x01 0x02 0x03 0x04 0x05 0x06 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 '\r' b'H' b'e' b'l' b'l' b'o' b',' b' ' b'w' b'o' b'r' b'l'
                b'd' b'!'
            "]]);
    }

    #[test]
    fn decode() {
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
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(request: RequestBegin) {
        assert_codec(&request, ());
    }
}
