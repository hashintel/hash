#[cfg(test)]
mod test;

use alloc::sync::Arc;
use core::{
    fmt::Debug,
    future,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use std::io;

use futures::{stream, FutureExt, Sink, Stream, StreamExt};
use harpc_wire_protocol::{
    request::{body::RequestBody, id::RequestId, Request},
    response::{kind::ResponseKind, Response},
};
use libp2p::PeerId;
use scc::{ebr::Guard, hash_index::Entry, HashIndex};
use tokio::{
    pin, select,
    sync::{broadcast, mpsc, Notify, OwnedSemaphorePermit, Semaphore},
};
use tokio_stream::{wrappers::ReceiverStream, StreamNotifyClose};
use tokio_util::{either::Either, sync::CancellationToken, task::TaskTracker};

use super::{
    session_id::SessionId,
    transaction::{Transaction, TransactionParts},
    SessionConfig, SessionEvent,
};
use crate::{
    codec::{ErrorEncoder, PlainError},
    session::{
        error::{
            ConnectionShutdownError, ConnectionTransactionLimitReachedError,
            InstanceTransactionLimitReachedError, TransactionError, TransactionLaggingError,
        },
        writer::{ResponseContext, ResponseWriter, WriterOptions},
    },
};

struct ConnectionDelegateTask<T> {
    rx: mpsc::Receiver<Response>,

    sink: T,
}

impl<T> ConnectionDelegateTask<T>
where
    T: Sink<Response, Error: Debug> + Send,
{
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
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
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
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

#[derive(Debug)]
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

    fn acquire(&self) -> Result<ConcurrencyPermit, ConnectionTransactionLimitReachedError> {
        Arc::clone(&self.current).try_acquire_owned().map_or_else(
            |_error| Err(ConnectionTransactionLimitReachedError { limit: self.limit }),
            |permit| Ok(ConcurrencyPermit { _permit: permit }),
        )
    }
}

#[derive(Debug, Clone)]
struct TransactionState {
    generation: u64,

    sender: tachyonix::Sender<Request>,
    cancel: CancellationToken,
}

type TransactionStorage = Arc<HashIndex<RequestId, TransactionState>>;

pub(crate) struct TransactionCollection {
    config: SessionConfig,

    generation: AtomicU64,
    notify: Arc<Notify>,

    cancel: CancellationToken,
    storage: TransactionStorage,
    limit: ConcurrencyLimit,
}

impl TransactionCollection {
    pub(crate) fn new(config: SessionConfig, cancel: CancellationToken) -> Self {
        let storage = Arc::new(HashIndex::new());
        let limit = ConcurrencyLimit::new(config.per_connection_concurrent_transaction_limit);
        let notify = Arc::new(Notify::new());

        Self {
            generation: AtomicU64::new(0),
            notify,
            config,
            cancel,
            storage,
            limit,
        }
    }

    async fn acquire(
        &self,
        id: RequestId,
    ) -> Result<
        (
            Arc<TransactionPermit>,
            tachyonix::Sender<Request>,
            tachyonix::Receiver<Request>,
        ),
        ConnectionTransactionLimitReachedError,
    > {
        let cancel = self.cancel.child_token();

        let handle = TransactionPermit::new(self, id, cancel.clone())?;

        let (tx, rx) = tachyonix::channel(self.config.per_transaction_request_buffer_size.get());

        let state = TransactionState {
            generation: handle.generation,
            sender: tx.clone(),
            cancel,
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

    fn shutdown_senders(&self) {
        let guard = Guard::new();
        for (_, state) in self.storage.iter(&guard) {
            state.sender.close();
        }
    }

    fn cancel_all(&self) {
        let guard = Guard::new();
        for (_, state) in self.storage.iter(&guard) {
            state.cancel.cancel();
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
        let result = tokio::time::timeout(
            self.config.request_delivery_deadline,
            entry.sender.send(request),
        )
        .await;

        // This only happens in the case of a full buffer, which only happens if during
        // buffering in an upper layer we are not able to process
        // the data fast enough. This is also a mechanism to prevent
        // a single transaction from blocking the whole session,
        // and to prevent packet flooding.
        match result {
            Ok(Ok(())) => {
                // everything is fine, continue by early returning
                Ok(())
            }
            Ok(Err(_)) => {
                tracing::info!("transaction sender has been closed, dropping packet");

                // the channel has already been closed, the upper layer must notify
                // the sender that the transaction is (potentially) incomplete.
                //
                // Otherwise this could also be a packet that is simply out of order or rogue
                // in that case notifing the client would be confusing anyway.
                Ok(())
            }
            Err(_) => {
                tracing::warn!("transaction buffer is too slow, dropping transaction");

                // we've missed the deadline, therefore we can no longer send data to the
                // transaction without risking the integrity of the transaction.
                // we also send our own error to the client, so we need to cancel any existing
                // transaction, so that we do not send any auxilirary data.
                // Whenever we cancel a task, we do not flush, so no `EndOfResponse` is accidentally
                // sent.
                // TODO: is this behaviour we want, or do we want a more graceful approach?
                entry.cancel.cancel();

                Err(TransactionLaggingError)
            }
        }
    }

    fn is_empty(&self) -> bool {
        self.storage.is_empty()
    }
}

impl Drop for TransactionCollection {
    fn drop(&mut self) {
        // Dropping the transaction collection indicates that the session is shutting down, this
        // means no supervisor is there to send or recv data, so we can just go ahead and cancel any
        // pending transactions.
        // These should have been cancelled already implicitly, but just to be sure we do it again
        // explicitely here, as to not leave any dangling tasks.
        self.cancel_all();
    }
}

#[derive(Debug)]
pub(crate) struct TransactionPermit {
    id: RequestId,
    // adding an overflowing generation counter helps to prevent us from accidentally
    // removing requests in the case that we're overriding them.
    // If we override, we *could* have the case where w/ the following code:
    //
    // 1. TransactionCollection::acquire()
    //    - create a new permit
    //    - cancel the old permit (this one)
    //    - replace old state (this one is bound to) with new state
    // 2. TransactionPermit::drop() (old)
    //    - remove the state from the storage
    //
    // without the generation, we would, in that case, remove the new state, which is not
    // what we want.
    //
    // Also known as the ABA problem.
    generation: u64,

    storage: TransactionStorage,

    cancel: CancellationToken,
    notify: Arc<Notify>,

    _permit: ConcurrencyPermit,
}

impl TransactionPermit {
    fn new(
        collection: &TransactionCollection,
        id: RequestId,
        cancel: CancellationToken,
    ) -> Result<Arc<Self>, ConnectionTransactionLimitReachedError> {
        let permit = collection.limit.acquire()?;
        let storage = Arc::clone(&collection.storage);
        let notify = Arc::clone(&collection.notify);

        // we only need to increment the generation counter, when we are successful in acquiring a
        // permit.
        // Relaxed ordering is fine here, as we only ever increment the value and we do not care
        // about the order of those increments.
        let generation = collection.generation.fetch_add(1, Ordering::Relaxed);

        Ok(Arc::new(Self {
            id,
            storage,
            generation,
            notify,
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
        let has_removed = self
            .storage
            .remove_if(&self.id, |state| state.generation == self.generation);

        // we only need to check if empty, if we have removed something
        if has_removed && self.storage.is_empty() {
            self.notify.notify_one();
        }
    }
}

pub(crate) struct ConnectionTask<E> {
    pub(crate) peer: PeerId,
    pub(crate) session: SessionId,

    pub(crate) active: TransactionCollection,
    pub(crate) output: mpsc::Sender<Transaction>,
    pub(crate) events: broadcast::Sender<SessionEvent>,

    pub(crate) config: SessionConfig,
    pub(crate) encoder: E,
    pub(crate) _permit: OwnedSemaphorePermit,
}

impl<E> ConnectionTask<E>
where
    E: ErrorEncoder + Send + Sync + 'static,
{
    async fn respond_error<T>(&self, id: RequestId, error: T, tx: &mpsc::Sender<Response>)
    where
        T: PlainError + Send + Sync,
    {
        let TransactionError { code, bytes } = self.encoder.encode_error(error).await;

        let mut writer = ResponseWriter::new(
            WriterOptions { no_delay: false },
            ResponseContext {
                id,
                kind: ResponseKind::Err(code),
            },
            tx,
        );
        writer.push(bytes);

        // we cannot stop processing if the writer fails, as that simply means that we can no longer
        // send and we're winding down.
        if writer.flush().await.is_err() {
            tracing::info!("connection prematurely closed, response to transaction has been lost");
        }
    }

    async fn handle_request(
        &self,
        tx: mpsc::Sender<Response>,
        tasks: &TaskTracker,
        request: Request,
    ) {
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
                let (permit, request_tx, request_rx) = match self.active.acquire(request_id).await {
                    Ok((permit, tx, rx)) => (permit, tx, rx),
                    Err(error) => {
                        tracing::info!("transaction limit reached, dropping transaction");

                        return self.respond_error(request_id, error, &tx).await;
                    }
                };

                // this creates implicit backpressure, if the session cannot accept more
                // transaction, we will wait a short amount (specified via the deadline), if we
                // haven't processed the data until then, we will not start the transaction.
                //
                // by first acquiring a permit, instead of sending, we can ensure that we won't
                // spawn a transaction if we can't deliver it.
                let result = tokio::time::timeout(
                    self.config.transaction_delivery_deadline,
                    self.output.reserve(),
                )
                .await;

                let transaction_permit = match result {
                    Ok(Ok(permit)) => permit,
                    Ok(Err(_)) => {
                        // while the supervisor has been closed (or at least the stream to send
                        // transactions to), it does not mean that we can easily just stop the
                        // connection task, this is because, while the server might not be accepting
                        // any more transactions, existing transactions might still be in flight and
                        // be processed, this is also known as the "graceful shutdown" phase.
                        tracing::info!("supervisor has been dropped, dropping transaction");

                        self.respond_error(request_id, ConnectionShutdownError, &tx)
                            .await;
                        return;
                    }
                    Err(_) => {
                        // This only happens in case of a full buffer, in that case we will drop the
                        // transaction, because we can assume that the upper layer is unable to keep
                        // up with the incoming requests, it also helps us to prevent a DoS attack.
                        tracing::warn!("transaction delivery timed out, dropping transaction");

                        self.active.release(request_id).await;

                        self.respond_error(request_id, InstanceTransactionLimitReachedError, &tx)
                            .await;
                        return;
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

                // The channel size is a non-zero, meaning that we always have space in the buffer
                // to send the request and resolve immediately.
                request_tx
                    .try_send(request)
                    .expect("infallible; buffer should be large enough to hold the request");

                task.start(tasks, permit);

                transaction_permit.send(transaction);
            }
            RequestBody::Frame(_) => {
                if let Err(error) = self.active.send(request).await {
                    self.respond_error(request_id, error, &tx).await;
                }
            }
        }

        // TODO: forced gc on timeout in upper layer

        // we do not need to check for `EndOfRequest` here and forcefully close the channel, as the
        // task is already doing this for us.
    }

    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
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
        let stream = stream.fuse();
        let stream = StreamNotifyClose::new(stream);
        let stream = Either::Left(stream);

        pin!(stream);

        let finished = Semaphore::new(0);
        let notify = Arc::clone(&self.active.notify);

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

        // if we break out of the loop the `ConnectionDelegateTask` automatically stops itself, even
        // *if* it is still running, this is because `tx` is dropped, which closes the
        // channel, meaning that `ConnectionDelegateTask` will stop itself.
        // ^ this is true in theory, but we only drop `tx` if task has been finished, which is a
        // problem, this has the potential of creating a task that just never stops. Which we do NOT
        // want.
        // We solve this by dropping the `tx` once the stream has finished, because we know that we
        // won't be able to create any more transactions.
        let (tx, rx) = mpsc::channel(self.config.per_connection_response_buffer_size.get());
        let mut handle = tasks
            .spawn(ConnectionDelegateTask { rx, sink }.run(cancel.clone()))
            .fuse();

        let mut tx = Some(tx);

        loop {
            select! {
                // we use `StreamNotifyClose` here (and the double `Option<Option<T>>`), so that we don't add too many permits at once
                // `StreamNotifyClose` is guaranteed to end once the stream is closed, and we won't poll again.
                Some(request) = stream.next() => {
                    match request {
                        None => {
                            // stream has finished
                            finished.add_permits(1);

                            // shutdown the senders, as they can't be used anymore, this indicates to the delegate tasks that they should stop
                            // we don't cancel them, because they might still respond to the requests,
                            // they'll cancel themselves once the handle has finished
                            self.active.shutdown_senders();

                            // drop the sender (as we no longer can use it anyway)
                            // this will also stop the delegate task, once all transactions have finished
                            tx.take();
                        }
                        Some(Ok(request)) => {
                            let tx = tx.clone().expect("infallible; sender is only unavailble once the stream is exhausted");

                            self.handle_request(tx.clone(), &tasks, request).await;
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
                },
                () = notify.notified() => {
                    // we've been notified that an item has been removed and that the collection is now empty (at the time of notification)

                    // double check if `is_empty` (otherwise we might run into a race-condition)
                    if self.output.is_closed() && self.active.is_empty() {
                        // We can no longer accept any connections, if that is the case, we can stop the stream
                        // this is done by dropping the sender, and replacing it with another stream, which yields `None`
                        // This `None` is used in the next iteration of the loop, and will start the shutdown process.
                        stream.set(Either::Right(stream::once(future::ready(None))));
                    }
                }
                _ = finished.acquire_many(2) => {
                    // both the stream and the sink have finished, we can terminate
                    // and we don't need to shutdown the senders, they'll shutdown by themselves
                    break;
                }
                () = cancel.cancelled() => {
                    // cancel propagates down, so we don't need to shutdown the senders
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
