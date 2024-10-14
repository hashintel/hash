#![feature(never_type, impl_trait_in_assoc_type)]

extern crate alloc;

pub mod connection;
pub mod endpoint;

use alloc::sync::Arc;

use error_stack::{Report, ResultExt};
use harpc_net::session::client::SessionLayer;
use multiaddr::Multiaddr;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ClientError {
    #[error("unable to dial target")]
    Dial,
}

#[derive(Debug, Clone)]
pub struct Client(Arc<SessionLayer>);

impl Client {
    pub(crate) async fn connect(
        &self,
        target: Multiaddr,
    ) -> Result<harpc_net::session::client::Connection, Report<ClientError>> {
        self.0.dial(target).await.change_context(ClientError::Dial)
    }

    #[must_use]
    pub fn endpoint(&self, target: Multiaddr) -> endpoint::Endpoint {
        endpoint::Endpoint::new(self.clone(), target)
    }
}
