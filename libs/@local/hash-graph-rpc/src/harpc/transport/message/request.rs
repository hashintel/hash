use std::future::Future;

use bytes::Bytes;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use super::serde_compat;
use crate::harpc::{
    procedure::ProcedureId,
    service::ServiceId,
    transport::{
        codec::{
            decode::{default_decode_text, DecodeBinary, DecodeText},
            encode::{default_encode_text, EncodeBinary, EncodeText},
            Limit,
        },
        message::{
            actor::ActorId,
            size::PayloadSize,
            version::{ServiceVersion, TransportVersion, Version},
        },
        TRANSPORT_VERSION,
    },
};

/// # Request Flags
///
/// ## Binary Packet Layout
///
/// ```text
///  0 1 2 3 4 5 6 7 8 9 A B C D E F
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |            Unused             |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Unused (16 bits)
/// total 16 bits
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct RequestFlags([u8; 2]);

impl RequestFlags {
    pub(crate) fn new() -> Self {
        Self([0x00; 2])
    }
}

impl EncodeBinary for RequestFlags {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        io.write_all(&self.0).await
    }
}

impl DecodeBinary for RequestFlags {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let mut bytes = [0_u8; 2];
        io.read_exact(&mut bytes).await?;
        let value = Self(bytes);

        Ok(value)
    }
}

/// # Request Header
///
/// ## Binary Packet Layout
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |T|F. |P|     ServiceId     |    ProcedureId    |    ActorId    |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |               |       Size        |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * TransportVersion (1 byte)
/// * Flags (2 bytes)
/// * ServiceVersion (1 byte)
/// * ServiceId (10 bytes)
/// * ProcedureId (10 bytes)
/// * ActorId (16 bytes)
/// * Size (10 bytes)
/// total 50 bytes
/// ```
///
/// [`ServiceId`], [`ProcedureId`], [`Size`] utilize variable integer encoding, the
/// maximum size of the packet is 50 bytes, the minimum size is 23 bytes.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct RequestHeader {
    pub(crate) flags: RequestFlags,
    pub(crate) version: Version,
    pub(crate) service: ServiceId,
    pub(crate) procedure: ProcedureId,
    pub(crate) actor: ActorId,
    pub(crate) size: PayloadSize,
}

impl EncodeBinary for RequestHeader {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let Self {
            flags,
            version,
            service,
            procedure,
            actor,
            size,
        } = self;

        version.transport.encode_binary(io).await?;
        flags.encode_binary(io).await?;

        version.service.encode_binary(io).await?;
        service.encode_binary(io).await?;
        procedure.encode_binary(io).await?;

        actor.encode_binary(io).await?;
        size.encode_binary(io).await?;

        Ok(())
    }
}

impl DecodeBinary for RequestHeader {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let transport_version = TransportVersion::decode_binary(io, limit).await?;
        let flags = RequestFlags::decode_binary(io, limit).await?;

        if transport_version != TRANSPORT_VERSION {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "unsupported version mismatch",
            ));
        }

        let service_version = ServiceVersion::decode_binary(io, limit).await?;
        let service = ServiceId::decode_binary(io, limit).await?;
        let procedure = ProcedureId::decode_binary(io, limit).await?;

        let actor = ActorId::decode_binary(io, limit).await?;
        let size = PayloadSize::decode_binary(io, limit).await?;

        if size.exceeds(limit.request_size) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "request size exceeds limit",
            ));
        }

        let value = Self {
            flags,
            version: Version {
                transport: transport_version,
                service: service_version,
            },
            service,
            procedure,
            actor,
            size,
        };

        Ok(value)
    }
}

/// # Request
///
/// ## Binary Packet Layout
///
/// (The binary packet layout assumes worst case scenario for the header).
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                            Header                             |
/// +                                   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                                   |                           |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+                           +
/// |                             Body                              |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Header (50 bytes)
/// * Body (46 bytes)
/// total 96 bytes
/// ```
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Request {
    pub(crate) header: RequestHeader,
    #[serde(with = "serde_compat::bytes")]
    pub(crate) body: Bytes,
}

impl EncodeBinary for Request {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let Self { header, body } = self;

        if self.header.size.into_usize() != body.len() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "request size mismatch",
            ));
        }

        header.encode_binary(io).await?;
        io.write_all(body).await?;

        Ok(())
    }
}

