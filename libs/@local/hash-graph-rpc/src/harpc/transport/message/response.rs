use std::{future::Future, io};

use bytes::Bytes;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use super::serde_compat;
use crate::harpc::transport::{
    codec::{
        decode::{default_decode_text, DecodeBinary, DecodeText},
        encode::{default_encode_text, EncodeBinary, EncodeText},
        Limit,
    },
    message::{size::PayloadSize, version::TransportVersion},
    TRANSPORT_VERSION,
};

macro_rules! convert_enum {
    ($($variant:ident <=> $value:literal),* $(,)?) => {
        const fn into_u8(self) -> u8 {
            match self {
                $(Self::$variant => $value,)*
            }
        }

        const fn try_from_u8(value: u8) -> Option<Self> {
            match value {
                $($value => Some(Self::$variant),)*
                _ => None,
            }
        }
    };
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ResponseError {
    DeadlineExceeded,
    ConnectionClosed,
    UnknownProtocolVersion,
    UnknownService,
    UnknownProcedure,
    InvalidTransportVersion,
    InvalidPayloadSize,
    InvalidPayload,
    // TODO: transfer error information as payload
    // TODO: how to convert error-stack information back and forth?
    EncodingError,
    DecodingError,
}

impl ResponseError {
    convert_enum! {
        DeadlineExceeded <=> 0x00,
        ConnectionClosed <=> 0x01,
        UnknownProtocolVersion <=> 0x02,
        UnknownService <=> 0x03,
        UnknownProcedure <=> 0x04,
        InvalidTransportVersion <=> 0x05,
        InvalidPayloadSize <=> 0x06,
        InvalidPayload <=> 0x07,
        EncodingError <=> 0x08,
        DecodingError <=> 0x09,
    }

    pub(crate) const fn into_tag(self) -> u8 {
        self.into_u8() + 1
    }

    pub(crate) const fn try_from_tag(tag: u8) -> Option<Self> {
        if tag == 0 {
            return None;
        }

        Self::try_from_u8(tag - 1)
    }
}

/// # Response Flags
///
/// ## Binary Packet Layout
///
/// ```text
///  0 1 2 3 4 5 6 7 8 9 A B C D E F
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |          Unused           |E|S|
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Unused (14 bites)
/// * End Of Stream (1 bit)
/// * Stream (1 bit)
/// total 16 bits
/// ```
///
/// `End Of Stream` can only be set if `Stream` is set, `Stream` must be set for every streaming
/// item, if `End of Stream` is set, then `Status` must be `0x00` and the body must be empty.
///
/// `Unused` is reserved for future use.
///
/// `Stream` and `End Of Stream` are reserved for future use, but currently not implemented.
pub struct ResponseFlags([u8; 2]);

impl ResponseFlags {
    pub(crate) const fn new() -> Self {
        Self([0x00; 2])
    }
}

impl EncodeBinary for ResponseFlags {
    async fn encode_binary<T>(&self, io: &mut T) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        io.write_all(&self.0).await
    }
}

impl DecodeBinary for ResponseFlags {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let mut bytes = [0_u8; 2];
        io.read_exact(&mut bytes).await?;
        let value = Self(bytes);

        Ok(value)
    }
}

struct PackedResponseHeader {
    version: TransportVersion,
    flags: ResponseFlags,
}

impl EncodeBinary for PackedResponseHeader {
    async fn encode_binary<T>(&self, io: &mut T) -> io::Result<()>
    where
        T: AsyncWriteExt + Unpin + Send,
    {
        if self.version != TRANSPORT_VERSION {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid transport version",
            ));
        }

        self.version.encode_binary(io).await?;
        self.flags.encode_binary(io).await?;

        Ok(())
    }
}

impl DecodeBinary for PackedResponseHeader {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> io::Result<Self>
    where
        T: AsyncReadExt + Unpin + Send,
    {
        let version = TransportVersion::decode_binary(io, Default::default()).await?;
        let flags = ResponseFlags::decode_binary(io, Default::default()).await?;

        if version != TRANSPORT_VERSION {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid transport version",
            ));
        }

        Ok(Self { version, flags })
    }
}

enum PackedResponseBody {
    Success { size: PayloadSize, bytes: Bytes },
    Error { error: ResponseError },
}

