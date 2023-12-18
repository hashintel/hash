use std::{future::Future, marker::PhantomData, mem::size_of};

use bytes::Bytes;
use integer_encoding::VarInt;
use tokio::io::{AsyncRead, AsyncReadExt};
use uuid::Uuid;

use crate::rpc::{
    codec::Limit, ActorId, PayloadSize, ProcedureId, Request, RequestHeader, Response,
    ResponseHeader, ServiceId,
};

async fn default_decode_text<T, U>(io: &mut T, limit: Limit) -> std::io::Result<U>
where
    T: AsyncRead + Unpin + Send,
    U: serde::de::DeserializeOwned,
{
    let mut buf = Vec::new();

    io.take(limit.request_size).read_to_end(&mut buf).await?;

    let request = serde_json::from_slice(&buf)?;

    Ok(request)
}

/// [`VarIntProcessor`] encapsulates the logic for decoding a VarInt byte-by-byte.
/// "borrowed" from integer-encoding crate
struct VarIntProcessor<T> {
    buffer: [u8; 10],
    index: usize,

    _marker: PhantomData<fn() -> *const T>,
}

impl<T> VarIntProcessor<T>
where
    T: VarInt,
{
    #[allow(clippy::integer_division)]
    // taken from https://github.com/dermesser/integer-encoding-rs/blob/4f57046ae90b6b923ff235a91f0729d3cf868d72/src/varint.rs#L75
    const MAX_SIZE: usize = (size_of::<T>() * 8 + 7) / 7;

    fn new() -> Self {
        Self {
            buffer: [0_u8; 10],
            index: 0,
            _marker: PhantomData,
        }
    }

    fn push(&mut self, byte: u8) -> std::io::Result<()> {
        if self.index >= Self::MAX_SIZE {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Unterminated variable integer",
            ));
        }

        self.buffer[self.index] = byte;
        self.index += 1;

        Ok(())
    }

    const fn finished(&self) -> bool {
        const MSB: u8 = 0b1000_0000;

        self.index > 0 && (self.buffer[self.index - 1] & MSB == 0)
    }

    fn decode(&self) -> Option<T> {
        Some(T::decode_var(&self.buffer[0..self.index])?.0)
    }
}

async fn read_varint<T, U>(io: &mut T) -> std::io::Result<U>
where
    T: AsyncRead + Unpin + Send,
    U: VarInt,
{
    let mut processor = VarIntProcessor::new();

    while !processor.finished() {
        // we only error on EOF, in that case we need to bail
        // even if we would encounter an EOF while reading the next byte of input
        // the processor has indicated we're not finished yet, so it's a premature EOF anyway.
        let byte = io.read_u8().await?;
        processor.push(byte)?;
    }

    processor.decode().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Unterminated variable integer",
        )
    })
}

pub(super) trait DecodeBinary: Sized {
    fn decode_binary<T>(
        io: &mut T,
        limit: Limit,
    ) -> impl Future<Output = std::io::Result<Self>> + Send
    where
        T: AsyncRead + Unpin + Send;
}

pub(super) trait Decode: DecodeBinary {
    fn decode_text<T>(
        io: &mut T,
        limit: Limit,
    ) -> impl Future<Output = std::io::Result<Self>> + Send
    where
        T: AsyncRead + Unpin + Send;
}

impl DecodeBinary for ServiceId {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let service_id = read_varint(io).await?;
        let service_id = Self::new(service_id);

        Ok(service_id)
    }
}

impl DecodeBinary for ProcedureId {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let procedure_id = read_varint(io).await?;
        let procedure_id = Self::new(procedure_id);

        Ok(procedure_id)
    }
}

impl DecodeBinary for ActorId {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let actor_id = io.read_u128().await?;
        let actor_id = Self::from(Uuid::from_u128(actor_id));

        Ok(actor_id)
    }
}

impl DecodeBinary for PayloadSize {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let body_size = read_varint(io).await?;
        let body_size = Self::new(body_size);

        Ok(body_size)
    }
}

impl DecodeBinary for RequestHeader {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let service_id = ServiceId::decode_binary(io, limit).await?;
        let procedure_id = ProcedureId::decode_binary(io, limit).await?;
        let actor_id = ActorId::decode_binary(io, limit).await?;
        let payload_size = PayloadSize::decode_binary(io, limit).await?;