impl EncodeText for Request {
    fn encode_text<T>(&self, io: &mut T) -> impl Future<Output = std::io::Result<()>> + Send
    where
        T: AsyncWrite + Unpin + Send,
    {
        default_encode_text(self, io)
    }
}

impl DecodeBinary for Request {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let header = RequestHeader::decode_binary(io, limit).await?;

        let mut buffer = Vec::with_capacity(header.size.into_usize());
        io.take(header.size.into_u64())
            .read_to_end(&mut buffer)
            .await?;
        let body = Bytes::from(buffer);

        if body.len() != header.size.into_usize() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "request size mismatch",
            ));
        }

        let value = Self { header, body };
        Ok(value)
    }
}

impl DecodeText for Request {
    fn decode_text<T>(
        io: &mut T,
        limit: Limit,
    ) -> impl Future<Output = std::io::Result<Self>> + Send
    where
        T: AsyncRead + Unpin + Send,
    {
        default_decode_text(io, limit)
    }
}

#[cfg(test)]
mod test {
    use bytes::Bytes;
    use uuid::Uuid;

    use crate::harpc::{
        procedure::ProcedureId,
        service::ServiceId,
        transport::{
            codec::{
                encode::EncodeBinary,
                test::{assert_binary, assert_text, decode_binary, encode_binary},
                Limit,
            },
            message::{
                actor::ActorId,
                request::{Request, RequestFlags, RequestHeader},
                size::PayloadSize,
                version::{ServiceVersion, TransportVersion, Version},
            },
        },
    };

    assert_binary![
        binary_request_flags_zero(RequestFlags::new(), &[0x00, 0x00]),
        binary_request_flags_example(RequestFlags([0x01, 0x02]), &[0x01, 0x02]),
    ];

    assert_binary![
        binary_request_header_zero(
            RequestHeader {
                version: Version {
                    transport: TransportVersion::new(0),
                    service: ServiceVersion::new(0),
                },
                flags: RequestFlags::new(),
                service: ServiceId::new(0),
                procedure: ProcedureId::new(0),
                actor: ActorId::new(Uuid::nil()),
                size: PayloadSize::new(0),
            },
            &[
                0x00, // TransportVersion
                0x00, 0x00, // Flags
                0x00, // ServiceVersion
                0x00, // ServiceId,
                0x00, // ProcedureId,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, // ActorId
                0x00, // Size
            ]
        ),
        binary_request_header_random(
            RequestHeader {
                version: Version {
                    transport: TransportVersion::new(0x12),
                    service: ServiceVersion::new(0x87),
                },
                flags: RequestFlags([0x01, 0x02]),
                service: ServiceId::new(0x34),
                procedure: ProcedureId::new(0x56),
                actor: ActorId::new(Uuid::nil()),
                size: PayloadSize::new(0x78),
            },
            &[
                0x12, // TransportVersion
                0x01, 0x02, // Flags
                0x87, // ServiceVersion
                0x34, // ServiceId,
                0x56, // ProcedureId,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, // ActorId
                0x78, // Size
            ]
        )
    ];

    assert_binary![
        binary_request_empty(
            Request {
                header: RequestHeader {
                    version: Version {
                        transport: TransportVersion::new(0x00),
                        service: ServiceVersion::new(0x00),
                    },
                    flags: RequestFlags::new(),
                    service: ServiceId::new(0x00),
                    procedure: ProcedureId::new(0x00),
                    actor: ActorId::new(Uuid::nil()),
                    size: PayloadSize::new(0x00),
                },
                body: Bytes::new(),
            },
            &[
                0x00, // TransportVersion
                0x00, 0x00, // Flags
                0x00, // ServiceVersion
                0x00, // ServiceId,
                0x00, // ProcedureId,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, // ActorId
                0x00, // Size
            ]
        ),
        binary_request_example(
            Request {
                header: RequestHeader {
                    version: Version {
                        transport: TransportVersion::new(0x00),
                        service: ServiceVersion::new(0x00),
                    },
                    flags: RequestFlags::new(),
                    service: ServiceId::new(0x00),
                    procedure: ProcedureId::new(0x00),
                    actor: ActorId::new(Uuid::nil()),
                    size: PayloadSize::new(0x04),
                },
                body: vec![0xDE, 0xAD, 0xBE, 0xEF].into(),
            },
            &[
                0x00, // TransportVersion
                0x00, 0x00, // Flags
                0x00, // ServiceVersion
                0x00, // ServiceId,
                0x00, // ProcedureId,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, // ActorId
                0x04, // Size
                0xDE, 0xAD, 0xBE, 0xEF, // Body
            ]
        )
    ];

