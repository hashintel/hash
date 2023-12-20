use std::future::Future;

use integer_encoding::VarInt;
use tokio::io::AsyncWriteExt;

pub(in crate::harpc) async fn default_encode_text<T, U>(
    value: &U,
    io: &mut T,
) -> std::io::Result<()>
where
    T: tokio::io::AsyncWrite + Unpin + Send,
    U: serde::Serialize + Sync,
{
    let buf = serde_json::to_vec(value)?;

    io.write_all(&buf).await?;

    Ok(())
}

pub(in crate::harpc) async fn write_varint<T, U>(value: U, io: &mut T) -> std::io::Result<()>
where
    T: tokio::io::AsyncWrite + Unpin + Send,
    U: VarInt + Send,
{
    let mut buf = [0_u8; 10];
    let used = value.encode_var(&mut buf);

    io.write_all(&buf[..used]).await?;

    Ok(())
}

pub(in crate::harpc) trait EncodeBinary: Sized {
    fn encode_binary<T>(&self, io: &mut T) -> impl Future<Output = std::io::Result<()>> + Send
    where
        T: tokio::io::AsyncWrite + Unpin + Send;
}

pub(in crate::harpc) trait EncodeText: EncodeBinary {
    fn encode_text<T>(&self, io: &mut T) -> impl Future<Output = std::io::Result<()>> + Send
    where
        T: tokio::io::AsyncWrite + Unpin + Send;
}