        if payload_size.exceeds(limit.request_size) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "request body size exceeds maximum",
            ));
        }

        Ok(Self {
            service: service_id,
            procedure: procedure_id,
            actor: actor_id,
            size: payload_size,
        })
    }
}

impl DecodeBinary for Request {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let header = RequestHeader::decode_binary(io, limit).await?;

        let mut buffer = Vec::with_capacity(header.size.into());

        io.take(header.size.into()).read_to_end(&mut buffer).await?;

        let body = Bytes::from(buffer);

        if body.len() != header.size.into_usize() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "request body size does not match header",
            ));
        }

        Ok(Self { header, body })
    }
}

impl Decode for Request {
    async fn decode_text<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        default_decode_text(io, limit).await
    }
}

/// The binary message layout of Response Header is:
///
/// | Body Size (var int) |
impl DecodeBinary for ResponseHeader {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let payload_size = PayloadSize::decode_binary(io, limit).await?;
        if payload_size.exceeds(limit.response_size) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "request body size exceeds maximum",
            ));
        }

        Ok(Self { size: payload_size })
    }
}

impl DecodeBinary for Response {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let header = ResponseHeader::decode_binary(io, limit).await?;

        let mut buffer = Vec::with_capacity(header.size.into());

        io.take(header.size.into()).read_to_end(&mut buffer).await?;

        let body = Bytes::from(buffer);

        if body.len() != header.size.into_usize() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "request body size does not match header",
            ));
        }

        Ok(Self { header, body })
    }
}

impl Decode for Response {
    async fn decode_text<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        default_decode_text(io, limit).await
    }
}

#[cfg(test)]
mod test {
    use std::fmt::Debug;

    use bytes::Bytes;
    use uuid::Uuid;

    use crate::rpc::{
        codec::{
            decode::{read_varint, Decode, DecodeBinary},
            Limit,
        },
        ActorId, PayloadSize, ProcedureId, Request, RequestHeader, Response, ResponseHeader,
        ServiceId,
    };

    const EXAMPLE_UUID: Uuid = Uuid::from_bytes([
        0x5B, 0xC2, 0xA5, 0x38, 0xFA, 0x94, 0x41, 0x00, 0x86, 0x00, 0x53, 0xAF, 0xCF, 0x8A, 0xA6,
        0xFF,
    ]);

    async fn assert_binary<T>(value: &[u8], expected: T)
    where
        T: PartialEq + Debug + DecodeBinary + Send,
    {
        let result = T::decode_binary(&mut &*value, Limit::default())
            .await
            .expect("decode failed");

        assert_eq!(result, expected);
    }

    macro_rules! assert_binary {
        ($($name:ident: $value:expr => $expected:expr;)*) => {
            $(
                #[tokio::test]
                async fn $name() {
                    assert_binary(&$value, $expected).await;
                }
            )*
        };
    }

    macro_rules! assert_text {
        ($($name:ident: <$T:ty> $value:expr => $expected:expr;)*) => {
            $(
                #[tokio::test]
                async fn $name() {
                    let actual = <$T>::decode_text(&mut $value.as_bytes(), Limit::default())
                        .await
                        .expect("decode failed");

                    assert_eq!(actual, $expected);
                }
            )*
        };
    }

    #[tokio::test]
    async fn unterminated_varint_too_long() {
        let buffer = [0xFF_u8; 12];

        let result = read_varint::<_, u64>(&mut &buffer[..]).await;

        result.expect_err("should fail to read varint");
    }

    #[tokio::test]
    async fn unterminated_varint_premature_eof() {
        let buffer = [0xFF_u8, 0xFF];

        let result = read_varint::<_, u64>(&mut &buffer[..]).await;

        result.expect_err("should fail to read varint");
    }

