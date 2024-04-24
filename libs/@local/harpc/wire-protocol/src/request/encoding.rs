use std::io;

use error_stack::{Result, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    pin,
};

use super::codec::DecodeError;
use crate::{
    codec::{Decode, Encode},
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

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        self.encoding.encode(&mut write).await?;
        self.accept.encode(write).await
    }
}

impl Decode for EncodingHeader {
    type Context = ();
    type Error = DecodeError;

    async fn decode(mut read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        let encoding = Encoding::decode(&mut read, ())
            .await
            .change_context(DecodeError)?;
        let accept = AcceptEncoding::decode(read, ())
            .await
            .change_context(DecodeError)?;

        Ok(Self { encoding, accept })
    }
}
