//! RPC Codec that isn't tied to the protocol used in the content of the RPC message itself.
//!
//! To enable debugging this can either be text or binary.
//!
//! The binary format is described as followed:
//! | Header | Body |
//!
//! The (request) header is:
//! | Procedure ID (u64) | Actor ID (u128) | Body Size (u64) |
//!
//! The header is in network order, so big endian.

mod decode;
mod encode;

use libp2p::{
    futures::{AsyncRead, AsyncWrite},
    StreamProtocol,
};
use tokio_util::compat::FuturesAsyncReadCompatExt;

use crate::rpc::{
    codec::{
        decode::{Decode, DecodeBinary},
        encode::{Encode, EncodeBinary},
    },
    Request, Response,
};

/// Max request size in bytes
const REQUEST_SIZE_MAXIMUM: u64 = 1024 * 1024;
/// Max response size in bytes
const RESPONSE_SIZE_MAXIMUM: u64 = 10 * 1024 * 1024;

#[derive(Debug, Copy, Clone)]
struct Limit {
    request_size: u64,
    response_size: u64,
}

impl Default for Limit {
    fn default() -> Self {
        Self {
            request_size: REQUEST_SIZE_MAXIMUM,
            response_size: RESPONSE_SIZE_MAXIMUM,
        }
    }
}

enum CodecKind {
    Text,
    Binary,
}

struct Codec {
    kind: CodecKind,
    limit: Limit,
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
            CodecKind::Text => Request::decode_text(&mut io, self.limit),
            CodecKind::Binary => Request::decode_binary(&mut io, self.limit),
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
            CodecKind::Text => Response::decode_text(&mut io, self.limit),
            CodecKind::Binary => Response::decode_binary(&mut io, self.limit),
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
        let mut io = io.compat();
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
        let mut io = io.compat();
        match self.kind {
            CodecKind::Text => res.encode_text(&mut io).await,
            CodecKind::Binary => res.encode_binary(&mut io).await,
        }
    }
}