    assert_binary![
        decode_procedure_id: [0xEF, 0x9B, 0xAF, 0x85, 0x89, 0xCF, 0x95, 0x9A, 0x12] => ProcedureId::new(0x1234_5678_90AB_CDEF);
        decode_procedure_id_zero: [0x00] => ProcedureId::new(0);

        decode_actor_id: EXAMPLE_UUID.into_bytes() => crate::rpc::ActorId::from(EXAMPLE_UUID);
        decode_actor_id_zero: [0_u8; 16] => crate::rpc::ActorId::from(Uuid::nil());

        decode_payload_size: [0x80, 0x01] => PayloadSize::new(0x80);
        decode_payload_size_zero: [0x00] => PayloadSize::new(0);

        decode_request_header: [
            0x02, // service id
            0x12, // procedure id
            0x5B, 0xC2, 0xA5, 0x38, 0xFA, 0x94, 0x41, 0x00, 0x86, 0x00, 0x53, 0xAF, 0xCF, 0x8A, 0xA6, 0xFF, // actor id
            0x80, 0x01, // body size
        ] => RequestHeader {
            service: ServiceId::new(0x02),
            procedure: ProcedureId::new(0x12),
            actor: ActorId::from(EXAMPLE_UUID),
            size: PayloadSize::new(0x80),
        };

        decode_request: [
            0x02, // service id
            0x12, // procedure id
            0x5B, 0xC2, 0xA5, 0x38, 0xFA, 0x94, 0x41, 0x00, 0x86, 0x00, 0x53, 0xAF, 0xCF, 0x8A, 0xA6, 0xFF, // actor id
            0x04, // body size
            0xDE, 0xAD, 0xBE, 0xEF, // body
        ] => Request {
            header: RequestHeader {
                service: ServiceId::new(0x02),
                procedure: ProcedureId::new(0x12),
                actor: ActorId::from(EXAMPLE_UUID),
                size: PayloadSize::new(0x04),
            },
            body: vec![0xDE, 0xAD, 0xBE, 0xEF].into(),
        };

        decode_response_header: [
            0x80, 0x01, // body size
        ] => ResponseHeader {
            size: PayloadSize::new(0x80),
        };

        decode_response: [
            0x04, // body size
            0xDE, 0xAD, 0xBE, 0xEF, // body
        ] => Response {
            header: ResponseHeader {
                size: PayloadSize::new(0x04),
            },
            body: vec![0xDE, 0xAD, 0xBE, 0xEF].into(),
        };
    ];

    #[tokio::test]
    async fn incorrect_request_body_size_exceeds_limit() {
        let mut request = vec![0x02, 0x12];
        request.extend_from_slice(&EXAMPLE_UUID.into_bytes());
        request.extend_from_slice(&[0x04]);
        request.extend_from_slice(&[0x00; 4]);

        let result = Request::decode_binary(
            &mut &*request,
            Limit {
                request_size: 0x03,
                ..Default::default()
            },
        )
        .await;

        result.expect_err("should fail to encode request");
    }

    #[tokio::test]
    async fn incorrect_request_body_size_does_not_match_header() {
        let mut request = vec![0x02, 0x12];
        request.extend_from_slice(&EXAMPLE_UUID.into_bytes());
        request.extend_from_slice(&[0x05]);
        request.extend_from_slice(&[0x00; 4]);

        let result = Request::decode_binary(&mut &*request, Limit::default()).await;

        // we have 4 bytes remaining in the pipeline, but the header says the body is 5 bytes long
        result.expect_err("should fail to encode request");
    }

    #[tokio::test]
    async fn incorrect_response_body_size_exceeds_limit() {
        let mut response = vec![0x04_u8];
        response.extend_from_slice(&[0x00; 4]);

        let result = Response::decode_binary(
            &mut &*response,
            Limit {
                response_size: 0x03,
                ..Default::default()
            },
        )
        .await;

        result.expect_err("should fail to encode response");
    }

    #[tokio::test]
    async fn incorrect_response_body_size_does_not_match_header() {
        let mut response = vec![0x05_u8];
        response.extend_from_slice(&[0x00; 4]);

        let result = Response::decode_binary(&mut &*response, Limit::default()).await;

        // we have 4 bytes remaining in the pipeline, but the header says the body is 5 bytes long
        result.expect_err("should fail to encode response");
    }

    assert_text![
        decode_request_text: <Request> r#"{"header":{"service":2,"procedure":18,"actor":"5bc2a538-fa94-4100-8600-53afcf8aa6ff","size":4},"body":"3q2+7w=="}"# => Request {
            header: RequestHeader {
                service: ServiceId::new(0x02),
                procedure: ProcedureId::new(0x12),
                actor: ActorId::from(EXAMPLE_UUID),
                size: PayloadSize::from(0x04),
            },
            body: Bytes::from(vec![0xDE, 0xAD, 0xBE, 0xEF]),
        };
    ];

    assert_text![
        encode_response_text: <Response> r#"{"header":{"size":4},"body":"3q2+7w=="}"# => Response {
            header: ResponseHeader {
                size: PayloadSize::from(0x04),
            },
            body: Bytes::from(vec![0xDE, 0xAD, 0xBE, 0xEF]),
        };
    ];
}
