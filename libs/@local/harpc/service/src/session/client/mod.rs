mod connection;
mod transaction;

use error_stack::{Result, ResultExt};
use libp2p::PeerId;

use self::connection::Connection;
use super::error::SessionError;
use crate::transport::TransportLayer;

pub struct SessionLayer {
    transport: TransportLayer,
}

impl SessionLayer {
    pub(crate) async fn dial(&self, peer: PeerId) -> Result<Connection, SessionError> {
        let (sink, stream) = self
            .transport
            .dial(peer)
            .await
            .change_context(SessionError)?;

        Ok(Connection::new(sink, stream))
    }
}
