use core::fmt::{self, Debug, Display, Formatter};

use libp2p::PeerId;
use libp2p_stream as stream;

use super::PROTOCOL_NAME;

/// Errors while opening a new stream.
pub struct OpenStreamError(stream::OpenStreamError);

impl Debug for OpenStreamError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.0, f)
    }
}

impl Display for OpenStreamError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, f)
    }
}

impl core::error::Error for OpenStreamError {}

impl From<stream::OpenStreamError> for OpenStreamError {
    fn from(err: stream::OpenStreamError) -> Self {
        Self(err)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum IpcError {
    #[error("Transport task has been shutdown and the IPC message could not be delivered")]
    NotDelivered,
    #[error("Transport task has dropped the IPC channel and no response was received")]
    NoResponse,
    #[error("Underlying swarm has returned an error")]
    Swarm,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum TransportError {
    #[error("Unable to send IPC message")]
    Ipc,
    #[error("The swarm is already actively listening for `{}`", PROTOCOL_NAME)]
    AlreadyListening,
    #[error("Unable to open a new stream to the peer `{peer_id}`")]
    OpenStream { peer_id: PeerId },
    #[error("Unable to initialize underlying transport layer of swarm")]
    SetupSwarmTransport,
}
