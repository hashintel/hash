use std::future::Future;

use integer_encoding::VarInt;
use tokio::io::AsyncWriteExt;

use crate::rpc::{
    ActorId, PayloadSize, ProcedureId, Request, RequestHeader, Response, ResponseHeader, ServiceId,
};

async fn default_encode_text<T, U>(value: &U, io: &mut T) -> std::io::Result<()>
where
    T: tokio::io::AsyncWrite + Unpin + Send,
    U: serde::Serialize + Sync,
{
    let buf = serde_json::to_vec(value)?;

    io.write_all(&buf).await?;

    Ok(())
}

async fn write_varint<T, U>(value: U, io: &mut T) -> std::io::Result<()>
where
    T: tokio::io::AsyncWrite + Unpin + Send,
    U: VarInt + Send,
{
    let mut buf = [0_u8; 10];
    let used = value.encode_var(&mut buf);

    io.write_all(&buf[..used]).await?;

    Ok(())
}

pub(super) trait EncodeBinary: Sized {
    fn encode_binary<T>(&self, io: &mut T) -> impl Future<Output = std::io::Result<()>> + Send
    where
        T: tokio::io::AsyncWrite + Unpin + Send;
}

pub(super) trait Encode: EncodeBinary {
    fn encode_text<T>(&self, io: &mut T) -> impl Future<Output = std::io::Result<()>> + Send
    where
        T: tokio::io::AsyncWrite + Unpin + Send;
}

impl EncodeBinary for ServiceId {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        write_varint(self.0, io).await
    }
}

impl EncodeBinary for ProcedureId {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        write_varint(self.0, io).await
    }
}

impl EncodeBinary for ActorId {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        let actor_id = self.0.as_u128();

        io.write_u128(actor_id).await?;

        Ok(())
    }
}

impl EncodeBinary for PayloadSize {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        write_varint(self.0, io).await
    }
}

impl EncodeBinary for RequestHeader {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        let Self {
            service,
            procedure,
            actor,
            size,
        } = self;

        service.encode_binary(io).await?;
        procedure.encode_binary(io).await?;
        actor.encode_binary(io).await?;
        size.encode_binary(io).await?;

        Ok(())
    }
}

impl EncodeBinary for Request {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        if self.header.size.into_usize() != self.body.len() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "body size does not match header size",
            ));
        }

        self.header.encode_binary(io).await?;
        io.write_all(&self.body).await?;

        Ok(())
    }
}

impl Encode for Request {
    async fn encode_text<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        default_encode_text(self, io).await
    }
}

impl EncodeBinary for ResponseHeader {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        self.size.encode_binary(io).await?;

        Ok(())
    }
}

impl EncodeBinary for Response {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        if self.header.size.into_usize() != self.body.len() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "body size does not match header size",
            ));
        }

        self.header.encode_binary(io).await?;
        io.write_all(&self.body).await?;

        Ok(())
    }
}

impl Encode for Response {
    async fn encode_text<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        default_encode_text(self, io).await
    }
}

#[cfg(test)]
mod test {
    use bytes::Bytes;
    use uuid::Uuid;

    use crate::rpc::{
        codec::encode::{Encode, EncodeBinary},
        ActorId, PayloadSize, ProcedureId, Request, RequestHeader, Response, ResponseHeader,
        ServiceId,
    };

    const EXAMPLE_UUID: Uuid = Uuid::from_bytes([
        0x5B, 0xC2, 0xA5, 0x38, 0xFA, 0x94, 0x41, 0x00, 0x86, 0x00, 0x53, 0xAF, 0xCF, 0x8A, 0xA6,
        0xFF,
    ]);

    async fn assert_binary<T>(value: T, expected: &[u8])
    where
        T: EncodeBinary + Send,
    {
        let mut buffer = Vec::new();
        value.encode_binary(&mut buffer).await.expect("encode");

        assert_eq!(buffer, expected);
    }

    macro_rules! assert_binary {
        ($($name:ident: $value:expr => $expected:expr;)*) => {
            $(
                #[tokio::test]
                async fn $name() {
                    assert_binary($value, &$expected).await;
                }
            )*
        };
    }

    macro_rules! assert_text {
        ($($name:ident: $value:expr => $expected:expr;)*) => {
            $(
                #[tokio::test]
                async fn $name() {
                    let mut buffer = Vec::new();
                    $value.encode_text(&mut buffer).await.expect("encode");

                    let actual = String::from_utf8(buffer).expect("utf8");

                    assert_eq!(actual, $expected);
                }
            )*
        };
    }

