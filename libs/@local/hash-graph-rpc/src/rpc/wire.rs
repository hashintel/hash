use std::{collections::HashMap, future::Future, mem, time::Duration};

use error_stack::{Report, ResultExt};
use libp2p::{
    core::transport::ListenerId,
    futures::{Stream, StreamExt},
    identify, noise, request_response,
    request_response::{Event, Message, OutboundRequestId, ProtocolSupport},
    swarm::{dial_opts::DialOpts, NetworkBehaviour, SwarmEvent},
    tcp, yamux, Multiaddr, PeerId, StreamProtocol, Swarm, SwarmBuilder,
};
use thiserror::Error;
use tokio::{
    select,
    sync::{mpsc, oneshot},
    task::JoinHandle,
    time::Instant,
};

use crate::rpc::{codec::Codec, Request, Response};

#[derive(NetworkBehaviour)]
struct BehaviourCollection {
    protocol: request_response::Behaviour<Codec>,
    identify: identify::Behaviour,
}

type TransportSwarm = Swarm<BehaviourCollection>;

#[derive(Debug, Copy, Clone, Error)]
#[error("transport error")]
pub struct TransportError;

#[derive(Debug, Clone, Default)]
pub struct TransportConfig {
    pub tcp: tcp::Config,
    pub codec: Codec,
    pub behaviour: request_response::Config,
    pub deadline: Option<Duration>,
}

struct TransportLayer {
    swarm: TransportSwarm,
}

impl TransportLayer {
    fn new(config: TransportConfig) -> error_stack::Result<Self, TransportError> {
        // TODO: swarm configuration
        let transport = SwarmBuilder::with_new_identity()
            .with_tokio()
            .with_tcp(config.tcp, noise::Config::new, yamux::Config::default)
            .change_context(TransportError)?
            .with_behaviour(|keys| BehaviourCollection {
                protocol: request_response::Behaviour::with_codec(
                    config.codec,
                    [(StreamProtocol::new("/hash/rpc/1"), ProtocolSupport::Full)],
                    config.behaviour,
                ),
                identify: identify::Behaviour::new(identify::Config::new(
                    "1".to_owned(),
                    keys.public(),
                )),
            })
            .unwrap()
            .with_swarm_config(|swarm_config| {
                swarm_config.with_idle_connection_timeout(
                    config.deadline.unwrap_or_else(|| Duration::from_secs(10)),
                )
            })
            .build();

        Ok(Self { swarm: transport })
    }
}

pub trait ServiceRouter {
    fn route(&self, request: Request) -> impl Future<Output = Response> + Send;
}

fn log_behaviour_event<TRequest, TResponse, TChannelResponse>(
    event: &Event<TRequest, TResponse, TChannelResponse>,
) {
    tracing::trace!("behaviour event received");

    match event {
        Event::Message { peer, .. } => {
            tracing::trace!(?peer, "message received");
        }
        Event::OutboundFailure {
            peer,
            request_id,
            error,
        } => {
            tracing::error!(?peer, ?request_id, ?error, "outbound failure");
        }
        Event::InboundFailure {
            peer,
            request_id,
            error,
        } => {
            tracing::error!(?peer, ?request_id, ?error, "inbound failure");
        }
        Event::ResponseSent { peer, request_id } => {
            tracing::trace!(?peer, ?request_id, "response sent");
        }
    }
}

pub struct SpawnGuard(Option<JoinHandle<!>>);

impl SpawnGuard {
    pub fn detach(&mut self) {
        mem::take(&mut self.0);
    }

    pub fn extract(mut self) -> Option<JoinHandle<!>> {
        mem::take(&mut self.0)
    }
}

impl From<JoinHandle<!>> for SpawnGuard {
    fn from(handle: JoinHandle<!>) -> Self {
        Self(Some(handle))
    }
}

impl Drop for SpawnGuard {
    fn drop(&mut self) {
        if let Some(handle) = self.0.take() {
            handle.abort();
        }
    }
}

#[derive(Debug)]
pub enum ServerTransportCommand {
    Running(oneshot::Sender<bool>),
    ExternalAddress(oneshot::Sender<Option<Multiaddr>>),
}

#[derive(Debug, Clone)]
pub struct ServerTransportMetrics {
    channel: mpsc::Sender<ServerTransportCommand>,
}

impl ServerTransportMetrics {
    async fn communicate<T>(&self, command: ServerTransportCommand, rx: oneshot::Receiver<T>) -> T
    where
        T: Send,
    {
        self.channel
            .send(command)
            .await
            .expect("metrics channel closed");

        rx.await.expect("metrics channel closed")
    }

    pub async fn running(&self) -> bool {
        let (tx, rx) = oneshot::channel();

        self.communicate(ServerTransportCommand::Running(tx), rx)
            .await
    }

    pub async fn external_address(&self) -> Option<Multiaddr> {
        let (tx, rx) = oneshot::channel();

        self.communicate(ServerTransportCommand::ExternalAddress(tx), rx)
            .await
    }
}

#[derive(Debug, Clone)]
pub struct ServerTransportConfig {
    transport: TransportConfig,

    listen_on: Multiaddr,
}

