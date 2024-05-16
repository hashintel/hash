use alloc::sync::Arc;

use error_stack::FutureExt as _;
use futures::{FutureExt, StreamExt, TryFutureExt};
use tokio::{
    select,
    sync::{broadcast, mpsc, Semaphore},
};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::{
    connection::TransactionCollection, session_id::SessionIdProducer, transaction::Transaction,
    SessionConfig, SessionEvent,
};
use crate::{
    codec::ErrorEncoder,
    session::{error::SessionError, server::connection::ConnectionTask},
    transport::{
        connection::{IncomingConnection, IncomingConnections},
        TransportLayer,
    },
};

pub(crate) struct Task<E> {
    pub(crate) id: SessionIdProducer,

    pub(crate) config: SessionConfig,

    pub(crate) active: Arc<Semaphore>,

    pub(crate) output: mpsc::Sender<Transaction>,
    pub(crate) events: broadcast::Sender<SessionEvent>,
    pub(crate) encoder: E,

    // significant because of the Drop, if dropped this will stop the task automatically
    pub(crate) _transport: TransportLayer,
}

impl<E> Task<E>
where
    E: ErrorEncoder + Clone + Send + Sync + 'static,
{
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]

    async fn handle(
        &mut self,
        listen: &mut IncomingConnections,
        tasks: TaskTracker,
        cancel: CancellationToken,
    ) {
        loop {
            // first try to acquire a permit, if we can't, we can't accept new connections,
            // then we try to accept a new connection, this way we're able to still apply
            // backpressure
            let next = Arc::clone(&self.active)
                .acquire_owned()
                .change_context(SessionError)
                .and_then(|permit| {
                    listen
                        .next()
                        .map(|connection| connection.map(|connection| (permit, connection)))
                        .map(Ok)
                })
                .fuse();

            let connection = select! {
                connection = next => connection,
                () = self.output.closed() => {
                    break;
                }
                () = cancel.cancelled() => {
                    break;
                }
            };

            match connection {
                Ok(Some((
                    permit,
                    IncomingConnection {
                        peer_id,
                        sink,
                        stream,
                    },
                ))) => {
                    let cancel = cancel.child_token();

                    let task = ConnectionTask {
                        peer: peer_id,
                        session: self.id.produce(),
                        config: self.config,
                        active: TransactionCollection::new(self.config, cancel.clone()),
                        output: self.output.clone(),
                        events: self.events.clone(),
                        encoder: self.encoder.clone(),
                        _permit: permit,
                    };

                    tasks.spawn(task.run(sink, stream, tasks.clone(), cancel));
                }
                Ok(None) => {
                    break;
                }
                Err(_) => {
                    // semaphore has been closed, this means we can no longer accept new connections
                    break;
                }
            }
        }
    }

    pub(crate) async fn run(
        mut self,
        mut listen: IncomingConnections,
        tasks: TaskTracker,
        cancel: CancellationToken,
    ) {
        self.handle(&mut listen, tasks, cancel.clone()).await;

        // instead of instantly returning (which would remove any connection) we drain the
        // connections, but only if we're not cancelled and the semaphore is still open
        if cancel.is_cancelled() || self.active.is_closed() {
            return;
        }

        // we wait for all connections to finish, this is done by just acquiring all possible
        // permits
        if let Err(error) = self
            .active
            .acquire_many(self.config.concurrent_connection_limit.as_u32())
            .await
        {
            tracing::error!(?error, "failed to reclaim all connections");
        }
    }
}
