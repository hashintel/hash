use core::error::Error;

use bytes::Buf;
use error_stack::Report;
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

// This trait is needed for service delegate, as otherwise the TAIT captures the underlying generic.
pub trait ReportDecoder: Decoder<Error = Report<Self::Context>> {
    type Context: Error + Send + Sync + 'static;
}

impl<T, C> ReportDecoder for T
where
    T: Decoder<Error = Report<C>>,
    C: Error + Send + Sync + 'static,
{
    type Context = C;
}
