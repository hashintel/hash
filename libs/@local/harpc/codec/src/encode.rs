use bytes::Buf;
use futures_core::Stream;

pub trait Encoder {
    type Buf: Buf;
    type Error;

    type Output<Input>: Stream<Item = Result<Self::Buf, Self::Error>> + Send
    where
        Input: Stream + Send;

    fn encode<T, S>(self, input: S) -> Self::Output<S>
    where
        S: Stream<Item = T> + Send,
        T: serde::Serialize;
}
