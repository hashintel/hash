use error_stack::{Result, ResultExt};
use futures::StreamExt;
use libp2p::{
    core::{muxing::StreamMuxerBox, upgrade},
    identify,
    metrics::{self, Metrics, Registry},
    noise, ping, yamux, StreamProtocol, SwarmBuilder, Transport,
};
use libp2p_stream as stream;
use stream::IncomingStreams;

use crate::{
    behaviour::{TransportBehaviour, TransportSwarm},
    config::Config,
};

const STREAM_PROTOCOL: StreamProtocol = StreamProtocol::new("/harpc");

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("transport layer")]
pub(crate) struct TransportError;

pub(crate) struct TransportLayer {
    swarm: TransportSwarm,

    registry: Registry,
    metrics: Metrics,
}

// TODO: rename transport into protocol!

impl TransportLayer {
    pub(crate) fn new(
        config: Config,
        transport: impl Transport<
            Output: futures::AsyncWrite + futures::AsyncRead + Send + Unpin,
            ListenerUpgrade: Send,
            Dial: Send,
            Error: Send + Sync,
        > + Send
        + Unpin
        + 'static,
    ) -> Result<Self, TransportError> {
        let mut registry = metrics::Registry::default();

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
                    "harpc/1.0.0".to_owned(),
                    keys.public(),
                )),
                ping: ping::Behaviour::new(config.ping),
            })
            .change_context(TransportError)?
            .with_swarm_config(|existing| config.swarm.apply(existing))
            .build();

        let metrics = Metrics::new(&mut registry);

        Ok(Self {
            swarm,
            registry,
            metrics,
        })
    }

    async fn recv_stream(incoming: IncomingStreams) {
        while let Some((peer, stream)) = incoming.next().await {
            // TODO: stream into codec (and back, for sending)
            yield stream;
        }
    }

    pub(crate) async fn recv(&self) {
        let mut control = self.swarm.behaviour().stream.new_control();
        let mut incoming = control.accept(STREAM_PROTOCOL)?;

        Self::recv_stream(incoming)
    }

    // TODO: recv, send, dial (?), where recv splits out a stream of wire-protocol messages.
}
