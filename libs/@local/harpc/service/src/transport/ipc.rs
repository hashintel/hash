use error_stack::{Result, ResultExt};
use libp2p::{core::transport::ListenerId, Multiaddr, PeerId};
use libp2p_stream::Control;
use tokio::sync::{mpsc, oneshot};

use super::{error::TransportError, task::Command};

#[derive(Debug, Clone)]
pub struct TransportLayerIpc {
    tx: mpsc::Sender<Command>,
}

impl TransportLayerIpc {
    pub(super) const fn new(tx: mpsc::Sender<Command>) -> Self {
        Self { tx }
    }

    pub(super) async fn control(&self) -> Result<Control, TransportError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Command::IssueControl { tx })
            .await
            .change_context(TransportError)?;

        rx.await.change_context(TransportError)
    }

    pub(super) async fn lookup_peer(&self, address: Multiaddr) -> Result<PeerId, TransportError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Command::LookupPeer { address, tx })
            .await
            .change_context(TransportError)?;

        rx.await
            .change_context(TransportError)?
            .change_context(TransportError)
    }

    pub(super) async fn listen_on(&self, address: Multiaddr) -> Result<ListenerId, TransportError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Command::ListenOn { address, tx })
            .await
            .change_context(TransportError)?;

        rx.await
            .change_context(TransportError)?
            .change_context(TransportError)
    }

    /// Return the currently listening addresses.
    ///
    /// This returns the addresses that the transport layer is currently listening on.
    ///
    /// # Errors
    ///
    /// If the transport layer has been shut down, this will return an error.
    pub async fn external_addresses(&self) -> Result<Vec<Multiaddr>, TransportError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Command::ExternalAddresses { tx })
            .await
            .change_context(TransportError)?;

        rx.await.change_context(TransportError)
    }
}
