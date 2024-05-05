use bytes::Bytes;
use harpc_wire_protocol::response::kind::ErrorCode;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("session layer")]
pub(crate) struct SessionError;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TransactionError {
    pub code: ErrorCode,
    pub bytes: Bytes,
}
