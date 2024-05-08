use error_stack::{Result, ResultExt};
use libp2p::{core::transport::ListenerId, metrics, Multiaddr, PeerId};
use libp2p_stream::Control;
use tokio::sync::{mpsc, oneshot};

use super::{error::TransportError, task::Command};

const IPC_BUFFER_SIZE: usize = 16;

#[derive(Debug, Clone)]
pub(crate) struct TransportLayerIpc {
    tx: mpsc::Sender<Command>,
}

impl TransportLayerIpc {
    pub(super) fn new() -> (Self, mpsc::Receiver<Command>) {
        let (tx, rx) = mpsc::channel(IPC_BUFFER_SIZE);

        (Self { tx }, rx)
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

    pub(super) async fn metrics(&self) -> Result<metrics::Metrics, TransportError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send(Command::Metrics { tx })
            .await
            .change_context(TransportError)?;

        rx.await.change_context(TransportError)
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
}