impl EncodeBinary for PackedResponseBody {
    async fn encode_binary<T>(&self, io: &mut T) -> io::Result<()>
    where
        T: AsyncWriteExt + Unpin + Send,
    {
        match self {
            Self::Success { size, bytes } => {
                io.write_u8(0x00).await?;
                size.encode_binary(io).await?;
                io.write_all(bytes).await?;
            }
            Self::Error { error } => {
                error.into_tag().encode_binary(io).await?;
            }
        }

        Ok(())
    }
}

impl DecodeBinary for PackedResponseBody {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> io::Result<Self>
    where
        T: AsyncReadExt + Unpin + Send,
    {
        let tag = io.read_u8().await?;

        if let Some(error) = ResponseError::try_from_tag(tag) {
            return Ok(Self::Error { error });
        }

        if tag != 0x00 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid error tag",
            ));
        }

        let size = PayloadSize::decode_binary(io, limit).await?;
        if size.exceeds(limit.response_size) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "payload size exceeds limit",
            ));
        }

        let mut buffer = Vec::with_capacity(size.into_usize());
        io.take(size.into_u64()).read_to_end(&mut buffer).await?;
        let bytes = Bytes::from(buffer);

        let value = Self::Success { size, bytes };
        Ok(value)
    }
}

struct PackedResponse {
    header: PackedResponseHeader,
    body: PackedResponseBody,
}

impl EncodeBinary for PackedResponse {
    async fn encode_binary<T>(&self, io: &mut T) -> io::Result<()>
    where
        T: AsyncWriteExt + Unpin + Send,
    {
        self.header.encode_binary(io).await?;
        self.body.encode_binary(io).await?;

        Ok(())
    }
}

impl DecodeBinary for PackedResponse {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> io::Result<Self>
    where
        T: AsyncReadExt + Unpin + Send,
    {
        let header = PackedResponseHeader::decode_binary(io, limit).await?;
        let body = PackedResponseBody::decode_binary(io, limit).await?;

        Ok(Self { header, body })
    }
}

impl TryFrom<Response> for PackedResponse {
    type Error = io::Error;

    fn try_from(value: Response) -> io::Result<Self> {
        let Response { header, body } = value;

        let packed_header = PackedResponseHeader {
            version: header.version,
            flags: header.flags,
        };

        let body = match body {
            ResponsePayload::Success(bytes) => {
                if header.size != PayloadSize::len(&bytes) {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "body size does not match header size",
                    ));
                }

                PackedResponseBody::Success {
                    size: header.size,
                    bytes,
                }
            }
            ResponsePayload::Error(error) => {
                if header.size != PayloadSize::new(0) {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "body size must be zero for error responses",
                    ));
                }

                PackedResponseBody::Error { error }
            }
        };

        Ok(Self {
            header: packed_header,
            body,
        })
    }
}

impl From<PackedResponse> for Response {
    fn from(value: PackedResponse) -> Self {
        let header = ResponseHeader {
            version: value.header.version,
            flags: value.header.flags,
            size: match value.body {
                PackedResponseBody::Success { size, .. } => size,
                PackedResponseBody::Error { .. } => PayloadSize::new(0),
            },
        };

        let body = match value.body {
            PackedResponseBody::Success { bytes, .. } => ResponsePayload::Success(bytes),
            PackedResponseBody::Error { error } => ResponsePayload::Error(error),
        };

        Self { header, body }
    }
}

/// # Response Header
///
/// ## Binary Packet Layout
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |T|F. |S|Size (conditional) |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * TransportVersion (1 byte)
/// * Flags (2 bytes)
/// * Status (1 byte)
/// * Size (conditional) (10 bytes)
/// total 14 bytes
/// ```
///
/// `Size` is a variable integer, the maximum size of the packet is 14 bytes, the minimum size is
/// 4 bytes for an error, and 5 bytes for a success.
///
/// If `Status` is not `0x00` then `Size` is not present.
///
/// A `Status` value that is not `0x00` indicates an error, and the body is not present.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ResponseHeader {
    pub(crate) version: TransportVersion,
    pub(crate) flags: ResponseFlags,
    pub(crate) size: PayloadSize,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "tag", content = "payload")]
