use bytes::Buf;
use futures_core::Stream;

pub trait Encoder {
    type Buf: Buf;
    type Error;

    fn encode<T>(
        self,
        input: impl Stream<Item = T> + Send + Sync,
    ) -> impl Stream<Item = Result<Self::Buf, Self::Error>> + Send + Sync
    where
        T: serde::Serialize;
}
