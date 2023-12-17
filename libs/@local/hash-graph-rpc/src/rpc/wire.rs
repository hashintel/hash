use std::future::Future;

use error_stack::ResultExt;
use libp2p::{
    futures::StreamExt,
    noise, request_response,
    request_response::{Behaviour, Event, Message, ProtocolSupport},
    swarm,
    swarm::SwarmEvent,
    tcp, yamux, Multiaddr, StreamProtocol, Swarm, SwarmBuilder,
};
use thiserror::Error;

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
    transport: Swarm<Behaviour<Codec>>,
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

        Ok(Self { transport })
    }
}

pub trait ServiceRouter {
    fn route(&self, request: Request) -> impl Future<Output = Response> + Send;
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
        let mut swarm = self.transport.transport;
        swarm
            .listen_on(self.listen_on)
            .change_context(TransportError)?;

        loop {
            match swarm.select_next_some().await {
                SwarmEvent::NewListenAddr { address, .. } => {
                    tracing::info!("listening on {}", address);
                }
                SwarmEvent::Behaviour(event) => {
                    tracing::trace!(?event, "behaviour event received");

                    match event {
                        Event::Message { peer, message } => {
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
                _ => {}
            }
        }
    }
}
