use alloc::sync::Arc;
use core::{fmt::Debug, ops::ControlFlow, time::Duration};
use std::io;

use futures::{FutureExt, Sink, Stream, StreamExt};
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    request::{body::RequestBody, flags::RequestFlag, id::RequestId, Request},
    response::Response,
};
use libp2p::PeerId;
use scc::HashIndex;
use tokio::{
    pin, select,
    sync::{broadcast, mpsc, OwnedSemaphorePermit, Semaphore},
};
use tokio_stream::{wrappers::ReceiverStream, StreamNotifyClose};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::{
    session_id::SessionId,
    transaction::{Transaction, TransactionParts},
    write::ResponseWriter,
    SessionConfig, SessionEvent,
};
use crate::{
    codec::{ErrorEncoder, ErrorExt},
    session::error::{TransactionError, TransactionLimitReachedError},
};

struct ConnectionDelegateTask<T> {
    rx: mpsc::Receiver<Response>,

    sink: T,
}

impl<T> ConnectionDelegateTask<T>
where
    T: Sink<Response, Error: Debug> + Send,
{
    #[allow(clippy::integer_division_remainder_used)]
    async fn run(self, cancel: CancellationToken) -> Result<(), T::Error> {
        let sink = self.sink;
        pin!(sink);

        let forward = ReceiverStream::new(self.rx).map(Ok).forward(sink).fuse();

        // redirect the receiver stream to the sink, needs an extra task to drive both
        select! {
            result = forward => result,
            () = cancel.cancelled() => Ok(()),
        }
    }
}

struct ConnectionGarbageCollectorTask {
    every: Duration,
    transactions: Arc<HashIndex<RequestId, mpsc::Sender<Request>>>,
}

impl ConnectionGarbageCollectorTask {
    #[allow(clippy::integer_division_remainder_used)]
    async fn run(self, cancel: CancellationToken) {
        let mut interval = tokio::time::interval(self.every);

        loop {
            select! {
                _ = interval.tick() => {}
                () = cancel.cancelled() => break,
            }

            tracing::debug!("running garbage collector");

            let mut removed = 0_usize;
            self.transactions
                .retain_async(|_, tx| {
                    if tx.is_closed() {
                        removed += 1;
                        false
                    } else {
                        true
                    }
                })
                .await;

            if removed > 0 {
                // this should never really happen, but it's good to know if it does
                tracing::info!(removed, "garbage collector removed stale transactions");
            }
        }
    }
}

pub(crate) struct ConnectionTask<E> {
    pub(crate) peer: PeerId,
    pub(crate) session: SessionId,

    // TODO: we actually don't know if they're still active, only that their sender is still alive
    // this means that transaction limiting is not really possible with this setup.
    pub(crate) active: Arc<HashIndex<RequestId, mpsc::Sender<Request>>>,
    pub(crate) output: mpsc::Sender<Transaction>,
    pub(crate) events: broadcast::Sender<SessionEvent>,

    pub(crate) config: SessionConfig,
    pub(crate) encoder: Arc<E>,
    pub(crate) _permit: OwnedSemaphorePermit,
}

