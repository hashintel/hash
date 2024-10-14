#![feature(never_type, impl_trait_in_assoc_type)]

extern crate alloc;

pub mod connection;

use alloc::sync::Arc;

use error_stack::{Report, ResultExt};
use harpc_net::session::client::SessionLayer;
use multiaddr::Multiaddr;

use self::connection::Connection;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ClientError {
    #[error("unable to connect to server")]
    Connect,
}

#[derive(Debug, Clone)]
pub struct Client(Arc<SessionLayer>);

impl Client {
    /// Connects to a target address.
    ///
    /// # Errors
    ///
    /// Returns a `ClientError::Connect` if unable to establish a connection to the server.
    pub async fn connect(&self, target: Multiaddr) -> Result<Connection, Report<ClientError>> {
        self.0
            .dial(target)
            .await
            .map(Connection::new)
            .change_context(ClientError::Connect)
    }
}
