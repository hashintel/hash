use bytes::Bytes;

use super::serde_compat;
use crate::harpc::transport::message::size::PayloadSize;

macro_rules! convert_enum {
    ($($variant:ident <=> $value:literal),* $(,)?) => {
        const fn into_u8(self) -> u8 {
            match self {
                $(Self::$variant => $value,)*
            }
        }

        const fn try_from_u8(value: u8) -> Option<Self> {
            match value {
                $($value => Some(Self::$variant),)*
                _ => None,
            }
        }
    };
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ResponseError {
    DeadlineExceeded,
    ConnectionClosed,
    UnknownProtocolVersion,
    UnknownService,
    UnknownProcedure,
    InvalidTransportVersion,
    InvalidPayloadSize,
    InvalidPayload,
}

impl ResponseError {
    convert_enum! {
        DeadlineExceeded <=> 0x00,
        ConnectionClosed <=> 0x01,
        UnknownProtocolVersion <=> 0x02,
        UnknownService <=> 0x03,
        UnknownProcedure <=> 0x04,
        InvalidTransportVersion <=> 0x05,
        InvalidPayloadSize <=> 0x06,
        InvalidPayload <=> 0x07,
    }

    pub(crate) const fn into_tag(self) -> u8 {
        self.into_u8() + 1
    }

    pub(crate) const fn try_from_tag(tag: u8) -> Option<Self> {
        if tag == 0 {
            return None;
        }

        Self::try_from_u8(tag - 1)
    }
}

/// # Response Flags
///
/// ## Binary Packet Layout
///
/// ```text
///  0 1 2 3 4 5 6 7 8 9 A B C D E F
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |          Unused           |E|S|
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Unused (14 bites)
/// * End Of Stream (1 bit)
/// * Stream (1 bit)
/// total 16 bits
/// ```
///
/// `End Of Stream` can only be set if `Stream` is set, `Stream` must be set for every streaming
/// item, if `End of Stream` is set, then `Status` must be `0x00` and the body must be empty.
///
/// `Unused` is reserved for future use.
///
/// `Stream` and `End Of Stream` are reserved for future use, but currently not implemented.
pub struct ResponseFlags([u8; 2]);

/// # Response Header
///
/// ## Binary Packet Layout
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |P|F. |S|Size (conditional) |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * ProtocolVersion (1 byte)
/// * Flags (2 bytes)
/// * Status (1 byte)
/// * Size (conditional) (10 bytes)
/// total 14 bytes
/// ```
///
/// `Size` is a variable integer, the maximum size of the packet is 14 bytes, the minimum size is
/// 4 bytes for an error, and 5 bytes for a success.
///
/// If `Status` is not `0x00` then `Size` is not present.
///
/// A `Status` value that is not `0x00` indicates an error, and the body is not present.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ResponseHeader {
    pub(crate) size: PayloadSize,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "tag", content = "payload")]
pub enum ResponsePayload {
    Success(#[serde(with = "serde_compat::bytes")] Bytes),
    Error(ResponseError),
}

impl<T> From<T> for ResponsePayload
where
    T: Into<Bytes>,
{
    fn from(value: T) -> Self {
        Self::Success(value.into())
    }
}

impl From<ResponseError> for ResponsePayload {
    fn from(value: ResponseError) -> Self {
        Self::Error(value)
    }
}

/// # Response
///
/// ## Binary Packet Layout
///
/// (The binary packet layout assumes worst case scenario for the header).
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |          Header           |               Body                |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Header (14 bytes)
/// * Body (18 bytes)
/// total 32 bytes
/// ```
///
/// ### Extensions
///
/// Another extension that is planned (through flags) is to allow for an alternative streaming
/// implementation, where the items of the response are streamed as they are produced, instead of
/// being buffered and sent all at once.
///
/// Flags for this are already reserved, but not implemented.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Response {
    pub(crate) header: ResponseHeader,
    pub(crate) body: ResponsePayload,
}

impl Response {
    pub fn new(body: impl Into<ResponsePayload>) -> Self {
        let payload = body.into();

        let size = match &payload {
            ResponsePayload::Success(bytes) => PayloadSize::len(bytes),
            ResponsePayload::Error(_) => PayloadSize::new(0),
        };

        Self {
            header: ResponseHeader { size },
            body: payload,
        }
    }

    #[must_use]
    pub fn error(error: ResponseError) -> Self {
        Self {
            header: ResponseHeader {
                size: PayloadSize::new(0),
            },
            body: error.into(),
        }
    }
}
