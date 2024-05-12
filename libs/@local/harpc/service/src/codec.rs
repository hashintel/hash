use std::error::Error;

use bytes::Bytes;
use error_stack::{Context, Report, Result};
use futures::Stream;
use harpc_wire_protocol::response::kind::ErrorCode;

use crate::session::error::TransactionError;

pub trait ValueEncoder<T> {
    type Error: Context;

    fn encode_stream(
        &self,
        items: impl Stream<Item = T> + Send + Sync + 'static,
    ) -> impl Future<Output = impl Stream<Item = Result<Bytes, Self::Error>> + Send + Sync + 'static>
    + Send;
}

pub trait PlainError: Error {
    fn code(&self) -> ErrorCode;
}

pub trait ErrorEncoder {
    /// Encode an error report into a stream of bytes.
    ///
    /// This method is infallible, as we need to report an error, if encoding of a report fails we'd
    /// be unable to report it to the client.
    fn encode_report<C>(&self, report: Report<C>) -> impl Future<Output = TransactionError> + Send;

    /// Encode a plain error into a stream of bytes.
    ///
    /// This method is infallible, as we need to report an error, if encoding of a report fails we'd
    /// be unable to report it to the client.
    ///
    /// This is only used in lower-level errors, in which a report cannot be utilized.
    fn encode_error<E>(&self, error: E) -> impl Future<Output = TransactionError> + Send
    where
        E: PlainError;
}

pub trait Encoder<T>: ValueEncoder<T> + ErrorEncoder {}

pub trait ValueDecoder<T> {
    type Error: Context;

    fn decode_stream(
        &self,
        items: impl Stream<Item = Bytes> + Send + Sync + 'static,
    ) -> impl Future<Output = impl Stream<Item = Result<T, Self::Error>> + Send + Sync + 'static>;
}

pub trait ErrorDecoder {
    type Output;
    type Error: Context;

    /// Decode an error report from a stream of bytes.
    fn decode_report(
        &self,
        bytes: impl Stream<Item = Bytes> + Send + Sync + 'static,
    ) -> impl Future<Output = Result<Self::Output, Self::Error>> + Send;

    /// Decode a plain error from a stream of bytes.
    fn decode_error(
        &self,
        bytes: impl Stream<Item = Bytes> + Send + Sync + 'static,
    ) -> impl Future<Output = Result<Self::Output, Self::Error>> + Send;
}

pub trait Decoder<T>: ValueDecoder<T> + ErrorDecoder {}

pub trait Codec<T> {
    type Encoder: Encoder<T>;
    type Decoder: Decoder<T>;

    fn encoder(&self) -> &Self::Encoder;
    fn decoder(&self) -> &Self::Decoder;
}
