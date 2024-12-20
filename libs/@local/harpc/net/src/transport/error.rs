use core::fmt::Debug;

use libp2p::PeerId;

use super::PROTOCOL_NAME;

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
