mod behaviour;
mod client;
mod error;
mod server;

use std::io;

use error_stack::{Result, ResultExt};
use futures::{Sink, Stream, StreamExt};
use harpc_wire_protocol::{request::Request, response::Response};
use libp2p::{
    core::upgrade,
    identify,
    metrics::{self, Metrics, Registry},
    noise, ping, yamux, PeerId, StreamProtocol, SwarmBuilder, Transport,
};
use libp2p_stream as stream;
use tokio::io::BufStream;
use tokio_util::{codec::Framed, compat::FuturesAsyncReadCompatExt};

use self::{
    behaviour::{TransportBehaviour, TransportSwarm},
    client::ClientCodec,
    error::{OpenStreamError, TransportError},
    server::ServerCodec,
};
use crate::config::Config;

const STREAM_PROTOCOL: StreamProtocol = StreamProtocol::new("/harpc");

pub(crate) struct TransportLayer {
    swarm: TransportSwarm,

    registry: Registry,
    metrics: Metrics,
}

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

    pub(crate) fn listen(
        &self,
    ) -> Result<
        impl Stream<
            Item = (
                PeerId,
                impl Sink<Response>,
                impl Stream<Item = Result<Request, io::Error>>,
            ),
        >,
        TransportError,
    > {
        let mut control = self.swarm.behaviour().stream.new_control();
        let incoming = control
            .accept(STREAM_PROTOCOL)
            .change_context(TransportError)?;

        Ok(incoming.map(|(peer, stream)| {
            let stream = stream.compat();
            let stream = BufStream::new(stream);
            let stream = Framed::new(stream, ServerCodec::new());

            let (sink, stream) = stream.split();

            (peer, sink, stream)
        }))
    }

    pub(crate) async fn dial(&self, peer: PeerId) -> Result<(), TransportError> {
        let mut control = self.swarm.behaviour().stream.new_control();

        let stream = control
            .open_stream(peer, STREAM_PROTOCOL)
            .await
            .map_err(OpenStreamError::new)
            .change_context(TransportError)?;

        let stream = stream.compat();
        let stream = BufStream::new(stream);
        let stream = Framed::new(stream, ClientCodec::new());

        let (sink, stream) = stream.split();

        todo!("send a request to the sink")
    }

    // TODO: recv, send, dial (?), where recv splits out a stream of wire-protocol messages.
}
