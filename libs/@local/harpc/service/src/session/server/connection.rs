use alloc::sync::Arc;
use core::{fmt::Debug, ops::ControlFlow, time::Duration};
use std::io;

use futures::{FutureExt, Sink, Stream, StreamExt};
use harpc_wire_protocol::{
    request::{body::RequestBody, id::RequestId, Request},
    response::Response,
};
use libp2p::PeerId;
use scc::{hash_index::Entry, HashIndex};
use tokio::{
    pin, select,
    sync::{
        broadcast,
        mpsc::{self, error::SendTimeoutError},
        OwnedSemaphorePermit, Semaphore,
    },
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
    session::error::{TransactionError, TransactionLaggingError, TransactionLimitReachedError},
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
    transactions: TransactionStorage,
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
                .retain_async(|_, TransactionState { cancel, .. }| {
                    if cancel.is_cancelled() {
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

struct ConcurrencyPermit {
    _permit: OwnedSemaphorePermit,
}

#[derive(Debug, Clone)]
struct ConcurrencyLimit {
    limit: usize,
    current: Arc<Semaphore>,
}

impl ConcurrencyLimit {
    fn new(limit: usize) -> Self {
        Self {
            limit,
            current: Arc::new(Semaphore::new(limit)),
        }
    }

    fn acquire(&self) -> Result<ConcurrencyPermit, TransactionLimitReachedError> {
        Arc::clone(&self.current).try_acquire_owned().map_or_else(
            |_error| Err(TransactionLimitReachedError { limit: self.limit }),
            |permit| Ok(ConcurrencyPermit { _permit: permit }),
        )
    }
}

#[derive(Debug, Clone)]
struct TransactionState {
    sender: mpsc::Sender<Request>,
    cancel: CancellationToken,
}

type TransactionStorage = Arc<HashIndex<RequestId, TransactionState>>;

pub(crate) struct TransactionCollection {
    config: SessionConfig,

    cancel: CancellationToken,
    storage: TransactionStorage,
    limit: ConcurrencyLimit,
}

impl TransactionCollection {
    pub(crate) fn new(config: SessionConfig, cancel: CancellationToken) -> Self {
        let senders = Arc::new(HashIndex::new());
        let limit = ConcurrencyLimit::new(config.per_connection_concurrent_transaction_limit);

        Self {
            config,
            cancel,
            storage: senders,
            limit,
        }
    }

    async fn acquire(
        &self,
        id: RequestId,
    ) -> Result<
        (
            Arc<TransactionPermit>,
            mpsc::Sender<Request>,
            mpsc::Receiver<Request>,
        ),
        TransactionLimitReachedError,
    > {
        let cancel = self.cancel.child_token();
        let (tx, rx) = mpsc::channel(self.config.per_transaction_request_buffer_size.get());

        let state = TransactionState {
            sender: tx.clone(),
            cancel: cancel.clone(),
        };

        let entry = self.storage.entry_async(id).await;
        match entry {
            Entry::Occupied(entry) => {
                // evict the old one by cancelling it, it's still active, so we do not decrease the
                // counter
                entry.cancel.cancel();

                entry.update(state);
            }
            Entry::Vacant(entry) => {
                entry.insert_entry(state);
            }
        }

        let handle = TransactionPermit::new(self, id, cancel)?;

        Ok((handle, tx, rx))
    }

    async fn release(&self, id: RequestId) {
        let entry = self.storage.entry_async(id).await;

        match entry {
            Entry::Occupied(entry) => {
                entry.cancel.cancel();
                entry.remove_entry();
            }
            Entry::Vacant(_) => {}
        }
    }

    async fn send(&self, request: Request) -> Result<(), TransactionLaggingError> {
        let id = request.header.request_id;

        let Some(entry) = self.storage.get(&id) else {
            tracing::info!(
                ?id,
                "rogue packet received that isn't part of a transaction, dropping"
            );

            return Ok(());
        };

        // this creates implicit backpressure, if the transaction cannot accept more
        // requests, we will wait a short amount (specified via the deadline), if we
        // haven't processed the data until then, we will drop the
        // transaction.
        let result = entry
            .sender
            .send_timeout(request, self.config.request_delivery_deadline)
            .await;

        let Err(error) = result else {
            return Ok(());
        };

        // This only happens in the case of a full buffer, which only happens if during
        // buffering in an upper layer we are not able to process
        // the data fast enough. This is also a mechanism to prevent
        // a single transaction from blocking the whole session,
        // and to prevent packet flooding.
        match error {
            SendTimeoutError::Timeout(_) => {
                tracing::warn!("transaction buffer is too slow, dropping transaction");
            }
            SendTimeoutError::Closed(_) => {
                tracing::info!("transaction task has shutdown, dropping transaction");
            }
        }

        // because we're missing a request in the transaction, we need to cancel it
        self.release(id).await;

        Err(TransactionLaggingError)
    }
}

pub(crate) struct TransactionPermit {
    id: RequestId,
    storage: TransactionStorage,

    cancel: CancellationToken,

    _permit: ConcurrencyPermit,
}

impl TransactionPermit {
    fn new(
        collection: &TransactionCollection,
        id: RequestId,
        cancel: CancellationToken,
    ) -> Result<Arc<Self>, TransactionLimitReachedError> {
        let permit = collection.limit.acquire()?;
        let storage = Arc::clone(&collection.storage);

        Ok(Arc::new(Self {
            id,
            storage,
            _permit: permit,
            cancel,
        }))
    }

    pub(crate) fn cancellation_token(&self) -> CancellationToken {
        self.cancel.clone()
    }
}

impl Drop for TransactionPermit {
    fn drop(&mut self) {
        self.storage.remove(&self.id);
    }
}

pub(crate) struct ConnectionTask<E> {
    pub(crate) peer: PeerId,
    pub(crate) session: SessionId,

    // Note: this does not account for transactions that have been requested (endOfRequest flag
    // set), but are still in flight.
    pub(crate) active: TransactionCollection,
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
        request: Request,
    ) -> ControlFlow<()> {
        // check if this is a `Begin` request, in that case we need to create a new transaction,
        // otherwise, this is already a transaction and we need to forward it, or log out if it is a
        // rogue request
        let request_id = request.header.request_id;

        // these transactions then need to be propagated to the main session layer via an mpsc
        // channel, which drops a transaction if there's too many.
        match &request.body {
            RequestBody::Begin(begin) => {
                #[expect(
                    clippy::significant_drop_in_scrutinee,
                    reason = "This simply returns a drop guard, that is carried through the \
                              transaction lifetime."
                )]
                let (guard, request_tx, request_rx) = match self.active.acquire(request_id).await {
                    Ok((guard, tx, rx)) => (guard, tx, rx),
                    Err(error) => {
                        tracing::info!("transaction limit reached, dropping transaction");

                        return self.respond_error(request_id, error, &tx).await;
                    }
                };

                let (transaction, task) = Transaction::from_request(
                    request.header,
                    begin,
                    TransactionParts {
                        peer: self.peer,
                        session: self.session,
                        config: self.config,
                        rx: request_rx,
                        tx: tx.clone(),
                    },
                );

                // we put it in the buffer, so will resolve immediately
                request_tx
                    .try_send(request)
                    .expect("infallible; buffer should be large enough to hold the request");

                task.start(tasks, guard);

                // creates implicit backpressure, if the session can not accept more transactions,
                // we will wait until we can, this means that we will not be able to
                // accept any more request packets until we can.
                let result = self
                    .output
                    .send_timeout(transaction, self.config.transaction_delivery_deadline)
                    .await;

                // This only happens in case of a full buffer, in that case we will drop the
                // transaction, because we can assume that the upper layer is unable to keep up with
                // the incoming requests, it also helps us to prevent a DoS attack.
                if let Err(error) = result {
                    match error {
                        SendTimeoutError::Timeout(_) => {
                            tracing::warn!("transaction delivery timed out, dropping transaction");
                            self.active.release(request_id).await;

                            return self
                                .respond_error(request_id, TransactionLaggingError, &tx)
                                .await;
                        }
                        SendTimeoutError::Closed(_) => {
                            // other end has been dropped, we can stop processing
                            return ControlFlow::Break(());
                        }
                    }
                }
            }
            RequestBody::Frame(_) => {
                if let Err(error) = self.active.send(request).await {
                    return self.respond_error(request_id, error, &tx).await;
                }
            }
        }

        // TODO: forced gc on timeout in upper layer

        // we do not need to check for `EndOfRequest` here and forcefully close the channel, as the
        // task is already doing this for us.

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
                transactions: Arc::clone(&self.active.storage),
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
                            if self.handle_request(tx.clone(), &tasks, request).await.is_break() {
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
