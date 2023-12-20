//! RPC Codec that isn't tied to the protocol used in the content of the RPC message itself.
//!
//! To enable debugging this can either be text or binary.
//!
//! The header is in network order, so big endian.
//! Variable Integers are encoded in little endian using the integer-encoding crate.

pub(crate) mod decode;
pub(crate) mod encode;

use libp2p::{
    futures::{AsyncRead, AsyncWrite},
    StreamProtocol,
};
use tokio_util::compat::{FuturesAsyncReadCompatExt, FuturesAsyncWriteCompatExt};

use crate::harpc::transport::{
    codec::{
        decode::{DecodeBinary, DecodeText},
        encode::{EncodeBinary, EncodeText},
    },
    message::{request::Request, response::Response},
};

/// Max request size in bytes
const REQUEST_SIZE_MAXIMUM: u64 = 1024 * 1024;
/// Max response size in bytes
const RESPONSE_SIZE_MAXIMUM: u64 = 10 * 1024 * 1024;

#[derive(Debug, Copy, Clone)]
pub struct Limit {
    pub request_size: u64,
    pub response_size: u64,
}

impl Default for Limit {
    fn default() -> Self {
        Self {
            request_size: REQUEST_SIZE_MAXIMUM,
            response_size: RESPONSE_SIZE_MAXIMUM,
        }
    }
}

#[derive(Debug, Copy, Clone, Default)]
pub enum CodecKind {
    Text,
    #[default]
    Binary,
}

#[derive(Debug, Copy, Clone, Default)]
pub struct Codec {
    pub kind: CodecKind,
    pub limit: Limit,
}

#[async_trait::async_trait]
impl libp2p::request_response::Codec for Codec {
    type Protocol = StreamProtocol;
    type Request = Request;
    type Response = Response;

    async fn read_request<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
    ) -> std::io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        let mut io = io.compat();
        match self.kind {
            CodecKind::Text => Request::decode_text(&mut io, self.limit).await,
            CodecKind::Binary => Request::decode_binary(&mut io, self.limit).await,
        }
    }

    async fn read_response<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
    ) -> std::io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        let mut io = io.compat();
        match self.kind {
            CodecKind::Text => Response::decode_text(&mut io, self.limit).await,
            CodecKind::Binary => Response::decode_binary(&mut io, self.limit).await,
        }
    }

    async fn write_request<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        req: Self::Request,
    ) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let mut io = io.compat_write();
        match self.kind {
            CodecKind::Text => req.encode_text(&mut io).await,
            CodecKind::Binary => req.encode_binary(&mut io).await,
        }
    }

    async fn write_response<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        res: Self::Response,
    ) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let mut io = io.compat_write();
        match self.kind {
            CodecKind::Text => res.encode_text(&mut io).await,
            CodecKind::Binary => res.encode_binary(&mut io).await,
        }
    }
}

#[cfg(test)]
pub(crate) mod test {
    use std::{fmt::Debug, io};

    use uuid::Uuid;

    use crate::harpc::transport::codec::{
        decode::{DecodeBinary, DecodeText},
        encode::{EncodeBinary, EncodeText},
        Limit,
    };

    pub(crate) const EXAMPLE_UUID: Uuid = Uuid::from_bytes([
        0x5B, 0xC2, 0xA5, 0x38, 0xFA, 0x94, 0x41, 0x00, 0x86, 0x00, 0x53, 0xAF, 0xCF, 0x8A, 0xA6,
        0xFF,
    ]);

    pub(in crate::harpc) async fn encode_binary<T>(value: T) -> io::Result<Vec<u8>>
    where
        T: EncodeBinary + Send,
    {
        let mut buffer = Vec::new();
        value.encode_binary(&mut buffer).await?;

        Ok(buffer)
    }

    pub(in crate::harpc) async fn assert_encode_binary<T>(value: T, expected: &[u8])
    where
        T: EncodeBinary + Send,
    {
        let buffer = encode_binary(value).await.expect("encode");

        assert_eq!(buffer, expected);
    }

    pub(in crate::harpc) async fn decode_binary<T>(value: &[u8], limit: Limit) -> io::Result<T>
    where
        T: DecodeBinary + Send,
    {
        T::decode_binary(&mut &*value, limit).await
    }

    pub(in crate::harpc) async fn assert_decode_binary<T>(value: &[u8], expected: T)
    where
        T: PartialEq + Debug + DecodeBinary + Send,
    {
        let result: T = decode_binary(value, Limit::default())
            .await
            .expect("decode");

        assert_eq!(result, expected);
    }

    pub(in crate::harpc) async fn assert_encode_text<T>(value: T, expected: &str)
    where
        T: EncodeText + Send,
    {
        let mut buffer = Vec::new();
        value.encode_text(&mut buffer).await.expect("encode");

        let result = String::from_utf8(buffer).expect("utf8");

        assert_eq!(result, expected);
    }

    pub(in crate::harpc) async fn assert_decode_text<T>(value: &str, expected: T)
    where
        T: PartialEq + Debug + DecodeText + Send,
    {
        let result = T::decode_text(&mut value.as_bytes(), Limit::default())
            .await
            .expect("decode failed");

        assert_eq!(result, expected);
    }

    macro_rules! assert_binary {
        (
            $(
                $name:ident($value:expr, $expected:expr)
            ),*
            $(,)?
        ) => {
            $(
                #[tokio::test]
                async fn $name() {
                    $crate::harpc::transport::codec::test::assert_encode_binary($value, $expected).await;
                    $crate::harpc::transport::codec::test::assert_decode_binary($expected, $value).await;
                }
            )*
        };
    }

    macro_rules! assert_text {
        (
            $(
                $name:ident($value:expr, $expected:expr)
            ),*
            $(,)?
        ) => {
            $(
                #[tokio::test]
                async fn $name() {
                    $crate::harpc::transport::codec::test::assert_encode_text($value, $expected).await;
                    $crate::harpc::transport::codec::test::assert_decode_text($expected, $value).await;
                }
            )*
        };
    }

    pub(crate) use assert_binary;
    pub(crate) use assert_text;
}
