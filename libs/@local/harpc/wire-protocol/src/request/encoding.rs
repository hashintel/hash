use std::io;

use error_stack::{Result, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use super::codec::DecodeError;
use crate::{
    codec::{DecodePure, Encode},
    encoding::{AcceptEncoding, Encoding},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct EncodingHeader {
    pub encoding: Encoding,
    pub accept: AcceptEncoding,
}

impl Encode for EncodingHeader {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.encoding.encode(&mut write).await?;
        self.accept.encode(write).await
    }
}

impl DecodePure for EncodingHeader {
    type Error = DecodeError;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let encoding = Encoding::decode_pure(&mut read)
            .await
            .change_context(DecodeError)?;
        let accept = AcceptEncoding::decode_pure(read)
            .await
            .change_context(DecodeError)?;

        Ok(Self { encoding, accept })
    }
}
