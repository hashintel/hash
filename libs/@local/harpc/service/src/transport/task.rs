use std::{
    collections::{hash_map::Entry, HashMap},
    io,
};

use error_stack::{Result, ResultExt};
use futures::prelude::stream::StreamExt;
use libp2p::{
    core::{transport::ListenerId, upgrade},
    identify, metrics, noise, ping,
    swarm::{dial_opts::DialOpts, ConnectionId, DialError, SwarmEvent},
    yamux, Multiaddr, PeerId, SwarmBuilder,
};
use libp2p_stream as stream;
use stream::Control;
use tokio::{
    select,
    sync::{mpsc, oneshot},
};
use tokio_util::sync::CancellationToken;

use super::{
    behaviour::{TransportBehaviour, TransportBehaviourEvent, TransportSwarm},
    error::TransportError,
    ipc::TransportLayerIpc,
    Transport, PROTOCOL_NAME,
};
use crate::config::Config;

type SenderPeerId = oneshot::Sender<core::result::Result<PeerId, DialError>>;
type SenderListenerId =
    oneshot::Sender<core::result::Result<ListenerId, libp2p::TransportError<io::Error>>>;

pub(crate) enum Command {
    IssueControl {
        tx: oneshot::Sender<Control>,
    },
    LookupPeer {
        address: Multiaddr,
        tx: SenderPeerId,
    },
    Metrics {
        tx: oneshot::Sender<metrics::Metrics>,
    },
    ListenOn {
        address: Multiaddr,
        tx: SenderListenerId,
    },
}

pub(crate) struct Task {
    swarm: TransportSwarm,

    registry: metrics::Registry,

    rx: mpsc::Receiver<Command>,
    ipc: TransportLayerIpc,

    peers: HashMap<Multiaddr, PeerId>,

    peers_waiting: HashMap<Multiaddr, Vec<SenderPeerId>>,
    peers_address_lookup: HashMap<ConnectionId, Multiaddr>,
}

impl Task {
    pub(crate) fn new(config: Config, transport: impl Transport) -> Result<Self, TransportError> {
        let mut registry = metrics::Registry::default();

        let (ipc, rx) = TransportLayerIpc::new();

        let swarm = SwarmBuilder::with_new_identity()
            .with_tokio()
            .with_other_transport(|keypair| {
                let noise = noise::Config::new(keypair)?;
                let yamux = yamux::Config::default();

                let transport = transport
                    .upgrade(upgrade::Version::V1Lazy)
                    .authenticate(noise)
                    .multiplex(yamux);

                Ok(transport)
            })
            .change_context(TransportError)?
            .with_bandwidth_metrics(&mut registry)
            .with_behaviour(|keys| TransportBehaviour {
                stream: stream::Behaviour::new(),
                identify: identify::Behaviour::new(identify::Config::new(
                    PROTOCOL_NAME.to_string(),
                    keys.public(),
                )),
                ping: ping::Behaviour::new(config.ping),
            })
            .change_context(TransportError)?
            .with_swarm_config(|existing| config.swarm.apply(existing))
            .build();

        Ok(Self {
            swarm,
            registry,

            rx,
            ipc,

            peers: HashMap::new(),
            peers_waiting: HashMap::new(),
        })
    }

    pub(crate) fn ipc(&self) -> TransportLayerIpc {
        self.ipc.clone()
    }

    fn send_ipc_response<T>(tx: oneshot::Sender<T>, value: T) {
        if tx.send(value).is_err() {
            tracing::error!("failed to send response to the IPC caller");
        }
    }

    fn handle_dial(&mut self, address: Multiaddr, tx: SenderPeerId) {
        tracing::info!(%address, "dialing peer");

        if let Some(peer_id) = self.peers.get(&address) {
            Self::send_ipc_response(tx, Ok(*peer_id));
        } else {
            let entry = self.peers_waiting.entry(address.clone());

            match entry {
                Entry::Occupied(mut entry) => {
                    entry.get_mut().push(tx);
                }
                Entry::Vacant(entry) => {
                    let opts = DialOpts::unknown_peer_id().address(address.clone()).build();
                    let id = opts.connection_id();

                    if let Err(error) = self.swarm.dial(opts) {
                        Self::send_ipc_response(tx, Err(error));
                    } else {
                        entry.insert(vec![tx]);
                        self.peers_address_lookup.insert(id, address);
                    }
                }
            }
        }
    }

    fn handle_command(&mut self, command: Command) {
        match command {
            Command::IssueControl { tx } => {
                let control = self.swarm.behaviour().stream.new_control();

                Self::send_ipc_response(tx, control);
            }
            Command::LookupPeer { address: addr, tx } => self.handle_dial(addr, tx),
            Command::Metrics { tx } => {
                let metrics = metrics::Metrics::new(&mut self.registry);

                Self::send_ipc_response(tx, metrics);
            }
            Command::ListenOn { address, tx } => {
                let result = self.swarm.listen_on(address);

                Self::send_ipc_response(tx, result);
            }
        }
    }

    fn handle_new_external_address_of_peer(&mut self, peer_id: PeerId, address: Multiaddr) {
        tracing::info!(%peer_id, %address, "discovered external address of peer");

        if let Some(senders) = self.peers_waiting.remove(&address) {
            for tx in senders {
                Self::send_ipc_response(tx, Ok(peer_id));
            }
        }

        // remove the connection id from the lookup table
        self.peers_address_lookup.retain(|_, addr| addr != &address);

        self.peers.insert(address, peer_id);
    }

    fn handle_outgoing_connection_error(
        &mut self,
        connection_id: ConnectionId,
        peer_id: Option<PeerId>,
        error: DialError,
    ) {
        tracing::warn!(%connection_id, ?peer_id, %error, "failed to establish outgoing connection");

        let Some(address) = self.peers_address_lookup.remove(&connection_id) else {
            return;
        };

        if let Some(senders) = self.peers_waiting.remove(&address) {
            for tx in senders {
                Self::send_ipc_response(tx, Err(error));
            }
        }
    }

    fn handle_event(&mut self, event: SwarmEvent<TransportBehaviourEvent>) {
        tracing::debug!(?event, "received swarm event");

        match event {
            SwarmEvent::NewListenAddr { address, .. } => {
                tracing::info!(%address, "listening on address");
            }
            SwarmEvent::NewExternalAddrOfPeer { peer_id, address } => {
                self.handle_new_external_address_of_peer(peer_id, address);
            }
            SwarmEvent::OutgoingConnectionError {
                connection_id,
                peer_id,
                error,
            } => {
                self.handle_outgoing_connection_error(connection_id, peer_id, error);
            }
            _ => {}
        }
    }

    #[allow(clippy::integer_division_remainder_used)]
    pub(crate) async fn run(mut self, cancel: CancellationToken) {
        loop {
            select! {
                Some(command) = self.rx.recv() => self.handle_command(command),
                Some(event) = self.swarm.next() => self.handle_event(event),
                () = cancel.cancelled() => break,
            }
        }
    }
}
