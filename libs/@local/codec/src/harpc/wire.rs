use core::marker::PhantomData;
use std::io;

use error_stack::{Report, ResultExt as _};
use harpc_wire_protocol::{
    codec::{Buffer, Decode, Encode},
    request::Request,
    response::Response,
};
use tokio_util::{
    bytes::BytesMut,
    codec::{Decoder, Encoder},
};

/// Codec for encoding and decoding HaRPC (HASH RPC) wire protocol messages.
///
/// This codec implements the Tokio `Encoder` and `Decoder` traits to handle the
/// serialization and deserialization of HaRPC protocol messages. It's designed
/// to be used with Tokio's framed communication.
///
/// The HaRPC protocol uses a fixed-size header (32 bytes) followed by a variable-length
/// payload. The header contains the message length in bytes 30-31 (big-endian encoded).
///
/// # Type Parameters
///
/// * `T` - The type of message to encode/decode, generally a `Request` or `Response`
///
/// # Examples
///
/// ```
/// use hash_codec::harpc::wire::{RequestCodec, ResponseCodec};
/// use tokio_util::codec::{Decoder, Encoder};
///
/// // Create codecs for requests and responses
/// let request_codec = RequestCodec::new();
/// let response_codec = ResponseCodec::new();
/// ```
#[derive(Debug)]
pub struct ProtocolCodec<T>(
    // We use PhantomData with fn() -> *const T to ensure proper variance for the type parameter
    // without assuming ownership or other constraints on T
    PhantomData<fn() -> *const T>,
);

impl<T> ProtocolCodec<T> {
    /// Creates a new protocol codec for encoding and decoding HaRPC messages.
    #[must_use]
    pub const fn new() -> Self {
        Self(PhantomData)
    }
}

impl<T> Encoder<T> for ProtocolCodec<T>
where
    T: Encode,
{
    // we need to use io::Error here, because `Encoder` requires `From<io::Error> for Error`
    type Error = Report<io::Error>;

    /// Encodes a protocol message into the destination buffer.
    ///
    /// # Errors
    ///
    /// Returns an error if the encoding operation fails.
    fn encode(&mut self, item: T, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let mut buffer = Buffer::new(dst);

        item.encode(&mut buffer)
            .change_context(io::Error::from(io::ErrorKind::InvalidData))
    }
}

impl<T> Decoder for ProtocolCodec<T>
where
    T: Decode<Context = ()>,
{
    type Error = Report<io::Error>;
    type Item = T;

    /// Attempts to decode a HaRPC protocol message from the source buffer.
    ///
    /// The HaRPC protocol uses a 32-byte header with the message length encoded
    /// in big-endian format at bytes 30-31. This method checks if a complete
    /// message is available in the buffer before decoding.
    ///
    /// # Returns
    ///
    /// - `Ok(Some(item))` if a complete message was successfully decoded
    /// - `Ok(None)` if more data is needed to complete a message
    /// - `Err(error)` if decoding failed
    #[expect(clippy::missing_asserts_for_indexing, reason = "false positive")]
    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        if src.len() < 32 {
            // Not enough data to decode a request
            return Ok(None);
        }

        // The length marker is always at bytes 30 and 31
        let length = u16::from_be_bytes([src[30], src[31]]) as usize;
        let packet_length = length + 32;

        if src.len() < packet_length {
            // Reserve space for the rest of the packet
            // Not necessarily needed, but good idea performance-wise
            src.reserve(packet_length - src.len());

            // Not enough data to decode a request
            return Ok(None);
        }

        // split of the packet into a separate buffer
        let mut bytes = src.split_to(packet_length);
        let mut buffer = Buffer::new(&mut bytes);

        T::decode(&mut buffer, ())
            .change_context(io::Error::from(io::ErrorKind::InvalidData))
            .map(Some)
    }
}

impl<T> Default for ProtocolCodec<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// Type alias for a codec that encodes and decodes HaRPC protocol request messages.
pub type RequestCodec = ProtocolCodec<Request>;

/// Type alias for a codec that encodes and decodes HaRPC protocol response messages.
pub type ResponseCodec = ProtocolCodec<Response>;

#[cfg(test)]
mod tests {
    use harpc_types::response_kind::ResponseKind;
    use harpc_wire_protocol::{
        payload::Payload,
        protocol::{Protocol, ProtocolVersion},
        request::{
            Request,
            begin::RequestBegin,
            body::RequestBody,
            flags::{RequestFlag, RequestFlags},
            header::RequestHeader,
            id::{RequestId, RequestIdProducer},
        },
        response::{
            Response,
            begin::ResponseBegin,
            body::ResponseBody,
            flags::{ResponseFlag, ResponseFlags},
            header::ResponseHeader,
        },
    };
    use tokio_util::bytes::BytesMut;

    use super::*;

    fn get_request_id() -> RequestId {
        RequestIdProducer::new().produce()
    }