    assert_binary![
        encode_procedure_id: ProcedureId::new(0x1234_5678_90AB_CDEF) => [0xEF, 0x9B, 0xAF, 0x85, 0x89, 0xCF, 0x95, 0x9A, 0x12];
        encode_procedure_id_zero: ProcedureId::new(0) => [0x00];

        encode_actor_id: ActorId::from(EXAMPLE_UUID) => EXAMPLE_UUID.into_bytes();
        encode_actor_id_zero: ActorId::from(Uuid::nil()) => [0x0; 16];

        encode_payload_size: PayloadSize::from(0x1234_5678_90AB_CDEF) => [0xEF, 0x9B, 0xAF, 0x85, 0x89, 0xCF, 0x95, 0x9A, 0x12];
        encode_payload_size_zero: PayloadSize::from(0) => [0x00];

        encode_request_header: RequestHeader {
            service: ServiceId::new(0x02),
            procedure: ProcedureId::new(0x12),
            actor: ActorId::from(EXAMPLE_UUID),
            size: PayloadSize::from(0x70),
        } => [
            0x02,
            0x12,
            0x5B, 0xC2, 0xA5, 0x38, 0xFA, 0x94, 0x41, 0x00, 0x86, 0x00, 0x53, 0xAF, 0xCF, 0x8A, 0xA6, 0xFF,
            0x70,
        ];

        encode_request: Request {
            header: RequestHeader {
                service: ServiceId::new(0x02),
                procedure: ProcedureId::new(0x12),
                actor: ActorId::from(EXAMPLE_UUID),
                size: PayloadSize::from(0x04),
            },
            body: Bytes::from(vec![0xDE, 0xAD, 0xBE, 0xEF]),
        } => [
            0x02,
            0x12,
            0x5B, 0xC2, 0xA5, 0x38, 0xFA, 0x94, 0x41, 0x00, 0x86, 0x00, 0x53, 0xAF, 0xCF, 0x8A, 0xA6, 0xFF,
            0x04,
            0xDE, 0xAD, 0xBE, 0xEF,
        ];

        encode_response_header: ResponseHeader {
            size: PayloadSize::from(0x70),
        } => [
            0x70,
        ];

        encode_response: Response {
            header: ResponseHeader {
                size: PayloadSize::from(0x04),
            },
            body: Bytes::from(vec![0xDE, 0xAD, 0xBE, 0xEF]),
        } => [
            0x04,
            0xDE, 0xAD, 0xBE, 0xEF,
        ];
    ];

    #[tokio::test]
    async fn incorrect_request_body_size() {
        let request = Request {
            header: RequestHeader {
                service: ServiceId::new(0x02),
                procedure: ProcedureId::new(0x12),
                actor: ActorId::from(EXAMPLE_UUID),
                size: PayloadSize::from(0x06),
            },
            body: Bytes::from(vec![0xDE, 0xAD, 0xBE, 0xEF]),
        };

        let mut buffer = Vec::new();
        let result = request.encode_binary(&mut buffer).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn incorrect_response_body_size() {
        let response = Response {
            header: ResponseHeader {
                size: PayloadSize::from(0x06),
            },
            body: Bytes::from(vec![0xDE, 0xAD, 0xBE, 0xEF]),
        };

        let mut buffer = Vec::new();
        let result = response.encode_binary(&mut buffer).await;

        assert!(result.is_err());
    }

    assert_text![
        encode_request_text: Request {
            header: RequestHeader {
                service: ServiceId::new(0x02),
                procedure: ProcedureId::new(0x12),
                actor: ActorId::from(EXAMPLE_UUID),
                size: PayloadSize::from(0x04),
            },
            body: Bytes::from(vec![0xDE, 0xAD, 0xBE, 0xEF]),
        } => r#"{"header":{"procedure":18,"actor":"5bc2a538-fa94-4100-8600-53afcf8aa6ff","size":4},"body":"3q2+7w=="}"#;
    ];

    assert_text![
        encode_response_text: Response {
            header: ResponseHeader {
                size: PayloadSize::from(0x04),
            },
            body: Bytes::from(vec![0xDE, 0xAD, 0xBE, 0xEF]),
        } => r#"{"header":{"size":4},"body":"3q2+7w=="}"#;
    ];
}
