use bytes::Bytes;

use crate::harpc::{
    procedure::ProcedureId,
    service::ServiceId,
    transport::message::{actor::ActorId, size::PayloadSize},
};

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct RequestHeader {
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
/// +                           +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                           |                                   |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+                                   +
/// |                             Body                              |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Header (46 bytes)
/// * Body (50 bytes)
/// total 96 bytes
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
/// |     ServiceID     |    ProcedureID    |        ActorID        |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |       |       Size        |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * ServiceID (10 bytes)
/// * ProcedureID (10 bytes)
/// * ActorID (16 bytes)
/// * Size (10 bytes)
/// total 46 bytes
/// ```
///
/// `ServiceID`, `ProcedureID`, `Size` utilize variable integer encoding, with a maximum size of 10
/// bytes.
/// The minimum header size is 19 bytes.
///
/// ### Extensions
///
/// In the future to support more features, the header may be extended with additional fields.
/// Planned are:
/// * `Version (Transport)`
/// * `Version (Protocol)`
/// * `Flags`
// (TODO: already add them)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Request {
    pub(crate) header: RequestHeader,
    #[serde(with = "serde_compat::bytes")]
    pub(crate) body: Bytes,
}
