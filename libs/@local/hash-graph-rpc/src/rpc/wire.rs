use std::{collections::HashMap, future::Future};

use error_stack::{Report, ResultExt};
use libp2p::{
    futures::StreamExt,
    noise, request_response,
    request_response::{Behaviour, Event, Message, ProtocolSupport},
    swarm,
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

#[derive(Debug, Copy, Clone, Error)]
#[error("transport error")]
pub struct TransportError;

#[derive(Debug, Clone, Default)]
pub struct TransportConfig {
    pub tcp: tcp::Config,
    pub codec: Codec,
    pub behaviour: request_response::Config,
}

struct TransportLayer {
    swarm: Swarm<Behaviour<Codec>>,
}

impl TransportLayer {
    fn new(config: TransportConfig) -> error_stack::Result<Self, TransportError> {
        // TODO: swarm configuration
        let transport = SwarmBuilder::with_new_identity()
            .with_tokio()
            .with_tcp(config.tcp, noise::Config::new, yamux::Config::default)
            .change_context(TransportError)?
            .with_behaviour(|_| {
                Behaviour::with_codec(
                    config.codec,
                    [(StreamProtocol::new("/hash/rpc/1"), ProtocolSupport::Full)],
                    config.behaviour,
                )
            })
            .unwrap()
            .build();

        Ok(Self { swarm: transport })
    }

    async fn connect(&mut self, server: Multiaddr) -> error_stack::Result<PeerId, TransportError> {
        let start = Instant::now();
        self.swarm.dial(server).change_context(TransportError)?;

        let server_peer_id = match self.swarm.select_next_some().await {
            SwarmEvent::ConnectionEstablished { peer_id, .. } => peer_id,
            SwarmEvent::OutgoingConnectionError { peer_id, error, .. } => {
                return Err(Report::new(TransportError).attach_printable(format!(
                    "Outgoing connection error to {peer_id:?}: {error:?}",
                )));
            }
            // should be impossible
            other => panic!("{other:?}"),
        };

        let duration = start.elapsed();
        let duration_seconds = duration.as_secs_f64();

        tracing::info!(elapsed_time=%format!("{duration_seconds:.4} s"), "connected");

        Ok(server_peer_id)
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

#[derive(Debug, Clone)]
pub struct ServerTransportConfig {
    transport: TransportConfig,

    listen_on: Multiaddr,
}

pub struct ServerTransportLayer<T> {
    transport: TransportLayer,

    listen_on: Multiaddr,

    router: T,
}

impl<T> ServerTransportLayer<T>
where
    T: ServiceRouter + Send,
{
    pub fn new(
        router: T,
        config: ServerTransportConfig,
    ) -> error_stack::Result<Self, TransportError> {
        Ok(Self {
            transport: TransportLayer::new(config.transport)?,
            listen_on: config.listen_on,
            router,
        })
    }

    pub async fn serve(self) -> error_stack::Result<(), TransportError> {
        let mut swarm = self.transport.swarm;
        swarm
            .listen_on(self.listen_on)
            .change_context(TransportError)?;

        loop {
            match swarm.select_next_some().await {
                SwarmEvent::NewListenAddr { address, .. } => {
                    tracing::info!("listening on {}", address);
                }
                SwarmEvent::Behaviour(event) => {
                    log_behaviour_event(&event);

                    if let Event::Message { peer, message } = event {
                        tracing::trace!(?peer, ?message, "message received");

                        match message {
                            Message::Request {
                                request, channel, ..
                            } => {
                                let response = self.router.route(request).await;

                                if let Err(error) =
                                    swarm.behaviour_mut().send_response(channel, response)
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
    }
}

async fn client_loop(
    mut transport: TransportLayer,
    server: PeerId,
    mut rx: mpsc::Receiver<(Request, oneshot::Sender<Response>)>,
) -> ! {
    let mut pending = HashMap::new();

    loop {
        select! {
            Some((request, tx)) = rx.recv() => {
                let request_id = transport.swarm.behaviour_mut().send_request(&server, request);
                pending.insert(request_id, tx);
            },
            event = transport.swarm.select_next_some() => {
                if let SwarmEvent::Behaviour(event) = event {
                    log_behaviour_event(&event);

                    if let Event::Message { peer, message } = event {
                        match message {
                            Message::Request { request, .. } => {
                                tracing::trace!(?peer, ?request, "request received");
                            }
                            Message::Response { request_id, response } => {
                                if let Some(tx) = pending.remove(&request_id) {
                                    if let Err(error) = tx.send(response) {
                                        tracing::error!(?error, "failed to send response");
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

pub struct ClientTransportConfig {
    transport: TransportConfig,

    remote: Multiaddr,
}

pub struct ClientTransportLayer {
    tx: mpsc::Sender<(Request, oneshot::Sender<Response>)>,
    task: JoinHandle<!>,
}

impl ClientTransportLayer {
    pub async fn new(config: ClientTransportConfig) -> error_stack::Result<Self, TransportError> {
        let mut transport = TransportLayer::new(config.transport)?;
        let server_peer_id = transport.connect(config.remote).await?;

        let (tx, rx) = mpsc::channel(32);

        let task = tokio::spawn(client_loop(transport, server_peer_id, rx));

        Ok(Self { tx, task })
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

impl Drop for ClientTransportLayer {
    fn drop(&mut self) {
        self.task.abort();
    }
}
