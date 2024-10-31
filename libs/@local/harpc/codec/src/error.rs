use core::{
    error::Error,
    fmt::{self, Debug, Display, Write},
};

use bytes::{BufMut, Bytes, BytesMut};
use error_stack::Report;
use harpc_types::error_code::ErrorCode;

fn error_request_error_code<E>(error: &E) -> ErrorCode
where
    E: core::error::Error,
{
    core::error::request_ref(error)
        .copied()
        .or_else(|| core::error::request_value(error))
        .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR)
}

fn report_request_error_code<C>(report: &Report<C>) -> ErrorCode {
    report
        .request_ref()
        .next()
        .copied()
        .or_else(|| report.request_value().next())
        .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkError {
    code: ErrorCode,
    bytes: Bytes,
}

impl NetworkError {
    #[expect(
        clippy::cast_possible_truncation,
        clippy::big_endian_bytes,
        reason = "numbers are always encoded in big-endian in our encoding scheme"
    )]
    fn capture_display(value: &impl Display) -> Bytes {
        let mut buffer = BytesMut::new();
        buffer.put_u32(0);

        write!(&mut buffer, "{value}").unwrap_or_else(|_error| {
            unreachable!("`BytesMut` has a capacity of `usize::MAX`");
        });

        // The length is not necessarily needed if we already have the total message, although it is
        // absolutely necessary for the `NetworkError` to be able to be deserialized in a streaming
        // fashion.
        let length = buffer.len() - 4;
        debug_assert!(
            u32::try_from(length).is_ok(),
            "debug message should be smaller than 4GiB",
        );
        let length = length as u32;

        buffer[..4].copy_from_slice(&length.to_be_bytes());

        buffer.freeze()
    }

    #[must_use]
    pub fn capture_error<E>(error: &E) -> Self
    where
        E: core::error::Error,
    {
        Self {
            code: error_request_error_code(error),
            bytes: Self::capture_display(error),
        }
    }

    #[must_use]
    pub fn capture_report<C>(report: &Report<C>) -> Self {
        Self {
            code: report_request_error_code(report),
            bytes: Self::capture_display(report),
        }
    }

    pub const fn code(&self) -> ErrorCode {
        self.code
    }

    pub const fn bytes(&self) -> &Bytes {
        &self.bytes
    }

    pub fn into_bytes(self) -> Bytes {
        self.bytes
    }

    pub fn into_parts(self) -> (ErrorCode, Bytes) {
        (self.code, self.bytes)
    }

    /// Constructs a `NetworkError` from an `ErrorCode` and `Bytes`.
    ///
    /// # Errors
    ///
    /// This function will return an error if the length encoded in the first 4 bytes
    /// of the `bytes` parameter does not match the actual length of the remaining data.
    #[expect(
        clippy::big_endian_bytes,
        clippy::panic_in_result_fn,
        clippy::missing_panics_doc,
        reason = "numbers are always encoded in big-endian in our encoding scheme"
    )]
    pub fn try_from_parts(code: ErrorCode, bytes: Bytes) -> Result<Self, Bytes> {
        let slice = bytes.as_ref();
        if slice.len() < 4 {
            return Err(bytes);
        }

        // assert only exists to elide bounds checks and satisfy clippy
        assert!(slice.len() >= 4);

        let expected_length = u32::from_be_bytes([slice[0], slice[1], slice[2], slice[3]]) as usize;
        let actual_length = bytes.len() - 4;

        if actual_length != expected_length {
            return Err(bytes);
        }

        Ok(Self { code, bytes })
    }
}

impl Display for NetworkError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        // First 4 bytes are always the length of the message
        let message = &self.bytes[4..];

        if let Ok(message) = core::str::from_utf8(message) {
            Display::fmt(message, fmt)
        } else {
            Debug::fmt(&message, fmt)
        }
    }
}

impl Error for NetworkError {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(self.code);
    }
}

#[cfg(test)]
mod test {
    use super::NetworkError;

    #[derive(Debug, thiserror::Error)]
    #[error("example message")]
    struct ExampleError;

    #[expect(
        clippy::big_endian_bytes,
        reason = "numbers are always encoded in big-endian in our encoding scheme"
    )]
    #[test]
    fn properly_encodes_length() {
        let error = NetworkError::capture_error(&ExampleError);
        let value = error.into_bytes();

        assert_eq!(value[0..4], 15_u32.to_be_bytes());
        assert_eq!(value[4..], *b"example message");
    }

    // if we encode and decode the error, we should get the same error back
    #[test]
    fn encode_decode() {
        let error = NetworkError::capture_error(&ExampleError);

        let code = error.code();
        let value = error.bytes();

        let decoded =
            NetworkError::try_from_parts(code, value.clone()).expect("encode/decode should work");

        assert_eq!(decoded.code(), code);
        assert_eq!(decoded.bytes(), value);
    }
}