    assert_text![text_request_example(
        Request {
            header: RequestHeader {
                version: Version {
                    transport: TransportVersion::new(0x00),
                    service: ServiceVersion::new(0x00),
                },
                flags: RequestFlags::new(),
                service: ServiceId::new(0x00),
                procedure: ProcedureId::new(0x00),
                actor: ActorId::new(Uuid::nil()),
                size: PayloadSize::new(0x04),
            },
            body: vec![0xDE, 0xAD, 0xBE, 0xEF].into(),
        },
        r#"{"header":{"size":4},"body":{"tag":"Success","payload":"3q2+7w=="}}"#
    )];

    #[tokio::test]
    async fn encode_request_size_mismatch() {
        let request = Request {
            header: RequestHeader {
                version: Version {
                    transport: TransportVersion::new(0x00),
                    service: ServiceVersion::new(0x00),
                },
                flags: RequestFlags::new(),
                service: ServiceId::new(0x00),
                procedure: ProcedureId::new(0x00),
                actor: ActorId::new(Uuid::nil()),
                size: PayloadSize::new(0x05),
            },
            body: vec![0xDE, 0xAD, 0xBE, 0xEF].into(),
        };

        let mut buffer = Vec::new();
        let error = request
            .encode_binary(&mut buffer)
            .await
            .expect_err("encode binary");

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "request size mismatch");
    }

    #[tokio::test]
    async fn encode_transport_version_mismatch() {
        let header = RequestHeader {
            version: Version {
                transport: TransportVersion::new(0x01),
                service: ServiceVersion::new(0x00),
            },
            flags: RequestFlags::new(),
            service: ServiceId::new(0x00),
            procedure: ProcedureId::new(0x00),
            actor: ActorId::new(Uuid::nil()),
            size: PayloadSize::new(0x04),
        };

        let mut buffer = Vec::new();
        let error = header
            .encode_binary(&mut buffer)
            .await
            .expect_err("encode binary");

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "unsupported version mismatch");
    }

    #[tokio::test]
    async fn decode_request_size_mismatch() {
        let request = Request {
            header: RequestHeader {
                version: Version {
                    transport: TransportVersion::new(0x00),
                    service: ServiceVersion::new(0x00),
                },
                flags: RequestFlags::new(),
                service: ServiceId::new(0x00),
                procedure: ProcedureId::new(0x00),
                actor: ActorId::new(Uuid::nil()),
                size: PayloadSize::new(0x04),
            },
            body: vec![0xDE, 0xAD, 0xBE, 0xEF].into(),
        };

        let mut buffer = Vec::new();
        request
            .encode_binary(&mut buffer)
            .await
            .expect("encode binary");

        assert_eq!(buffer[22], 0x04);
        buffer[22] = 0x05;

        let error = decode_binary(&buffer, Limit::default())
            .await
            .expect_err("request size mismatch");

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "request size mismatch");
    }

    #[tokio::test]
    async fn decode_header_exceeds_limit() {
        let header = RequestHeader {
            version: Version {
                transport: TransportVersion::new(0x00),
                service: ServiceVersion::new(0x00),
            },
            flags: RequestFlags::new(),
            service: ServiceId::new(0x00),
            procedure: ProcedureId::new(0x00),
            actor: ActorId::new(Uuid::nil()),
            size: PayloadSize::new(0x12),
        };

        let buffer = encode_binary(header).await.expect("encode binary");

        let error = decode_binary(
            &buffer,
            Limit {
                request_size: 0x11,
                response_size: 0xFF,
            },
        )
        .await
        .expect_err("header exceeds limit");

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "request size exceeds limit");
    }

    #[tokio::test]
    async fn decode_transport_version_mismatch() {
        let header = RequestHeader {
            version: Version {
                transport: TransportVersion::new(0x01),
                service: ServiceVersion::new(0x00),
            },
            flags: RequestFlags::new(),
            service: ServiceId::new(0x00),
            procedure: ProcedureId::new(0x00),
            actor: ActorId::new(Uuid::nil()),
            size: PayloadSize::new(0x04),
        };

        let mut buffer = Vec::new();
        header
            .encode_binary(&mut buffer)
            .await
            .expect("encode binary");

        assert_eq!(buffer[0], 0x01);

        let error = decode_binary(&buffer, Limit::default())
            .await
            .expect_err("unsupported version mismatch");

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "unsupported version mismatch");
    }
}
