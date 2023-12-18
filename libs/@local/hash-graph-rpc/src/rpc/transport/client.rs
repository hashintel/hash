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

struct EventLoopContext {
    server_address: Multiaddr,
    server_peer_id: Option<PeerId>,

    dialing: bool,

    waiting: Vec<(Request, oneshot::Sender<Response>)>,
    pending: HashMap<OutboundRequestId, oneshot::Sender<Response>>,
}

impl EventLoopContext {
    fn new(server_address: Multiaddr) -> Self {
        Self {
            server_address,
            server_peer_id: None,

            dialing: false,

            waiting: vec![],
            pending: HashMap::new(),
        }
    }

    fn dial(&mut self, transport: &mut TransportLayer) {
        if self.dialing {
            return;
        }

        let result = match self.server_peer_id {
            Some(server_peer_id) => transport.swarm.dial(server_peer_id),
            None => transport.swarm.dial(self.server_address.clone()),
        };

        if let Err(error) = result {
            tracing::error!(?error, "failed to dial server");
        } else {
            self.dialing = true;
        }
    }

    fn flush_waiting(&mut self, transport: &mut TransportLayer) {
        let Some(peer_id) = self.server_peer_id else {
            // do not flush waiting now, only once we've dialed the server and know the
            // server_peer_id
            self.dial(transport);
            return;
        };

        self.pending
            .extend(self.waiting.drain(..).map(|(request, tx)| {
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

    fn cancel_pending(&mut self, transport: &mut TransportLayer) {
        for (_, tx) in self.pending.drain() {
            // if let Err(error) = tx.send(Response::Error("connection closed".into())) {
            //     tracing::error!(?error, "failed to send response");
            // }
            todo!()
        }
    }
}

pub(crate) struct ClientTransportConfig {
    pub(crate) transport: TransportConfig,

    pub(crate) remote: Multiaddr,
}

// TODO: tx commands like Send, Cancel, etc. instead of what we have right now.
pub(crate) struct ClientTransportLayer {
    tx: mpsc::Sender<(Request, oneshot::Sender<Response>)>,
    _guard: SpawnGuard,
}

impl ClientTransportLayer {
    pub(crate) fn new(config: ClientTransportConfig) -> error_stack::Result<Self, TransportError> {
        let transport = TransportLayer::new(config.transport)?;

        let (tx, rx) = mpsc::channel(32);
        let guard = tokio::spawn(Self::event_loop(transport, config.remote, rx)).into();

        Ok(Self { tx, _guard: guard })
    }

    fn handle_channel_event(
        transport: &mut TransportLayer,

        request: Request,
        tx: oneshot::Sender<Response>,

        context: &mut EventLoopContext,
    ) {
        let Some(server) = context.server_peer_id else {
            context.waiting.push((request, tx));
            context.dial(transport);
            return;
        };

        let request_id = transport
            .swarm
            .behaviour_mut()
            .protocol
            .send_request(&server, request);

        context.pending.insert(request_id, tx);
    }

    fn handle_swarm_event(
        transport: &mut TransportLayer,

        event: SwarmEvent<BehaviourCollectionEvent>,

        context: &mut EventLoopContext,
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

                            if let Some(tx) = context.pending.remove(&request_id) {
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
                tracing::trace!(?peer_id, ?endpoint, "connection established");

                if *endpoint.get_remote_address() != context.server_address {
                    return;
                }

                context.server_peer_id = Some(peer_id);
                context.dialing = false;

                context.flush_waiting(transport);
            }
            SwarmEvent::ConnectionClosed {
                peer_id, endpoint, ..
            } => {
                tracing::trace!(?peer_id, ?endpoint, "connection closed");

                if *endpoint.get_remote_address() != context.server_address {
                    return;
                }

                context.cancel_pending(transport);
            }

            _ => {}
        }
    }

    async fn event_loop(
        mut transport: TransportLayer,
        remote: Multiaddr,
        mut rx: mpsc::Receiver<(Request, oneshot::Sender<Response>)>,
    ) -> ! {
        let mut context = EventLoopContext::new(remote);

        loop {
            select! {
                Some((request, tx)) = rx.recv() => {
                    Self::handle_channel_event(&mut transport, request, tx, &mut context);
                },
                event = transport.swarm.select_next_some() => {
                    Self::handle_swarm_event(&mut transport, event, &mut context);
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
