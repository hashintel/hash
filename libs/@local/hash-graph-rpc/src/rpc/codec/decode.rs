use std::future::Future;

use bytes::Bytes;
use tokio::io::AsyncReadExt;
use uuid::Uuid;

use crate::rpc::{
    codec::Limit, ActorId, PayloadSize, ProcedureId, Request, RequestHeader, Response,
    ResponseHeader,
};

async fn default_decode_text<T, U>(io: &mut T, limit: Limit) -> std::io::Result<U>
where
    T: tokio::io::AsyncRead + Unpin + Send,
    U: serde::de::DeserializeOwned,
{
    let mut buf = Vec::new();

    io.take(limit.request_size).read_to_end(&mut buf).await?;

    let request = serde_json::from_slice(&buf)?;

    Ok(request)
}

pub(super) trait DecodeBinary: Sized {
    fn decode_binary<T>(
        io: &mut T,
        limit: Limit,
    ) -> impl Future<Output = std::io::Result<Self>> + Send
    where
        T: tokio::io::AsyncRead + Unpin + Send;
}

pub(super) trait Decode: DecodeBinary {
    fn decode_text<T>(
        io: &mut T,
        limit: Limit,
    ) -> impl Future<Output = std::io::Result<Self>> + Send
    where
        T: tokio::io::AsyncRead + Unpin + Send;
}

impl DecodeBinary for ProcedureId {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let procedure_id = io.read_u64().await?;
        let procedure_id = ProcedureId::from(procedure_id);

        Ok(procedure_id)
    }
}

impl DecodeBinary for ActorId {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let actor_id = io.read_u128().await?;
        let actor_id = ActorId::from(Uuid::from_u128(actor_id));

        Ok(actor_id)
    }
}

impl DecodeBinary for PayloadSize {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let body_size = io.read_u64().await?;
        let body_size = PayloadSize::from(body_size);

        Ok(body_size)
    }
}

/// The binary message layout of Request Header is:
///
/// | Procedure ID (u64) | Actor ID (u128) | Body Size (u64) |
impl DecodeBinary for RequestHeader {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
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
            procedure: procedure_id,
            actor: actor_id,
            size: payload_size,
        })
    }
}

impl DecodeBinary for Request {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let header = RequestHeader::decode_binary(io, limit).await?;

        let mut buffer = Vec::with_capacity(header.size.into());

        io.take(header.size.into()).read_to_end(&mut buffer).await?;

        let body = Bytes::from(buffer);

        Ok(Self { header, body })
    }
}

impl Decode for Request {
    async fn decode_text<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        default_decode_text(io, limit).await
    }
}

/// The binary message layout of Response Header is:
///
/// | Body Size (u64) |
impl DecodeBinary for ResponseHeader {
    async fn decode_binary<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
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
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let header = ResponseHeader::decode_binary(io, limit).await?;

        let mut buffer = Vec::with_capacity(header.size.into());

        io.take(header.size.into()).read_to_end(&mut buffer).await?;

        let body = Bytes::from(buffer);

        Ok(Self { header, body })
    }
}

impl Decode for Response {
    async fn decode_text<T>(io: &mut T, limit: Limit) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        default_decode_text(io, limit).await
    }
}