impl<E> ConnectionTask<E>
where
    E: ErrorEncoder + Send + Sync + 'static,
{
    async fn respond_error<T>(
        &self,
        id: RequestId,
        error: T,
        tx: &mpsc::Sender<Response>,
    ) -> ControlFlow<()>
    where
        T: ErrorExt + Send + Sync,
    {
        let TransactionError { code, bytes } = self.encoder.encode_error(error).await;

        let mut writer = ResponseWriter::new_error(id, code, tx);
        writer.push(bytes);

        if writer.flush().await.is_err() {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    }

    async fn handle_request(
        &self,
        tx: mpsc::Sender<Response>,
        tasks: &TaskTracker,
        cancel: &CancellationToken,
        request: Request,
    ) -> ControlFlow<()> {
        // check if this is a `Begin` request, in that case we need to create a new transaction,
        // otherwise, this is already a transaction and we need to forward it, or log out if it is a
        // rogue request
        // at the end of a transaction we close the transaction
        let request_id = request.header.request_id;
        let is_end = request.header.flags.contains(RequestFlag::EndOfRequest);

        // these transactions then need to be propagated to the main session layer via an mpsc
        // channel, which drops a transaction if there's too many.
        match &request.body {
            RequestBody::Begin(begin) => {
                if self.active.len() > self.config.per_connection_concurrent_transaction_limit {
                    tracing::warn!("transaction limit reached, dropping transaction");

                    return self
                        .respond_error(
                            request_id,
                            TransactionLimitReachedError {
                                limit: self.config.per_connection_concurrent_transaction_limit,
                            },
                            &tx,
                        )
                        .await;
                }

                let (transaction_tx, transaction_rx) =
                    mpsc::channel(self.config.per_transaction_request_buffer_size.get());

                let (transaction, task) = Transaction::from_request(
                    request.header,
                    begin,
                    TransactionParts {
                        peer: self.peer,
                        session: self.session,
                        config: self.config,
                        rx: transaction_rx,
                        tx,
                    },
                );

                // we put it in the buffer, so will resolve immediately
                transaction_tx
                    .try_send(request)
                    .expect("infallible; buffer should be large enough to hold the request");

                task.start(tasks, cancel.clone());

                // insert the transaction into the index (replace if already exists)
                let entry = self.active.entry_async(request_id).await;
                match entry {
                    scc::hash_index::Entry::Occupied(entry) => {
                        entry.update(transaction_tx);
                    }
                    scc::hash_index::Entry::Vacant(entry) => {
                        entry.insert_entry(transaction_tx);
                    }
                }

                // creates implicit backpressure, if the session can not accept more transactions,
                // we will wait until we can, this means that we will not be able to
                // accept any more request packets until we can.
                // TODO: We might want to use `.send_timeout` here to prevent it slowing down
                // any other transactions.
                if self.output.send(transaction).await.is_err() {
                    return ControlFlow::Break(());
                }
            }
            RequestBody::Frame(_) => {
                // forward the request to the transaction
                if let Some(entry) = self.active.get_async(&request.header.request_id).await {
                    // this creates implicit backpressure, if the transaction cannot accept more
                    // requests, we will wait until we can.
                    // TODO: We might want to use `.send_timeout` here to prevent it slowing down
                    // any other transactions.
                    // TODO: this has the potential problem that we stop other transactions from
                    // continuing if one transaction is slow (on our side).
                    if entry.send(request).await.is_err() {
                        tracing::warn!("transaction task has shutdown, dropping transaction");
                        entry.remove_entry();
                    }
                } else {
                    // request has no transaction, which means it is a rogue request
                    tracing::warn!(?request, "request not part of transaction");
                }
            }
        }

        // remove the transaction from the index if it is closed.
        // TODO: forced gc on timeout in upper layer
        if is_end {
            // removing this also means that all the channels will cascade close
            self.active.remove_async(&request_id).await;
        }

        ControlFlow::Continue(())
    }

    #[allow(clippy::integer_division_remainder_used)]
    pub(crate) async fn run<T, U>(
        self,
        sink: T,
        stream: U,
        tasks: TaskTracker,
        cancel: CancellationToken,
    ) where
        T: Sink<Response, Error: Debug + Send> + Send + 'static,
        U: Stream<Item = error_stack::Result<Request, io::Error>> + Send,
    {
        let stream = StreamNotifyClose::new(stream);

        pin!(stream);

        let finished = Semaphore::new(0);

        let cancel_gc = cancel.child_token();
        tasks.spawn(
            ConnectionGarbageCollectorTask {
                every: self
                    .config
                    .per_connection_transaction_garbage_collect_interval,
                transactions: Arc::clone(&self.active),
            }
            .run(cancel_gc.clone()),
        );
        let _drop_gc = cancel_gc.drop_guard();

        let (tx, rx) = mpsc::channel(self.config.per_connection_response_buffer_size.get());
        let mut handle = tasks
            .spawn(ConnectionDelegateTask { rx, sink }.run(cancel.clone()))
            .fuse();

        loop {
            select! {
                // we use `StreamNotifyClose` here (and the double `Option<Option<T>>`), so that we don't add too many permits at once
                // `StreamNotifyClose` is guaranteed to end once the stream is closed, and we won't poll again.
                Some(request) = stream.next() => {
                    match request {
                        None => {
                            // stream has finished
                            finished.add_permits(1);
                        }
                        Some(Ok(request)) => {
                            if self.handle_request(tx.clone(), &tasks, &cancel, request).await.is_break() {
                                tracing::info!("supervisor has been shut down");
                                break;
                            }
                        },
                        Some(Err(error)) => {
                            tracing::info!(?error, "malformed request");
                        }
                    }
                },
                result = &mut handle => {
                    match result {
                        Ok(Ok(())) => {},
                        Ok(Err(error)) => {
                            tracing::warn!(?error, "connection prematurely closed");
                        },
                        Err(error) => {
                            tracing::warn!(?error, "unable to join connection delegate task");
                        }
                    }

                    finished.add_permits(1);
                }
                _ = finished.acquire_many(2) => {
                    // both the stream and the sink have finished, we can terminate
                    break;
                }
                () = cancel.cancelled() => {
                    break;
                }
            }
        }

        if let Err(error) = self
            .events
            .send(SessionEvent::SessionDropped { id: self.session })
        {
            tracing::debug!(?error, "no receivers connected");
        };
    }
}
