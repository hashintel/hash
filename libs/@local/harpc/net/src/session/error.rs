use core::error::{Error, Request};

use harpc_codec::error::ErrorCode;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("The session layer has encountered an error, the connection has been closed")]
pub struct SessionError;

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    derive_more::Display,
    serde::Serialize,
    serde::Deserialize,
)]
#[display(
    "transaction limit per connection has been reached, the transaction has been dropped. The \
     limit is {limit}"
)]
pub struct ConnectionTransactionLimitReachedError {
    pub limit: usize,
}

impl Error for ConnectionTransactionLimitReachedError {
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        request.provide_value(ErrorCode::CONNECTION_TRANSACTION_LIMIT_REACHED);
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    derive_more::Display,
    serde::Serialize,
    serde::Deserialize,
)]
#[display("transaction has been dropped, because it is unable to receive more request packets")]
pub struct TransactionLaggingError;

impl Error for TransactionLaggingError {
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        request.provide_value(ErrorCode::TRANSACTION_LAGGING);
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    derive_more::Display,
    serde::Serialize,
    serde::Deserialize,
)]
#[display(
    "transaction has been dropped, because the server is unable to process more transactions"
)]
pub struct InstanceTransactionLimitReachedError;

impl Error for InstanceTransactionLimitReachedError {
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        request.provide_value(ErrorCode::INSTANCE_TRANSACTION_LIMIT_REACHED);
    }
}

#[derive(
    Debug,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    derive_more::Display,
    serde::Serialize,
    serde::Deserialize,
)]
#[display("session has been closed")]
pub struct ConnectionClosedError;

impl Error for ConnectionClosedError {
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        request.provide_value(ErrorCode::CONNECTION_CLOSED);
    }
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    derive_more::Display,
    serde::Serialize,
    serde::Deserialize,
)]
#[display(
    "The connection is in the graceful shutdown state and no longer accepts any new transactions"
)]
pub struct ConnectionGracefulShutdownError;

impl Error for ConnectionGracefulShutdownError {
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        request.provide_value(ErrorCode::CONNECTION_SHUTDOWN);
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
