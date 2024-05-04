use error_stack::{Result, ResultExt};
use futures::prelude::stream::StreamExt;
use libp2p::{
    core::upgrade, identify, metrics, noise, ping, swarm::SwarmEvent, yamux, SwarmBuilder,
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
    PROTOCOL_NAME,
};
use crate::config::Config;

pub(crate) enum Command {
    IssueControl { tx: oneshot::Sender<Control> },
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
    metrics: metrics::Metrics,

    rx: mpsc::Receiver<Command>,
    tx: mpsc::Sender<Command>,
}

impl Task {
    pub(crate) fn new(config: Config, transport: impl Transport) -> Result<Self, TransportError> {
        let mut registry = metrics::Registry::default();

        let (tx, rx) = mpsc::channel(config.command_buffer_size.get());

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

        let metrics = metrics::Metrics::new(&mut registry);

        Ok(Self {
            swarm,
            registry,
            metrics,

            rx,
            tx,
        })
    }

    pub(crate) fn sender(&self) -> mpsc::Sender<Command> {
        self.tx.clone()
    }

    fn handle_command(&mut self, command: Command) {
        match command {
            Command::IssueControl { tx } => {
                let control = self.swarm.behaviour().stream.new_control();

                if tx.send(control).is_err() {
                    tracing::error!("failed to send issued control to the caller");
                }
            }
        }
    }

    fn handle_event(&mut self, event: SwarmEvent<TransportBehaviourEvent>) {
        tracing::debug!(?event, "received swarm event");
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
