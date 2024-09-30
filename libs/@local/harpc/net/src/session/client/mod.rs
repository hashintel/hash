mod config;
mod connection;
mod transaction;

use error_stack::{Result, ResultExt};
use libp2p::Multiaddr;
use tokio_util::sync::CancellationToken;

use self::connection::ConnectionParts;
pub use self::{
    config::SessionConfig,
    connection::{Connection, ResponseStream},
    transaction::stream::{ErrorStream, TransactionStream, ValueStream},
};
use super::error::SessionError;
use crate::transport::{TransportLayer, connection::OutgoingConnection};

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

    #[must_use]
    pub const fn transport(&self) -> &TransportLayer {
        &self.transport
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

        let OutgoingConnection { sink, stream, .. } = self
            .transport
            .dial(peer)
            .await
            .change_context(SessionError)?;

        Ok(Connection::spawn(
            ConnectionParts {
                config: self.config,
                tasks: self.transport.tasks(),
                cancel,
            },
            sink,
            stream,
        ))
    }
}