pub struct ServerTransportLayer<T> {
    transport: TransportLayer,

    listen_on: Multiaddr,

    metrics_rx: mpsc::Receiver<ServerTransportCommand>,
    metrics: ServerTransportMetrics,

    router: T,
}

impl<T> ServerTransportLayer<T>
where
    T: ServiceRouter + Send + Sync,
{
    pub fn new(
        router: T,
        config: ServerTransportConfig,
    ) -> error_stack::Result<Self, TransportError> {
        let (metrics_tx, metrics_rx) = mpsc::channel(32);
        let metrics = ServerTransportMetrics {
            channel: metrics_tx,
        };

        Ok(Self {
            transport: TransportLayer::new(config.transport)?,
            listen_on: config.listen_on,
            metrics_rx,
            metrics,
            router,
        })
    }

    pub fn metrics(&self) -> ServerTransportMetrics {
        self.metrics.clone()
    }

    fn listen(&mut self) -> error_stack::Result<ListenerId, TransportError> {
        self.transport
            .swarm
            .listen_on(self.listen_on.clone())
            .change_context(TransportError)
    }

    async fn handle_swarm_event(
        swarm: &mut TransportSwarm,
        router: &T,
        event: <TransportSwarm as Stream>::Item,
    ) {
        match event {
            SwarmEvent::NewListenAddr { address, .. } => {
                tracing::info!("listening on {}", address);
            }
            SwarmEvent::Behaviour(BehaviourCollectionEvent::Protocol(event)) => {
                log_behaviour_event(&event);

                if let Event::Message { peer, message } = event {
                    tracing::trace!(?peer, ?message, "message received");

                    match message {
                        Message::Request {
                            request, channel, ..
                        } => {
                            let response = router.route(request).await;

                            if let Err(error) = swarm
                                .behaviour_mut()
                                .protocol
                                .send_response(channel, response)
                            {
                                tracing::error!(?error, "failed to send response");
                            }
                        }
                        Message::Response {
                            request_id,
                            response,
                        } => {
                            tracing::trace!(?request_id, ?response, "response received");
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn handle_metrics_event(swarm: &TransportSwarm, event: ServerTransportCommand) {
        match event {
            ServerTransportCommand::Running(tx) => {
                let running = swarm.listeners().next().is_some();

                if let Err(error) = tx.send(running) {
                    tracing::error!(?error, "failed to send running status");
                }
            }
            ServerTransportCommand::ExternalAddress(tx) => {
                let external_address = swarm.listeners().next().cloned();

                if let Err(error) = tx.send(external_address) {
                    tracing::error!(?error, "failed to send external address");
                }
            }
        }
    }

    async fn event_loop(mut self) -> ! {
        let mut swarm = self.transport.swarm;

        loop {
            select! {
                event = swarm.select_next_some() => {
                    Self::handle_swarm_event(&mut swarm, &self.router, event).await;
                },
                Some(event) = self.metrics_rx.recv() => {
                    Self::handle_metrics_event(&swarm, event);
                }
            }
        }
    }

    pub async fn serve(mut self) -> error_stack::Result<(), TransportError> {
        self.listen()?;

        self.event_loop().await
    }

    pub fn spawn(mut self) -> error_stack::Result<SpawnGuard, TransportError>
    where
        T: 'static,
    {
        self.listen()?;

        let handle = tokio::spawn(self.event_loop()).into();

        Ok(handle)
    }
}

pub struct ClientTransportConfig {
    transport: TransportConfig,

    remote: Multiaddr,
}

pub struct ClientTransportLayer {
    tx: mpsc::Sender<(Request, oneshot::Sender<Response>)>,
    _guard: SpawnGuard,
}

impl ClientTransportLayer {
    pub fn new(config: ClientTransportConfig) -> error_stack::Result<Self, TransportError> {
        let transport = TransportLayer::new(config.transport)?;

        let (tx, rx) = mpsc::channel(32);
        let guard = tokio::spawn(Self::event_loop(transport, config.remote, rx)).into();

        Ok(Self { tx, _guard: guard })
    }

    fn handle_channel_event(
        transport: &mut TransportLayer,

        request: Request,
        tx: oneshot::Sender<Response>,

        remote: &Multiaddr,
        dialed: &mut bool,
        connected: &mut bool,
        waiting: &mut Vec<(Request, oneshot::Sender<Response>)>,
        pending: &mut HashMap<OutboundRequestId, oneshot::Sender<Response>>,
        server: &Option<PeerId>,
    ) {
        let Some(server) = server else {
            if !*dialed {
                if let Err(error) = transport.swarm.dial(remote.clone()) {
                    tracing::error!(?error, "failed to dial server");
                } else {
                    *dialed = true;
                }
            }

            waiting.push((request, tx));
            return;
        };

        if !*connected {
            if let Err(error) = transport.swarm.dial(*server) {
                tracing::error!(?error, "failed to dial server");
            }
            waiting.push((request, tx));
            return;
        }

        let request_id = transport
            .swarm
            .behaviour_mut()
            .protocol
            .send_request(&server, request);
        pending.insert(request_id, tx);
    }

    fn handle_swarm_event(
        transport: &mut TransportLayer,

        event: SwarmEvent<BehaviourCollectionEvent>,

        remote: &Multiaddr,

        dialed: &mut bool,
        connected: &mut bool,
        waiting: &mut Vec<(Request, oneshot::Sender<Response>)>,
        pending: &mut HashMap<OutboundRequestId, oneshot::Sender<Response>>,
        server: &mut Option<PeerId>,
    ) {
        match event {
            SwarmEvent::Behaviour(BehaviourCollectionEvent::Protocol(event)) => {
                log_behaviour_event(&event);

                if let Event::Message { peer, message } = event {
                    match message {
                        Message::Request { request, .. } => {
                            tracing::trace!(?peer, ?request, "request received");
                        }
                        Message::Response {
                            request_id,
                            response,
                        } => {
                            tracing::trace!(?request_id, ?response, "response received");

                            if let Some(tx) = pending.remove(&request_id) {
                                if let Err(error) = tx.send(response) {
                                    tracing::error!(?error, "failed to send response");
                                }
                            }
                        }
                    }
                }
            }
            SwarmEvent::ConnectionEstablished {
                peer_id, endpoint, ..
            } => {
                if endpoint.get_remote_address() == remote {
                    *server = Some(peer_id);
                    *connected = true;
                    *dialed = false;

                    pending.extend(waiting.drain(..).map(|(request, tx)| {
                        (
                            transport
                                .swarm
                                .behaviour_mut()
                                .protocol
                                .send_request(&peer_id, request),
                            tx,
                        )
                    }));
                }
            }
            SwarmEvent::ConnectionClosed {
                peer_id, endpoint, ..
            } => {
                if endpoint.get_remote_address() == remote {
                    *connected = false;

                    // TODO: notify all pending requests to be cancelled.

                    pending.extend(waiting.drain(..).map(|(request, tx)| {
                        (
                            transport
                                .swarm
                                .behaviour_mut()
                                .protocol
                                .send_request(&peer_id, request),
                            tx,
                        )
                    }));
                }
            }
            _ => {}
        }
    }

    async fn event_loop(
        mut transport: TransportLayer,
        remote: Multiaddr,
        mut rx: mpsc::Receiver<(Request, oneshot::Sender<Response>)>,
    ) -> ! {
        let mut pending = HashMap::new();
        let mut waiting = vec![];
        let mut server = None;

        let mut dialed = false;
        let mut connected = false;

        loop {
            select! {
                Some((request, tx)) = rx.recv() => {
                    Self::handle_channel_event(&mut transport, request, tx, &remote, &mut dialed, &mut connected ,&mut waiting, &mut pending, &server);
                },
                event = transport.swarm.select_next_some() => {
                    Self::handle_swarm_event(&mut transport, event, &remote, &mut dialed, &mut connected, &mut waiting, &mut pending, &mut server);
                }
            }
        }
    }

    pub async fn call(&self, request: Request) -> error_stack::Result<Response, TransportError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send((request, tx))
            .await
            .change_context(TransportError)?;

        rx.await.change_context(TransportError)
    }
}

#[cfg(test)]
mod test {
    use libp2p::tcp;
    use uuid::Uuid;

    use crate::rpc::{
        wire::{
            ClientTransportConfig, ClientTransportLayer, ServerTransportConfig,
            ServerTransportLayer, ServiceRouter, TransportConfig,
        },
        ActorId, PayloadSize, ProcedureId, Request, RequestHeader, Response, ResponseHeader,
        ServiceId,
    };

    struct EchoRouter;

    impl ServiceRouter for EchoRouter {
        async fn route(&self, request: Request) -> Response {
            Response {
                header: ResponseHeader {
                    size: request.header.size,
                },
                body: request.body,
            }
        }
    }

    async fn echo() -> (ClientTransportLayer, impl Drop) {
        let router = EchoRouter;

        let server_config = ServerTransportConfig {
            transport: TransportConfig::default(),
            listen_on: "/ip4/0.0.0.0/tcp/0".parse().unwrap(),
        };

        let server = ServerTransportLayer::new(router, server_config).unwrap();
        let server_metrics = server.metrics();
        let guard = server.spawn().unwrap();

        // poll until active
        while !server_metrics.running().await {
            tracing::info!("waiting for server to start");
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        let remote = server_metrics.external_address().await.unwrap();
        tracing::info!("server listening on {}", remote);

        let client_config = ClientTransportConfig {
            transport: TransportConfig::default(),
            remote,
        };

        let client = ClientTransportLayer::new(client_config).unwrap();

        (client, guard)
    }

    #[test_log::test(tokio::test)]
    async fn echo_test() {
        let (client, _guard) = echo().await;

        let payload = *b"hello world";

        let request = Request {
            header: RequestHeader {
                service: ServiceId::new(0x00),
                procedure: ProcedureId::new(0x00),
                actor: ActorId(Uuid::new_v4()),
                size: PayloadSize::len(&payload),
            },
            body: payload.to_vec().into(),
        };

        let response = client.call(request).await.unwrap();

        assert_eq!(&*response.body, payload);
    }
}
