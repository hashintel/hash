use std::future::Future;

use tokio::io::AsyncWriteExt;

use crate::rpc::{
    ActorId, PayloadSize, ProcedureId, Request, RequestHeader, Response, ResponseHeader,
};

async fn default_encode_text<T, U>(value: &U, io: &mut T) -> std::io::Result<()>
where
    T: tokio::io::AsyncWrite + Unpin + Send,
    U: serde::Serialize,
{
    let buf = serde_json::to_vec(value)?;

    io.write_all(&buf).await?;

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

impl EncodeBinary for ProcedureId {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        let procedure_id = self.0;

        io.write_u64(procedure_id).await?;

        Ok(())
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
        let body_size = self.0;

        io.write_u64(body_size).await?;

        Ok(())
    }
}

impl EncodeBinary for RequestHeader {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        self.procedure.encode_binary(io).await?;
        self.actor.encode_binary(io).await?;
        self.size.encode_binary(io).await?;

        Ok(())
    }
}

impl EncodeBinary for Request {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        if self.header.size.as_usize() != self.body.len() {
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
        if self.header.size.as_usize() != self.body.len() {
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
