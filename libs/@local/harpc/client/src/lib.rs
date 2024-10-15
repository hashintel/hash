#![feature(never_type, impl_trait_in_assoc_type)]

extern crate alloc;

pub mod connection;

use alloc::sync::Arc;

use error_stack::{Report, ResultExt};
use harpc_net::{
    session::client::{SessionConfig, SessionLayer},
    transport::{TransportConfig, TransportLayer},
};
use multiaddr::Multiaddr;
use tokio_util::sync::{CancellationToken, DropGuard};

use self::connection::Connection;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub struct ClientConfig {
    pub transport: TransportConfig,
    pub session: SessionConfig,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ClientError {
    #[error("unable to connect to server")]
    Connect,
    #[error("unable to start the transport layer")]
    StartTransportLayer,
}

/// A guard that ensures the transport layer is dropped when all remaining clients and connections
/// are dropped.
///
/// We cannot drop whenever the last client is dropped because there may still be multiple
/// connections that are still active.
#[derive(Debug, Clone)]
pub(crate) struct TransportLayerGuard(Arc<DropGuard>);

#[derive(Debug, Clone)]
pub struct Client {
    session: Arc<SessionLayer>,

    guard: TransportLayerGuard,
}

impl Client {
    pub async fn new(config: ClientConfig) -> Result<Self, Report<ClientError>> {
        let token = CancellationToken::new();

        let transport = TransportLayer::start(config.transport, (), token.clone())
            .change_context(ClientError::StartTransportLayer)?;

        let session = SessionLayer::new(config.session, transport);

        let guard = Arc::new(token.drop_guard());

        Ok(Self {
            session: Arc::new(session),
            guard: TransportLayerGuard(guard),
        })
    }

    /// Connects to a target address.
    ///
    /// # Errors
    ///
    /// Returns a `ClientError::Connect` if unable to establish a connection to the server.
    pub async fn connect(&self, target: Multiaddr) -> Result<Connection, Report<ClientError>> {
        let connection = self
            .session
            .dial(target)
            .await
            .change_context(ClientError::Connect)?;

        Ok(Connection::new(connection, self.guard.clone()))
    }
}
