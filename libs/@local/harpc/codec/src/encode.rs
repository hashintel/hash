use core::error::Error;

use bytes::Buf;
use error_stack::{Context, Report};
use futures_core::Stream;

use crate::error::EncodedError;

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

/// Encode an error into a byte stream.
///
/// # Contract
///
/// Implementors of this trait must ensure that each network error is preceded by a 1-byte tag.
///
/// The tag `0xFF` is reserved for errors that happen during encoding.
pub trait ErrorEncoder {
    /// Encode a network error.
    ///
    /// The tag for a network error is `0x00`.
    fn encode_error<E>(self, error: E) -> EncodedError
    where
        E: Error + serde::Serialize;

    /// Encode a report.
    ///
    /// the tag for a report is `0x01`.
    fn encode_report<C>(self, report: Report<C>) -> EncodedError
    where
        C: Context;
}