pub enum ResponsePayload {
    Success(#[serde(with = "serde_compat::bytes")] Bytes),
    Error(ResponseError),
}

impl<T> From<T> for ResponsePayload
where
    T: Into<Bytes>,
{
    fn from(value: T) -> Self {
        Self::Success(value.into())
    }
}

impl From<ResponseError> for ResponsePayload {
    fn from(value: ResponseError) -> Self {
        Self::Error(value)
    }
}

/// # Response
///
/// ## Binary Packet Layout
///
/// (The binary packet layout assumes worst case scenario for the header).
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |          Header           |               Body                |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Header (14 bytes)
/// * Body (18 bytes)
/// total 32 bytes
/// ```
///
/// ### Extensions
///
/// Another extension that is planned (through flags) is to allow for an alternative streaming
/// implementation, where the items of the response are streamed as they are produced, instead of
/// being buffered and sent all at once.
///
/// Flags for this are already reserved, but not implemented.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Response {
    pub(crate) header: ResponseHeader,
    pub(crate) body: ResponsePayload,
}

impl Response {
    pub fn success(body: impl Into<ResponsePayload>) -> Self {
        let payload = body.into();

        let size = match &payload {
            ResponsePayload::Success(bytes) => PayloadSize::len(bytes),
            ResponsePayload::Error(_) => PayloadSize::new(0),
        };

        Self {
            header: ResponseHeader {
                version: TRANSPORT_VERSION,
                flags: ResponseFlags::new(),
                size,
            },
            body: payload,
        }
    }

    #[must_use]
    pub fn error(error: ResponseError) -> Self {
        Self {
            header: ResponseHeader {
                version: TRANSPORT_VERSION,
                flags: ResponseFlags::new(),
                size: PayloadSize::new(0),
            },
            body: error.into(),
        }
    }
}

impl EncodeBinary for Response {
    async fn encode_binary<T>(&self, io: &mut T) -> io::Result<()>
    where
        T: AsyncWriteExt + Unpin + Send,
    {
        let packed_response = PackedResponse::try_from(self.clone())?;
        packed_response.encode_binary(io).await?;

        Ok(())
    }
}

impl EncodeText for Response {
    fn encode_text<T>(&self, io: &mut T) -> impl Future<Output = io::Result<()>> + Send
    where
        T: AsyncWrite + Unpin + Send,
    {
        default_encode_text(self, io)
    }
}

impl DecodeBinary for Response {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> io::Result<Self>
    where
        T: AsyncReadExt + Unpin + Send,
    {
        let packed_response = PackedResponse::decode_binary(io, limit).await?;
        let response = Response::from(packed_response);

        Ok(response)
    }
}

impl DecodeText for Response {
    fn decode_text<T>(io: &mut T, limit: Limit) -> impl Future<Output = io::Result<Self>> + Send
    where
        T: AsyncRead + Unpin + Send,
    {
        default_decode_text(io, limit)
    }
}

#[cfg(test)]
mod test {
    use std::io;

    use crate::harpc::transport::{
        codec::{
            decode::DecodeBinary,
            encode::EncodeBinary,
            test::{assert_binary, assert_text},
            Limit,
        },
        message::{
            response::{
                PackedResponseBody, PackedResponseHeader, Response, ResponseError, ResponseFlags,
                ResponseHeader, ResponsePayload,
            },
            size::PayloadSize,
            version::TransportVersion,
        },
    };

    assert_binary![
        binary_response_flags_empty(ResponseFlags::new(), &[0x00; 2]),
        binary_response_flags_example(ResponseFlags([0x02, 0x03]), &[0x02, 0x03])
    ];

    assert_binary![binary_packed_response_header_empty(
        PackedResponseHeader {
            version: TransportVersion::new(0x00),
            flags: ResponseFlags::new()
        },
        &[0x00, 0x00, 0x00]
    )];

    assert_binary![
        binary_packed_response_body_success_empty(
            PackedResponseBody::Success {
                size: PayloadSize::new(0x00),
                bytes: vec![].into()
            },
            &[0x00, 0x00]
        ),
        binary_packed_response_body_success_content(
            PackedResponseBody::Success {
                size: PayloadSize::new(0x04),
                bytes: vec![0xDE, 0xAD, 0xBE, 0xEF].into()
            },
            &[0x00, 0x04, 0xDE, 0xAD, 0xBE, 0xEF]
        )
    ];

    assert_binary![
        binary_packed_response_body_error_deadline_exceeded(
            PackedResponseBody::Error {
                error: ResponseError::DeadlineExceeded
            },
            &[0x01]
        ),
        binary_packed_response_body_error_connection_closed(
            PackedResponseBody::Error {
                error: ResponseError::ConnectionClosed
            },
            &[0x02]
        ),
    ];

