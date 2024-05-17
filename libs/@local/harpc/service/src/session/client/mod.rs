mod config;
mod connection;
mod transaction;

use error_stack::{Result, ResultExt};
use libp2p::Multiaddr;
use tokio_util::sync::CancellationToken;

use self::{config::SessionConfig, connection::Connection};
use super::error::SessionError;
use crate::transport::TransportLayer;

pub struct SessionLayer {
    config: SessionConfig,

    cancel: CancellationToken,

    transport: TransportLayer,
}

impl SessionLayer {
    #[must_use]
    pub fn new(config: SessionConfig, transport: TransportLayer) -> Self {
        Self {
            config,
            cancel: transport.cancellation_token(),
            transport,
        }
    }

    /// Dial a peer.
    ///
    /// # Errors
    ///
    /// Returns an error if the dial fails.
    pub async fn dial(&self, address: Multiaddr) -> Result<Connection, SessionError> {
        let peer = self
            .transport
            .lookup_peer(address)
            .await
            .change_context(SessionError)?;

        let cancel = self.cancel.child_token();

        let connection = self
            .transport
            .dial(peer)
            .await
            .change_context(SessionError)?;

        Ok(Connection::spawn(
            self.config,
            connection,
            self.transport.tasks(),
            cancel,
        ))
    }
}
