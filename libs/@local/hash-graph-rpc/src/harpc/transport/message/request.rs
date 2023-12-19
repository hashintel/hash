use bytes::Bytes;

use super::serde_compat;
use crate::harpc::{
    procedure::ProcedureId,
    service::ServiceId,
    transport::message::{actor::ActorId, size::PayloadSize, version::Version},
};

/// # Request Flags
///
/// ## Binary Packet Layout
///
/// ```text
///  0 1 2 3 4 5 6 7 8 9 A B C D E F
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |            Unused             |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Unused (16 bits)
/// total 16 bits
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct RequestFlags([u8; 2]);

impl RequestFlags {
    pub(crate) fn new() -> Self {
        Self([0x00; 2])
    }
}

/// # Request Header
///
/// ## Binary Packet Layout
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |T|F. |P|     ServiceId     |    ProcedureId    |    ActorId    |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |               |       Size        |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * TransportVersion (1 byte)
/// * Flags (2 bytes)
/// * ProtocolVersion (1 byte)
/// * ServiceId (10 bytes)
/// * ProcedureId (10 bytes)
/// * ActorId (16 bytes)
/// * Size (10 bytes)
/// total 50 bytes
/// ```
///
/// [`ServiceId`], [`ProcedureId`], [`Size`] utilize variable integer encoding, the
/// maximum size of the packet is 50 bytes, the minimum size is 23 bytes.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct RequestHeader {
    pub(crate) flags: RequestFlags,
    pub(crate) version: Version,
    pub(crate) service: ServiceId,
    pub(crate) procedure: ProcedureId,
    pub(crate) actor: ActorId,
    pub(crate) size: PayloadSize,
}

/// # Request
///
/// ## Binary Packet Layout
///
/// (The binary packet layout assumes worst case scenario for the header).
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                            Header                             |
/// +                                   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                                   |                           |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+                           +
/// |                             Body                              |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Header (50 bytes)
/// * Body (46 bytes)
/// total 96 bytes
/// ```
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Request {
    pub(crate) header: RequestHeader,
    #[serde(with = "serde_compat::bytes")]
    pub(crate) body: Bytes,
}
