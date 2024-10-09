use bytes::{Buf, Bytes};
use error_stack::{Context, Report};
use futures_core::Stream;

pub trait Decoder {
    type Error;

    fn decode<T, B, E>(
        self,
        items: impl Stream<Item = Result<B, E>> + Send + Sync,
    ) -> impl Stream<Item = Result<T, Self::Error>> + Send + Sync
    where
        T: serde::de::DeserializeOwned,
        B: Buf;
}

pub trait ErrorDecoder {
    type Error;
    type Recovery;

    /// Decodes an error from a stream of bytes.
    ///
    /// # Errors
    ///
    /// Returns `Self::Error` if decoding fails.
    fn decode_error<E>(
        self,
        bytes: impl Stream<Item = Bytes> + Send + Sync,
    ) -> impl Future<Output = Result<E, Self::Error>> + Send
    where
        E: serde::de::DeserializeOwned;

    /// Decodes a report from a stream of bytes.
    ///
    /// # Errors
    ///
    /// Returns `Self::Error` if decoding fails.
    fn decode_report<C>(
        self,
        bytes: impl Stream<Item = Bytes> + Send + Sync,
    ) -> impl Future<Output = Result<Report<C>, Self::Error>> + Send
    where
        C: Context;

    /// Decodes recovery information from a stream of bytes.
    ///
    /// # Errors
    ///
    /// Returns `Self::Error` if decoding fails.
    fn decode_recovery(
        self,
        bytes: impl Stream<Item = Bytes> + Send + Sync,
    ) -> impl Future<Output = Self::Recovery> + Send;
}
