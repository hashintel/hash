/// # Version
///
/// ## Binary Packet Layout
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |T|F. |P|
/// +-+-+-+-+
///
/// * TransportVersion (1 byte)
/// * Flags (2 bytes)
/// * ProtocolVersion (1 byte)
/// total 4 bytes
/// ```
///
/// `Flags` is specified in the [`RequestHeader`], [`TransportVersion`] and [`ProtocolVersion`] are
/// fixed size integers. This allows for 256 different transport versions, and 256 different
/// protocol versions.
///
/// [`RequestHeader`]: crate::harpc::transport::message::request::RequestHeader
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct Version {
    pub(crate) transport: TransportVersion,
    pub(crate) protocol: ProtocolVersion,
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct TransportVersion(u8);

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct ProtocolVersion(u8);
