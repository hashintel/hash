use alloc::sync::Arc;
use core::mem;
use std::{
    collections::{hash_map::Entry, HashMap},
    io,
};

use error_stack::{Result, ResultExt};
use futures::prelude::stream::StreamExt;
use libp2p::{
    core::{transport::ListenerId, upgrade},
    identify,
    metrics::{self, Metrics, Recorder},
    noise, ping,
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
    ListenOn {
        address: Multiaddr,
        tx: SenderListenerId,
    },
    ExternalAddresses {
        tx: oneshot::Sender<Vec<Multiaddr>>,
    },
}

pub(crate) struct Task {
    peer_id: PeerId,
    swarm: TransportSwarm,

    registry: Arc<metrics::Registry>,
    metrics: metrics::Metrics,

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

        let peer_id = *swarm.local_peer_id();

        let metrics = Metrics::new(&mut registry);
        let registry = Arc::new(registry);

        Ok(Self {
            peer_id,
            swarm,

            registry,
            metrics,

            rx,
            ipc,

            peers: HashMap::new(),
            peers_waiting: HashMap::new(),
            peers_address_lookup: HashMap::new(),
        })
    }

    pub(crate) const fn peer_id(&self) -> PeerId {
        self.peer_id
    }

    pub(crate) fn registry(&self) -> Arc<metrics::Registry> {
        Arc::clone(&self.registry)
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
            Command::ListenOn { address, tx } => {
                let result = self.swarm.listen_on(address);

                Self::send_ipc_response(tx, result);
            }
            Command::ExternalAddresses { tx } => {
                let addresses = self.swarm.listeners().cloned().collect();

                Self::send_ipc_response(tx, addresses);
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

        let mut error = error;

        let Some(address) = self.peers_address_lookup.remove(&connection_id) else {
            return;
        };

        // the peer has been invalidated, so we remove it from the list of known peers
        self.peers.remove(&address);

        if let Some(senders) = self.peers_waiting.remove(&address) {
            for tx in senders {
                // `DialError` is not `Clone`, so for every subsequent call to `send_ipc_response`
                // (if we have multiple calls) we replace the error with `DialError::Aborted`, which
                // is the closest I could find to a generic error.
                Self::send_ipc_response(tx, Err(mem::replace(&mut error, DialError::Aborted)));
            }
        }
    }

    fn handle_event(&mut self, event: SwarmEvent<TransportBehaviourEvent>) {
        tracing::debug!(?event, "received swarm event");

        match &event {
            SwarmEvent::Behaviour(TransportBehaviourEvent::Identify(event)) => {
                self.metrics.record(event);
            }
            SwarmEvent::Behaviour(TransportBehaviourEvent::Ping(event)) => {
                self.metrics.record(event);
            }
            event => self.metrics.record(event),
        }

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
