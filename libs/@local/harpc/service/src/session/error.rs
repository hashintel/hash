use bytes::Bytes;
use harpc_wire_protocol::response::kind::ErrorCode;

use crate::codec::ErrorExt;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("session layer")]
pub(crate) struct SessionError;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TransactionError {
    pub code: ErrorCode,
    pub bytes: Bytes,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error(
    "transaction limit per connection has been reached, the transaction has been dropped. The \
     limit is {limit}"
)]
pub struct TransactionLimitReachedError {
    pub limit: usize,
}

impl ErrorExt for TransactionLimitReachedError {
    fn code(&self) -> ErrorCode {
        ErrorCode::TRANSACTION_LIMIT_REACHED
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("shutdown task")]
pub(crate) struct ShutdownTask;
