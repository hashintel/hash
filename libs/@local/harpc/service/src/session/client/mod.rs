mod connection;
mod transaction;

use error_stack::{Result, ResultExt};
use libp2p::Multiaddr;
use tokio_util::sync::CancellationToken;

use self::connection::Connection;
use super::error::SessionError;
use crate::transport::{connection::OutgoingConnection, TransportLayer};

pub struct SessionLayer {
    transport: TransportLayer,

    cancel: CancellationToken,
}

impl SessionLayer {
    #[must_use]
    pub const fn new(transport: TransportLayer, cancel: CancellationToken) -> Self {
        Self { transport, cancel }
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

        let OutgoingConnection { sink, stream, .. } = self
            .transport
            .dial(peer)
            .await
            .change_context(SessionError)?;

        Ok(Connection::start(sink, stream, self.cancel.child_token()))
    }
}
