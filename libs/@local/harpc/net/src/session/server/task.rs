use alloc::sync::Arc;

use futures::{FutureExt, StreamExt};
use tokio::{
    select,
    sync::{Semaphore, TryAcquireError, broadcast, mpsc},
};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::{
    SessionConfig, SessionEvent, connection::collection::TransactionCollection,
    session_id::SessionIdProducer, transaction::Transaction,
};
use crate::{
    session::server::connection::ConnectionTask,
    transport::{
        TransportLayer,
        connection::{IncomingConnection, IncomingConnections},
    },
};

pub(crate) struct Task {
    pub id: SessionIdProducer,

    pub config: SessionConfig,

    pub active: Arc<Semaphore>,

    pub output: mpsc::Sender<Transaction>,
    pub events: broadcast::Sender<SessionEvent>,

    // significant because of the Drop, if dropped this will stop the task automatically
    pub _transport: TransportLayer,
}

impl Task {
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    #[expect(
        clippy::significant_drop_tightening,
        reason = "permit is used for congestion control"
    )]
    async fn handle(
        &mut self,
        listen: &mut IncomingConnections,
        tasks: TaskTracker,
        cancel: CancellationToken,
    ) {
        // In this loop, we first accept a connection and then attempt to acquire a permit.
        // This approach avoids holding connections in the accept queue when we cannot acquire a
        // permit, immediately dropping them instead.
        //
        // This method is more predictable compared to the alternative, where a connection would be
        // held until a permit could be acquired or it timed out. The latter scenario might result
        // in an older connection being accepted.
        //
        // Although it might seem that this uses a rendezvous channel from `futures_channel`, this
        // is not the case. The buffer is set to 0, but the channel’s capacity is `buffer +
        // num-senders` (which is always 1). As a result, we always buffer a connection,
        // allowing it to send a message that will never be answered, rather than being
        // instantly terminated. The implemented behavior is more predictable for the end user and
        // less confusing.
        loop {
            let connection = select! {
                connection = listen.next().fuse() => connection,
                () = self.output.closed() => {
                    break;
                }
                () = cancel.cancelled() => {
                    break;
                }
            };

            let Some(IncomingConnection {
                peer_id,
                sink,
                stream,
            }) = connection
            else {
                // connection has been closed
                break;
            };

            // try to obtain a permit and accept a new connection
            let permit = match Arc::clone(&self.active).try_acquire_owned() {
                Ok(permit) => permit,
                Err(TryAcquireError::NoPermits) => {
                    // we have reached the connection limit, we can't accept new connections
                    continue;
                }
                Err(TryAcquireError::Closed) => {
                    // semaphore has been closed, this means we can no longer accept new connections
                    break;
                }
            };

            let cancel = cancel.child_token();

            let task = ConnectionTask {
                peer: peer_id,
                session: self.id.produce(),
                config: self.config,
                transactions: TransactionCollection::new(self.config, cancel.clone()),
                output: self.output.clone(),
                events: self.events.clone(),

                _permit: permit,
            };

            tasks.spawn(task.run(sink, stream, tasks.clone(), cancel));
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

        let permits = self
            .active
            .acquire_many(self.config.concurrent_connection_limit.as_u32())
            .await;

        // we wait for all connections to finish, this is done by just acquiring all possible
        // permits
        if let Err(error) = permits {
            tracing::error!(?error, "failed to reclaim all connections");
        }
    }
}