    fn create_test_request() -> Request {
        Request {
            header: RequestHeader {
                protocol: Protocol {
                    version: ProtocolVersion::V1,
                },
                request_id: get_request_id(),
                flags: RequestFlags::from(RequestFlag::BeginOfRequest),
            },
            body: RequestBody::Begin(RequestBegin {
                subsystem: harpc_types::subsystem::SubsystemDescriptor {
                    id: harpc_types::subsystem::SubsystemId::new(0x01_02),
                    version: harpc_types::version::Version { major: 1, minor: 0 },
                },
                procedure: harpc_types::procedure::ProcedureDescriptor {
                    id: harpc_types::procedure::ProcedureId::new(0x03_04),
                },
                payload: Payload::from_static(&[1, 2, 3, 4]),
            }),
        }
    }

    fn create_test_response() -> Response {
        Response {
            header: ResponseHeader {
                protocol: Protocol {
                    version: ProtocolVersion::V1,
                },
                request_id: get_request_id(),
                flags: ResponseFlags::from(ResponseFlag::BeginOfResponse),
            },
            body: ResponseBody::Begin(ResponseBegin {
                kind: ResponseKind::Ok,
                payload: Payload::from_static(&[5, 6, 7, 8]),
            }),
        }
    }

    #[test]
    fn encode_decode_request() {
        // Setup
        let mut codec = RequestCodec::new();
        let mut buffer = BytesMut::new();

        // Create a request with known data
        let request = create_test_request();

        // Encode the request
        codec
            .encode(request.clone(), &mut buffer)
            .expect("Failed to encode request");

        // Verify buffer has enough data (at least the header)
        assert!(
            buffer.len() >= 32,
            "Buffer should contain at least the header"
        );

        // Decode the request
        let decoded = codec
            .decode(&mut buffer)
            .expect("Failed to decode")
            .expect("No request decoded");

        // Verify decoded request matches original
        assert_eq!(request.header.request_id, decoded.header.request_id);

        if let RequestBody::Begin(begin) = &request.body {
            if let RequestBody::Begin(decoded_begin) = &decoded.body {
                assert_eq!(begin.subsystem.id, decoded_begin.subsystem.id);
                assert_eq!(begin.procedure.id, decoded_begin.procedure.id);
                assert_eq!(begin.payload, decoded_begin.payload);
            } else {
                panic!("Decoded request body should be Begin");
            }
        } else {
            panic!("Request body should be Begin");
        }

        // Buffer should be empty after decoding
        assert_eq!(buffer.len(), 0, "Buffer should be empty after decoding");
    }

    #[test]
    fn encode_decode_response() {
        // Setup
        let mut codec = ResponseCodec::new();
        let mut buffer = BytesMut::new();

        // Create a response with known data
        let response = create_test_response();

        // Encode the response
        codec
            .encode(response.clone(), &mut buffer)
            .expect("Failed to encode response");

        // Verify buffer has enough data (at least the header)
        assert!(
            buffer.len() >= 32,
            "Buffer should contain at least the header"
        );

        // Decode the response
        let decoded = codec
            .decode(&mut buffer)
            .expect("Failed to decode")
            .expect("No response decoded");

        // Verify decoded response matches original
        assert_eq!(response.header.request_id, decoded.header.request_id);

        if let ResponseBody::Begin(begin) = &response.body {
            if let ResponseBody::Begin(decoded_begin) = &decoded.body {
                assert_eq!(begin.kind, decoded_begin.kind);
                assert_eq!(begin.payload, decoded_begin.payload);
            } else {
                panic!("Decoded response body should be Begin");
            }
        } else {
            panic!("Response body should be Begin");
        }

        // Buffer should be empty after decoding
        assert_eq!(buffer.len(), 0, "Buffer should be empty after decoding");
    }

    #[test]
    fn partial_decode() {
        // Setup
        let mut codec = RequestCodec::new();
        let mut buffer = BytesMut::new();

        // Create a request with known data
        let request = create_test_request();

        // Encode the request
        codec
            .encode(request, &mut buffer)
            .expect("Failed to encode request");

        // Save the full buffer
        let full_buffer = buffer.clone();

        // Create a partial buffer with only 20 bytes (less than header)
        let mut partial_buffer = BytesMut::from(&full_buffer[..20]);

        // Try to decode from partial buffer (should return None)
        let result = codec
            .decode(&mut partial_buffer)
            .expect("Failed to handle partial decode");

        assert!(
            result.is_none(),
            "Partial decode should return None when buffer has less than header size"
        );

        // Create a partial buffer with header but incomplete payload
        let header_size = 32;
        let mut header_only_buffer = BytesMut::from(&full_buffer[..=header_size]);

        // Try to decode from header-only buffer (should return None)
        let result = codec
            .decode(&mut header_only_buffer)
            .expect("Failed to handle header-only decode");

        assert!(
            result.is_none(),
            "Partial decode should return None when buffer has incomplete payload"
        );
    }
}
