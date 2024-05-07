mod connection;
mod transaction;
mod writer;

use error_stack::{Result, ResultExt};
use libp2p::PeerId;
use tokio_util::sync::CancellationToken;

use self::connection::Connection;
use super::error::SessionError;
use crate::transport::TransportLayer;

pub struct SessionLayer {
    transport: TransportLayer,

    cancel: CancellationToken,
}

impl SessionLayer {
    #[must_use]
    pub const fn new(transport: TransportLayer, cancel: CancellationToken) -> Self {
        Self { transport, cancel }
    }

    pub async fn dial(&self, peer: PeerId) -> Result<Connection, SessionError> {
        let (sink, stream) = self
            .transport
            .dial(peer)
            .await
            .change_context(SessionError)?;

        Ok(Connection::start(sink, stream, self.cancel.child_token()))
    }
}
