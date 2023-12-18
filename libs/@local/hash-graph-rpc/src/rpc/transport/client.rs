use std::collections::HashMap;

use error_stack::ResultExt;
use libp2p::{
    futures::StreamExt,
    request_response::{Event, Message, OutboundRequestId},
    swarm::SwarmEvent,
    Multiaddr, PeerId,
};
use tokio::{
    select,
    sync::{mpsc, oneshot},
};

use crate::rpc::{
    transport::{
        log_behaviour_event, BehaviourCollectionEvent, SpawnGuard, TransportConfig, TransportError,
        TransportLayer,
    },
    Request, Response,
};

pub(crate) struct ClientTransportConfig {
    pub(crate) transport: TransportConfig,

    pub(crate) remote: Multiaddr,
}

pub(crate) struct ClientTransportLayer {
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
                tracing::trace!(?peer_id, ?endpoint, "connection closed");

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

    pub(crate) async fn call(
        &self,
        request: Request,
    ) -> error_stack::Result<Response, TransportError> {
        let (tx, rx) = oneshot::channel();

        self.tx
            .send((request, tx))
            .await
            .change_context(TransportError)?;

        rx.await.change_context(TransportError)
    }
}
