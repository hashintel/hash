//! # Request
//!
//! A harpc Request can be one of the following types:
//! * Service Request, which is used to invoke a specific service request
//!
//! Each Request starts with a preflight request, which is used to:
//! * Check if the server is alive & ready to accept requests
//! * Indicate the type of request to be performed and additional metadata needed for it.
//!
//! (Service Response always has as first the service version that actually exists)
//!
//! A service request can chain multiple service requests,
//! where the end of a service request is to be indicated by a: `endOfRequest` flag.
//! Each service request has a unique `requestId` which is used to track the request.
//!
//! The server will start immediately processing the request and will return a response,
//! even if another service request is being made.
//!
//! A single packet can never exceed 64KiB in size.
//!
//! TODO: session authentication must happen with a special `RequestId` (0x00) and must be done
//! _before_ any other request.
//! Responses are identified by the `RequestId` allowing for multiple requests to be made at the
//! same time.
//! PreflightResponse returns if user has been already authorized, or not.

use bytes::Bytes;

use crate::{
    authorization::UserId,
    version::{ProtocolVersion, ServiceVersion},
};

const MAX_PACKET_SIZE: usize = 64 * 1024;

pub struct RequestSize(pub u16);

pub struct RequestId(pub u32);

pub struct ServiceId(pub u16);

pub struct ProcedureId(pub u16);

// First bit: EndOfRequest, rest is the index
pub struct InvokeIndex(pub u16);

pub struct RequestHeader {
    version: ProtocolVersion,
    id: RequestId,
}

pub enum RequestPacket {
    Preflight(Preflight),
    Authorize(Authorize),
    Invoke(Invoke),
}

pub struct Request {
    header: RequestHeader,
    packet: RequestPacket,
}

// Has an immediate response: Exists/DoesNotExist
pub struct Preflight {
    service: ServiceId,
    version: ServiceVersion,
    procedure: ProcedureId,
}

// Has an immediate response: Authorized/Unauthorized
pub struct Authorize {
    // if set to true, this will persist through the entire session
    // not only the request
    sticky: bool,
    user: UserId,
}

pub struct Invoke {
    index: u16,

    payload: Bytes,
}
