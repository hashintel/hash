use error_stack::{Result, ResultExt};
use libp2p::{Multiaddr, PeerId};
use libp2p_stream::Control;
use tokio::sync::{mpsc, oneshot};

use super::{error::IpcError, task::Command};

#[derive(Debug, Clone)]
pub struct TransportLayerIpc {
    tx: mpsc::Sender<Command>,
}

impl TransportLayerIpc {
    pub(super) const fn new(tx: mpsc::Sender<Command>) -> Self {
        Self { tx }
    }

    pub(super) async fn control(&self) -> Result<Control, IpcError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Command::IssueControl { tx })
            .await
            .change_context(IpcError::NotDelivered)?;

        rx.await.change_context(IpcError::NoResponse)
    }

    pub(super) async fn lookup_peer(&self, address: Multiaddr) -> Result<PeerId, IpcError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Command::LookupPeer { address, tx })
            .await
            .change_context(IpcError::NotDelivered)?;

        rx.await
            .change_context(IpcError::NoResponse)?
            .change_context(IpcError::Swarm)
    }

    pub(super) async fn listen_on(&self, address: Multiaddr) -> Result<Multiaddr, IpcError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Command::ListenOn { address, tx })
            .await
            .change_context(IpcError::NotDelivered)?;

        rx.await
            .change_context(IpcError::NoResponse)?
            .change_context(IpcError::Swarm)
    }

    /// Return the currently listening addresses.
    ///
    /// This returns the addresses that the transport layer is currently listening on.
    ///
    /// # Errors
    ///
    /// If the transport layer has been shut down, this will return an error.
    pub async fn external_addresses(&self) -> Result<Vec<Multiaddr>, IpcError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Command::ExternalAddresses { tx })
            .await
            .change_context(IpcError::NotDelivered)?;

        rx.await.change_context(IpcError::NoResponse)
    }
}
