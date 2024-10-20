use bytes::Buf;
use futures_core::{Stream, TryStream};

pub trait Decoder {
    type Error;

    type Output<T, Input>: Stream<Item = Result<T, Self::Error>> + Send
    where
        T: serde::de::DeserializeOwned,
        Input: TryStream<Ok: Buf> + Send;

    fn decode<T, S>(self, items: S) -> Self::Output<T, S>
    where
        T: serde::de::DeserializeOwned,
        S: TryStream<Ok: Buf> + Send;
}
