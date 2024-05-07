use std::collections::{hash_map::Entry, HashMap};

use error_stack::{Result, ResultExt};
use futures::prelude::stream::StreamExt;
use libp2p::{
    core::upgrade,
    identify, metrics, noise, ping,
    swarm::{DialError, SwarmEvent},
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
    PROTOCOL_NAME,
};
use crate::config::Config;

type SenderPeerId = oneshot::Sender<core::result::Result<PeerId, DialError>>;

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
}

pub(crate) trait Transport = libp2p::Transport<
        Output: futures::AsyncWrite + futures::AsyncRead + Send + Unpin,
        ListenerUpgrade: Send,
        Dial: Send,
        Error: Send + Sync,
    > + Send
    + Unpin
    + 'static;

pub(crate) struct Task {
    swarm: TransportSwarm,

    registry: metrics::Registry,

    rx: mpsc::Receiver<Command>,
    ipc: TransportLayerIpc,

    peers: HashMap<Multiaddr, PeerId>,
    peers_waiting: HashMap<Multiaddr, Vec<SenderPeerId>>,
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

    fn handle_dial(&mut self, addr: Multiaddr, tx: SenderPeerId) {
        if let Some(peer_id) = self.peers.get(&addr) {
            if tx.send(Ok(*peer_id)).is_err() {
                tracing::error!("failed to send peer id to the caller");
            }
        } else {
            let entry = self.peers_waiting.entry(addr.clone());

            match entry {
                Entry::Occupied(mut entry) => {
                    entry.get_mut().push(tx);
                }
                Entry::Vacant(entry) => {
                    if let Err(error) = self.swarm.dial(addr) {
                        if tx.send(Err(error)).is_err() {
                            tracing::error!("failed to send dial error to the caller");
                        }
                    } else {
                        entry.insert(vec![tx]);
                    }
                }
            }
        }
    }

    fn handle_command(&mut self, command: Command) {
        match command {
            Command::IssueControl { tx } => {
                let control = self.swarm.behaviour().stream.new_control();

                if tx.send(control).is_err() {
                    tracing::error!("failed to send issued control to the caller");
                }
            }
            Command::LookupPeer { address: addr, tx } => self.handle_dial(addr, tx),
            Command::Metrics { tx } => {
                let metrics = metrics::Metrics::new(&mut self.registry);

                if tx.send(metrics).is_err() {
                    tracing::error!("failed to send metrics registry to the caller");
                }
            }
        }
    }

    fn handle_new_external_address_of_peer(&mut self, peer_id: PeerId, address: Multiaddr) {
        tracing::info!(%peer_id, %address, "discovered external address of peer");

        if let Some(senders) = self.peers_waiting.remove(&address) {
            for tx in senders {
                if tx.send(Ok(peer_id)).is_err() {
                    tracing::error!("failed to send peer id to the caller");
                }
            }
        }

        self.peers.insert(address, peer_id);
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
