use core::error::Error;

use bytes::Buf;
use error_stack::Report;
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

pub trait ReportEncoder: Encoder<Error = Report<Self::Context>> {
    type Context: Error + Send + Sync + 'static;
}

impl<T, C> ReportEncoder for T
where
    T: Encoder<Error = Report<C>>,
    C: Error + Send + Sync + 'static,
{
    type Context = C;
}
