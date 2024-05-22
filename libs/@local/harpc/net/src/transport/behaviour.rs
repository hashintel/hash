use libp2p::{identify, ping, swarm::NetworkBehaviour, Swarm};
use libp2p_stream as stream;

// in a separate file because `NetworkBehaviour` macro expects that `error-stack::Result` isn't
// imported.
#[derive(NetworkBehaviour)]
pub(crate) struct TransportBehaviour {
    pub(crate) stream: stream::Behaviour,
    pub(crate) identify: identify::Behaviour,
    pub(crate) ping: ping::Behaviour,
}

pub(crate) type TransportSwarm = Swarm<TransportBehaviour>;
