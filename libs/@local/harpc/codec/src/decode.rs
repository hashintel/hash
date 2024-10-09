use core::error::Error;

use bytes::Buf;
use futures_core::Stream;

pub trait Decoder {
    type Error;

    fn decode<T, B, E>(
        self,
        items: impl Stream<Item = Result<B, E>> + Send + Sync,
    ) -> impl Stream<Item = Result<T, Self::Error>> + Send + Sync
    where
        T: serde::de::DeserializeOwned,
        B: Buf,
        E: Error;
}