    assert_binary![
        binary_response_success_empty(
            Response {
                header: ResponseHeader {
                    version: TransportVersion::new(0x00),
                    flags: ResponseFlags::new(),
                    size: PayloadSize::new(0x00)
                },
                body: ResponsePayload::Success(vec![].into())
            },
            &[0x00, 0x00, 0x00, 0x00, 0x00]
        ),
        binary_response_success_content(
            Response {
                header: ResponseHeader {
                    version: TransportVersion::new(0x00),
                    flags: ResponseFlags::new(),
                    size: PayloadSize::new(0x04)
                },
                body: ResponsePayload::Success(vec![0xDE, 0xAD, 0xBE, 0xEF].into())
            },
            &[0x00, 0x00, 0x00, 0x04, 0xDE, 0xAD, 0xBE, 0xEF]
        ),
        binary_response_error_deadline_exceeded(
            Response {
                header: ResponseHeader {
                    version: TransportVersion::new(0x00),
                    flags: ResponseFlags::new(),
                    size: PayloadSize::new(0x00)
                },
                body: ResponsePayload::Error(ResponseError::DeadlineExceeded)
            },
            &[0x00, 0x00, 0x00, 0x01]
        ),
    ];

    assert_text![
        text_response_success_empty(
            Response {
                header: ResponseHeader {
                    version: TransportVersion::new(0x00),
                    flags: ResponseFlags::new(),
                    size: PayloadSize::new(0x00)
                },
                body: ResponsePayload::Success(vec![].into())
            },
            "0 0 0 0 0"
        ),
        text_response_success_content(
            Response {
                header: ResponseHeader {
                    version: TransportVersion::new(0x00),
                    flags: ResponseFlags::new(),
                    size: PayloadSize::new(0x04)
                },
                body: ResponsePayload::Success(vec![0xDE, 0xAD, 0xBE, 0xEF].into())
            },
            "0 0 0 4 222 173 190 239"
        ),
        text_response_error_deadline_exceeded(
            Response {
                header: ResponseHeader {
                    version: TransportVersion::new(0x00),
                    flags: ResponseFlags::new(),
                    size: PayloadSize::new(0x00)
                },
                body: ResponsePayload::Error(ResponseError::DeadlineExceeded)
            },
            "0 0 0 1 0"
        ),
        text_response_error_connection_closed(
            Response {
                header: ResponseHeader {
                    version: TransportVersion::new(0x00),
                    flags: ResponseFlags::new(),
                    size: PayloadSize::new(0x00)
                },
                body: ResponsePayload::Error(ResponseError::ConnectionClosed)
            },
            "0 0 0 1 1"
        ),
    ];

    #[tokio::test]
    async fn decode_header_exceeds_limit() {
        let error = PackedResponseHeader::decode_binary(
            &mut &[0x00, 0x01, 0x00][..],
            Limit {
                response_size: 0x02,
                request_size: 0x03,
            },
        )
        .await
        .unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "payload size exceeds limit");
    }

    #[tokio::test]
    async fn encode_incorrect_transport_version() {
        let error = PackedResponseHeader {
            version: TransportVersion::new(0x01),
            flags: ResponseFlags::new(),
        }
        .encode_binary(&mut Vec::new())
        .await
        .unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "invalid transport version");
    }

    #[tokio::test]
    async fn decode_incorrect_transport_version() {
        let error =
            PackedResponseHeader::decode_binary(&mut &[0x01, 0x00, 0x00][..], Default::default())
                .await
                .unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "invalid transport version");
    }

    #[tokio::test]
    async fn encode_body_size_mismatch() {
        let error = PackedResponseBody::Success {
            size: PayloadSize::new(0x05),
            bytes: vec![0xDE, 0xAD, 0xBE, 0xEF].into(),
        }
        .encode_binary(&mut Vec::new())
        .await
        .unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "body size does not match header size");
    }

    #[tokio::test]
    async fn decode_body_size_mismatch() {
        let error = PackedResponseBody::decode_binary(
            &mut &[0x00, 0x05, 0xDE, 0xAD, 0xBE, 0xEF][..],
            Default::default(),
        )
        .await
        .unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "body size does not match header size");
    }

    #[tokio::test]
    async fn encode_error_body_size_not_zero() {
        let response = Response {
            header: ResponseHeader {
                version: TransportVersion::new(0x00),
                flags: ResponseFlags::new(),
                size: PayloadSize::new(0x01),
            },
            body: ResponsePayload::Error(ResponseError::UnknownService),
        };

        let error = response.encode_binary(&mut Vec::new()).await.unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_eq!(
            error.to_string(),
            "body size must be zero for error responses"
        );
    }
}
