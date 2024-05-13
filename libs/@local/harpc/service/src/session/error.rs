use bytes::Bytes;
use harpc_wire_protocol::response::kind::ErrorCode;

use crate::codec::PlainError;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("session layer")]
pub struct SessionError;

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
pub struct ConnectionTransactionLimitReachedError {
    pub limit: usize,
}

impl PlainError for ConnectionTransactionLimitReachedError {
    fn code(&self) -> ErrorCode {
        ErrorCode::CONNECTION_TRANSACTION_LIMIT_REACHED
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("transaction has been dropped, because it is unable to receive more request packets")]
pub struct TransactionLaggingError;

impl PlainError for TransactionLaggingError {
    fn code(&self) -> ErrorCode {
        ErrorCode::TRANSACTION_LAGGING
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("transaction has been dropped, because the server is unable to process more transactions")]
pub struct InstanceTransactionLimitReachedError;

impl PlainError for InstanceTransactionLimitReachedError {
    fn code(&self) -> ErrorCode {
        ErrorCode::INSTANCE_TRANSACTION_LIMIT_REACHED
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("session has been clossed")]
pub struct ConnectionClosedError;

impl PlainError for ConnectionClosedError {
    fn code(&self) -> ErrorCode {
        ErrorCode::CONNECTION_CLOSED
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error(
    "The connection is in the graceful shutdown state and no longer accepts any new transactions"
)]
pub struct ConnectionShutdownError;

impl PlainError for ConnectionShutdownError {
    fn code(&self) -> ErrorCode {
        ErrorCode::CONNECTION_SHUTDOWN
    }
}
