#![feature(
    macro_metavar_expr,
    const_fmt_arguments_new,
    error_generic_member_access,
    impl_trait_in_assoc_type
)]

use core::error::Error;

use bytes::Buf;
use futures_core::Stream;

use crate::{decode::Decoder, encode::Encoder};

pub mod codec;
pub mod decode;
pub mod encode;
pub mod error;
#[cfg(feature = "json")]
pub mod json;

pub trait Codec: Encoder + Decoder {}

impl<T> Codec for T where T: Encoder + Decoder {}

pub struct SplitCodec<E, D> {
    pub encoder: E,
    pub decoder: D,
}

impl<E, D> Encoder for SplitCodec<E, D>
where
    E: Encoder,
    D: Decoder,
{
    type Buf = E::Buf;
    type Error = E::Error;

    fn encode<T>(
        self,
        input: impl Stream<Item = T> + Send + Sync,
    ) -> impl Stream<Item = Result<Self::Buf, Self::Error>> + Send + Sync
    where
        T: serde::Serialize,
    {
        self.encoder.encode(input)
    }
}

impl<E, D> Decoder for SplitCodec<E, D>
where
    E: Encoder,
    D: Decoder,
{
    type Error = D::Error;

    fn decode<T, B, Err>(
        self,
        items: impl Stream<Item = Result<B, Err>> + Send + Sync,
    ) -> impl Stream<Item = Result<T, Self::Error>> + Send + Sync
    where
        T: serde::de::DeserializeOwned,
        B: Buf,
        Err: Error,
    {
        self.decoder.decode(items)
    }
}
