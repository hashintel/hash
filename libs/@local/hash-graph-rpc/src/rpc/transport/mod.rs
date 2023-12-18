mod client;
mod server;

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

use crate::rpc::{
    codec::{Codec, CodecKind},
    Request, Response,
};

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

impl TransportConfig {
    pub const fn with_codec(self, codec: CodecKind) -> Self {
        Self {
            codec: Codec {
                kind: codec,
                ..self.codec
            },
            ..self
        }
    }
}

struct TransportLayer {
    swarm: TransportSwarm,
}

impl TransportLayer {
    fn new(config: TransportConfig) -> error_stack::Result<Self, TransportError> {
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
                    "/hash/rpc/1".to_owned(),
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

pub(crate) trait ServiceRouter {
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

pub(crate) struct SpawnGuard(Option<JoinHandle<!>>);

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

#[cfg(test)]
mod test {
    use libp2p::tcp;
    use uuid::Uuid;

    use crate::rpc::{
        codec::{Codec, CodecKind},
        transport::{
            client::{ClientTransportConfig, ClientTransportLayer},
            server::{ServerTransportConfig, ServerTransportLayer},
            ServiceRouter, TransportConfig,
        },
        ActorId, PayloadSize, ProcedureId, Request, RequestHeader, Response, ResponseHeader,
        ResponsePayload, ServiceId,
    };

    struct EchoRouter;

    impl ServiceRouter for EchoRouter {
        async fn route(&self, request: Request) -> Response {
            Response {
                header: ResponseHeader {
                    size: request.header.size,
                },
                body: ResponsePayload::Success(request.body),
            }
        }
    }

    async fn echo(transport_config: TransportConfig) -> (ClientTransportLayer, impl Drop) {
        let router = EchoRouter;

        let server_config = ServerTransportConfig {
            transport: transport_config.clone(),
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
            transport: transport_config,
            remote,
        };

        let client = ClientTransportLayer::new(client_config).unwrap();

        (client, guard)
    }

    fn request() -> Request {
        let payload = *b"hello world";

        Request {
            header: RequestHeader {
                service: ServiceId::new(0x00),
                procedure: ProcedureId::new(0x00),
                actor: ActorId(Uuid::new_v4()),
                size: PayloadSize::len(&payload),
            },
            body: payload.to_vec().into(),
        }
    }

    #[test_log::test(tokio::test)]
    async fn echo_binary() {
        let (client, _guard) = echo(TransportConfig::default().with_codec(CodecKind::Binary)).await;

        let request = request();
        let payload = request.body.clone();

        let response = client.call(request).await.unwrap();
        let ResponsePayload::Success(body) = response.body else {
            panic!("expected success response");
        };

        assert_eq!(&*body, payload);
    }

    #[test_log::test(tokio::test)]
    async fn echo_text() {
        let (client, _guard) = echo(TransportConfig::default().with_codec(CodecKind::Text)).await;

        let request = request();
        let payload = request.body.clone();

        let response = client.call(request).await.unwrap();
        let ResponsePayload::Success(body) = response.body else {
            panic!("expected success response");
        };

        assert_eq!(&*body, payload);
    }

    #[test_log::test(tokio::test)]
    async fn connect_after_timeout() {
        let (client, _guard) = echo(
            TransportConfig {
                deadline: Some(std::time::Duration::from_millis(100)),
                ..TransportConfig::default()
            }
            .with_codec(CodecKind::Binary),
        )
        .await;

        let request = request();
        let payload = request.body.clone();

        let response = client.call(request.clone()).await.unwrap();
        let ResponsePayload::Success(body) = response.body else {
            panic!("expected success response");
        };
        assert_eq!(&*body, payload);

        // wait for the connection to timeout
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;

        let response = client.call(request).await.unwrap();
        let ResponsePayload::Success(body) = response.body else {
            panic!("expected success response");
        };
        assert_eq!(&*body, payload);
    }
}
