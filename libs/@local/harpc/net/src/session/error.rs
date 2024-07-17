use bytes::Bytes;
use harpc_wire_protocol::response::kind::ErrorCode;

use crate::codec::WireError;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("The session layer has encountered an error, the connection has been closed")]
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

impl WireError for ConnectionTransactionLimitReachedError {
    fn code(&self) -> ErrorCode {
        ErrorCode::CONNECTION_TRANSACTION_LIMIT_REACHED
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("transaction has been dropped, because it is unable to receive more request packets")]
pub struct TransactionLaggingError;

impl WireError for TransactionLaggingError {
    fn code(&self) -> ErrorCode {
        ErrorCode::TRANSACTION_LAGGING
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("transaction has been dropped, because the server is unable to process more transactions")]
pub struct InstanceTransactionLimitReachedError;

impl WireError for InstanceTransactionLimitReachedError {
    fn code(&self) -> ErrorCode {
        ErrorCode::INSTANCE_TRANSACTION_LIMIT_REACHED
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("session has been clossed")]
pub struct ConnectionClosedError;

impl WireError for ConnectionClosedError {
    fn code(&self) -> ErrorCode {
        ErrorCode::CONNECTION_CLOSED
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error(
    "The connection is in the graceful shutdown state and no longer accepts any new transactions"
)]
pub struct ConnectionGracefulShutdownError;

impl WireError for ConnectionGracefulShutdownError {
    fn code(&self) -> ErrorCode {
        ErrorCode::CONNECTION_SHUTDOWN
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error(
    "the underlying read and/or write connection to the server has been closed (read: {read}, \
     write: {write})"
)]
pub struct ConnectionPartiallyClosedError {
    pub read: bool,
    pub write: bool,
}
