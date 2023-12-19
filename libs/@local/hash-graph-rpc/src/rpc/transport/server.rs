use std::{
    future::{ready, Future},
    sync::Arc,
};

use error_stack::ResultExt;
use libp2p::{
    core::transport::ListenerId,
    futures::{future::Either, FutureExt, StreamExt},
    request_response::{Event, Message, ResponseChannel},
    swarm::SwarmEvent,
    Multiaddr,
};
use tokio::{
    select,
    sync::{mpsc, oneshot},
};
use tonic::codegen::tokio_stream::Stream;

use crate::rpc::{
    transport::{
        log_behaviour_event, BehaviourCollectionEvent, RequestRouter, SpawnGuard, TransportConfig,
        TransportError, TransportLayer, TransportSwarm,
    },
    Response,
};

#[derive(Debug)]
pub(crate) enum ServerTransportCommand {
    Running(oneshot::Sender<bool>),
    ExternalAddress(oneshot::Sender<Option<Multiaddr>>),
}

#[derive(Debug, Clone)]
pub(crate) struct ServerTransportMetrics {
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

    pub(crate) async fn running(&self) -> bool {
        let (tx, rx) = oneshot::channel();

        self.communicate(ServerTransportCommand::Running(tx), rx)
            .await
    }

    pub(crate) async fn external_address(&self) -> Option<Multiaddr> {
        let (tx, rx) = oneshot::channel();

        self.communicate(ServerTransportCommand::ExternalAddress(tx), rx)
            .await
    }
}

#[derive(Debug, Clone)]
pub(crate) struct ServerTransportConfig {
    pub(crate) transport: TransportConfig,

    pub(crate) listen_on: Multiaddr,
}

pub(crate) struct ServerTransportLayer<T> {
    transport: TransportLayer,

    listen_on: Multiaddr,

    metrics_rx: mpsc::Receiver<ServerTransportCommand>,
    metrics: ServerTransportMetrics,

    router: T,
}

// type OpaqueFuture<'a> = impl Future<Output = ()> + Send + 'a;

impl<T> ServerTransportLayer<T>
where
    T: RequestRouter + Send + 'static,
{
    pub(crate) fn new(
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

    pub(crate) fn metrics(&self) -> ServerTransportMetrics {
        self.metrics.clone()
    }

    fn listen(&mut self) -> error_stack::Result<ListenerId, TransportError> {
        self.transport
            .swarm
            .listen_on(self.listen_on.clone())
            .change_context(TransportError)
    }

    fn handle_swarm_event(
        router: &T,
        event: <TransportSwarm as Stream>::Item,
    ) -> Option<impl Future<Output = (ResponseChannel<Response>, Response)> + Send + '_> {
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
                            let route = router
                                .route(request)
                                .then(move |response| ready((channel, response)));

                            return Some(route);
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

        None
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
                    let Some(future) = Self::handle_swarm_event(&self.router, event) else {
                        continue;
                    };

                    let (channel, response) = future.await;

                    if let Err(error) = swarm.behaviour_mut().protocol.send_response(channel, response) {
                        tracing::error!(?error, "failed to send response");
                    }
                },
                Some(event) = self.metrics_rx.recv() => {
                    Self::handle_metrics_event(&swarm, event);
                }
            }
        }
    }

    pub(crate) fn serve(
        mut self,
    ) -> error_stack::Result<impl Future<Output = !> + Send, TransportError> {
        self.listen()?;

        Ok(self.event_loop())
    }

    pub(crate) fn spawn(mut self) -> error_stack::Result<SpawnGuard, TransportError>
    where
        T: 'static,
    {
        self.listen()?;

        let handle = tokio::spawn(self.event_loop()).into();

        Ok(handle)
    }
}
