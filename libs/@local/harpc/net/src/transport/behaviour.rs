use libp2p::{Swarm, identify, ping, swarm::NetworkBehaviour};
use libp2p_stream as stream;

// in a separate file because `NetworkBehaviour` macro expects that `error-stack::Result` isn't
// imported.
#[derive(NetworkBehaviour)]
pub(crate) struct TransportBehaviour {
    pub stream: stream::Behaviour,
    pub identify: identify::Behaviour,
    pub ping: ping::Behaviour,
}

pub(crate) type TransportSwarm = Swarm<TransportBehaviour>;
