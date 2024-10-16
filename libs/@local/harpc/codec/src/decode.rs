use bytes::{Buf, Bytes};
use error_stack::{Context, Report};
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

pub trait ErrorDecoder {
    type Error;
    /// Type of recovery information.
    ///
    /// This type represents recovery information used when error encoding fails.
    /// During error encoding with `serde`, failures can occur. To prevent a complete
    /// encoding process failure and ensure some error information reaches the user,
    /// we encode any serialization errors as recovery errors.
    ///
    /// Unlike regular error encoding, recovery error encoding is guaranteed to succeed.
    /// The codec itself, not the user, determines the recovery type, this is often just a simple
    /// [`Display`] representation of the serialization error.
    ///
    /// [`Display`]: core::fmt::Display
    type Recovery;

    /// Decodes an error from a stream of bytes.
    ///
    /// # Errors
    ///
    /// Returns `Self::Error` if decoding fails.
    fn decode_error<E>(self, bytes: Bytes) -> Result<E, Self::Error>
    where
        E: serde::de::DeserializeOwned;

    /// Decodes a report from a stream of bytes.
    ///
    /// # Errors
    ///
    /// Returns `Self::Error` if decoding fails.
    fn decode_report<C>(self, bytes: Bytes) -> Result<Report<C>, Self::Error>
    where
        C: Context;

    /// Decodes recovery information from a stream of bytes.
    ///
    /// # Errors
    ///
    /// Returns `Self::Error` if decoding fails.
    fn decode_recovery(self, bytes: Bytes) -> Self::Recovery;
}
