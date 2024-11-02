use alloc::sync::Arc;
use core::mem;
use std::{
    collections::{HashMap, hash_map::Entry},
    io,
};

use error_stack::{Result, ResultExt as _};
use futures::prelude::stream::StreamExt as _;
use libp2p::{
    Multiaddr, PeerId, SwarmBuilder,
    core::{transport::ListenerId, upgrade},
    identify,
    metrics::{self, Metrics, Recorder as _},
    noise, ping,
    swarm::{ConnectionId, DialError, SwarmEvent, dial_opts::DialOpts},
    yamux,
};
use libp2p_stream as stream;
use stream::Control;
use tokio::{
    select,
    sync::{mpsc, oneshot},
};
use tokio_util::sync::CancellationToken;

use super::{
    PROTOCOL_NAME, Transport, TransportConfig,
    behaviour::{TransportBehaviour, TransportBehaviourEvent, TransportSwarm},
    error::TransportError,
    ipc::TransportLayerIpc,
};

type SenderPeerId = oneshot::Sender<core::result::Result<PeerId, DialError>>;
type SenderListenOn =
    oneshot::Sender<core::result::Result<Multiaddr, libp2p::TransportError<io::Error>>>;

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
        tx: SenderListenOn,
    },
    ExternalAddresses {
        tx: oneshot::Sender<Vec<Multiaddr>>,
    },
}

pub(crate) struct TransportTask {
    peer_id: PeerId,
    swarm: TransportSwarm,

    registry: Arc<metrics::Registry>,
    metrics: metrics::Metrics,

    rx: mpsc::Receiver<Command>,
    ipc: TransportLayerIpc,

    peers: HashMap<Multiaddr, PeerId>,
    peers_waiting: HashMap<Multiaddr, Vec<SenderPeerId>>,
    peers_address_lookup: HashMap<ConnectionId, Multiaddr>,

    listeners: HashMap<ListenerId, Vec<Multiaddr>>,
    listeners_waiting: HashMap<ListenerId, Vec<SenderListenOn>>,
}

impl TransportTask {
    pub(crate) fn new(
        config: TransportConfig,
        transport: impl Transport,
    ) -> Result<Self, TransportError> {
        let mut registry = metrics::Registry::default();

        let (ipx_tx, rx) = mpsc::channel(config.ipc_buffer_size.get());
        let ipc = TransportLayerIpc::new(ipx_tx);

        let swarm = SwarmBuilder::with_new_identity()
            .with_tokio()
            .with_other_transport(|keypair| {
                let noise = noise::Config::new(keypair)?;

                // The choice of multiplexer sadly isn't obvious, as each multiplexer has its own
                // advantages and disadvantages. The two available multiplexers are `mplex` and
                // `yamux`.
                //
                // `yamux` is recommended for all new applications, but sadly the current Rust
                // implementations has some problems.
                // `yamux` has two different modes of operations, `WindowUpdateMode::OnRead` and
                // `WindowUpdateMode::OnReceive`. The former is the default as it obeys
                // backpressure, but sadly it isn't really usable.
                // `yamux` on `WindowUpdateMode::OnRead` is prone to deadlocks in the case that both
                // sides of the connection are upgrading the window size at the same time.
                // This is undesirable, as our implementation is inherently duplexed, making no
                // distinction between the two sides of the connection. This allows for much higher
                // throughput. `WindowUpdateMode::OnReceive` on the other hand has the problem that
                // if too much data is send the error "buffer of stream grows beyond limit" is
                // emitted on the client and data is lost.
                //
                // `mplex` is an alternative multiplexer that is slower than `yamux`, but doesn't
                // suffer from the problem, instead `mplex` observes another problem, which is that
                // it it (a) considered legacy, (b) allows writing after the connection has
                // terminated, this means that we are unable to reliable detect if a connection has
                // been terminated and our process will continue writing to the buffer and (c) is
                // 3-10% slower than using yamux.
                //
                // Another alternative would be using QUIC, this has a massive performance penalty
                // of ~50% as well as is unable to be used with JavaScript as `nodejs` does not
                // support QUIC yet.
                //
                // As a compromise we're using `yamux 0.12` in `WindowUpdateMode::OnReceive` mode
                // with a buffer that is 16x higher than the default (as default) with a value of
                // 16MiB.
                let yamux: yamux::Config = config.yamux.into();

                let transport = transport
                    .upgrade(upgrade::Version::V1Lazy)
                    .authenticate(noise)
                    .multiplex(yamux);

                Ok(transport)
            })
            .change_context(TransportError::SetupSwarmTransport)?;

        let Ok(swarm) = swarm
            .with_bandwidth_metrics(&mut registry)
            .with_behaviour(|keys| TransportBehaviour {
                stream: stream::Behaviour::new(),
                identify: identify::Behaviour::new(identify::Config::new(
                    PROTOCOL_NAME.to_string(),
                    keys.public(),
                )),
                ping: ping::Behaviour::new(config.ping.into()),
            });

        let swarm = swarm
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

            listeners: HashMap::new(),
            listeners_waiting: HashMap::new(),
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

    fn handle_listen_on(&mut self, address: Multiaddr, tx: SenderListenOn) {
        tracing::debug!(%address, "starting to listening on address");

        match self.swarm.listen_on(address) {
            Ok(id) => {
                if let Some(addresses) = self.listeners.get(&id) {
                    let address = addresses[0].clone();

                    Self::send_ipc_response(tx, Ok(address));
                } else {
                    let entry = self.listeners_waiting.entry(id);

                    match entry {
                        Entry::Occupied(mut entry) => {
                            entry.get_mut().push(tx);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(vec![tx]);
                        }
                    }
                }
            }
            Err(error) => {
                Self::send_ipc_response(tx, Err(error));
            }
        }
    }

    fn handle_command(&mut self, command: Command) {
        match command {
            Command::IssueControl { tx } => {
                let control = self.swarm.behaviour().stream.new_control();

                Self::send_ipc_response(tx, control);
            }
            Command::LookupPeer { address, tx } => self.handle_dial(address, tx),
            Command::ListenOn { address, tx } => self.handle_listen_on(address, tx),
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

    fn handle_new_listen_addr(&mut self, address: Multiaddr, listener_id: ListenerId) {
        tracing::info!(%address, "listening on address");

        if let Some(senders) = self.listeners_waiting.remove(&listener_id) {
            for tx in senders {
                Self::send_ipc_response(tx, Ok(address.clone()));
            }
        }

        match self.listeners.entry(listener_id) {
            Entry::Occupied(mut entry) => {
                entry.get_mut().push(address);
            }
            Entry::Vacant(entry) => {
                entry.insert(vec![address]);
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
            SwarmEvent::NewListenAddr {
                address,
                listener_id,
            } => {
                self.handle_new_listen_addr(address, listener_id);
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

    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    pub(crate) async fn run(mut self, cancel: CancellationToken) {
        loop {
            select! {
                Some(command) = self.rx.recv() => self.handle_command(command),
                event = self.swarm.next() => {
                    if let Some(event) = event {
                        self.handle_event(event);
                    } else {
                        tracing::warn!("received None from swarm.next()");
                    }
                },
                () = cancel.cancelled() => break,
            }
        }
    }
}
