use bytes::Bytes;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ResponseHeader {
    pub(crate) size: PayloadSize,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Error {
    DeadlineExceeded,
    ConnectionClosed,
    UnknownService,
    UnknownProcedure,
    InvalidPayloadSize,
    InvalidPayload,
}

impl Error {
    primitive_enum! {
        DeadlineExceeded <=> 0x00,
        ConnectionClosed <=> 0x01,
        UnknownService <=> 0x02,
        UnknownProcedure <=> 0x03,
        InvalidPayloadSize <=> 0x04,
        InvalidPayload <=> 0x05
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

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "tag", content = "payload")]
pub enum ResponsePayload {
    Success(#[serde(with = "serde_compat::bytes")] Bytes),
    Error(Error),
}

impl<T> From<T> for ResponsePayload
where
    T: Into<Bytes>,
{
    fn from(value: T) -> Self {
        Self::Success(value.into())
    }
}

impl From<Error> for ResponsePayload {
    fn from(value: Error) -> Self {
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
/// |       Header        |                  Body                   |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Header (11 bytes)
/// * Body (21 bytes)
/// total 32 bytes
/// ```
///
/// The length of the packet is encoded in the header as the last field.
///
/// ### Header
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |S|       Size        |
/// +-+-+-+-+-+-+-+-+-+-+-+
///
/// * Status (1 byte)
/// * Size (10 bytes)
/// total 11 bytes
/// ```
///
/// If the status is `0x00` then the response is [`ResponsePayload::Success`], otherwise the status
/// is [`Error`], **and no length or body are present**.
///
/// `Length` utilizes variable integer encoding, with a maximum size of 10 bytes.
///
/// The minimum size of the header on errorneous response is 1 byte, and on successful response is 2
/// bytes.
///
/// ### Extensions
///
/// In the future to support more features, the header may be extended with additional fields.
///
/// These include:
/// * `Version`
/// * `Flags`
///
/// Another extension that is planned (through flags) is to allow for an alternative streaming
/// implementation, where the items of the response are streamed as they are produced, instead of
/// being buffered and sent all at once.
///
/// The header of a streaming response would include the current item index as well as a size hint,
/// if an item (that is successful) has a payload length of 0x00 it indicates the end of the stream.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Response {
    header: ResponseHeader,
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
    pub fn error(error: Error) -> Self {
        Self {
            header: ResponseHeader {
                size: PayloadSize::new(0),
            },
            body: error.into(),
        }
    }
}
