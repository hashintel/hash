mod collection;
mod stream;
#[cfg(test)]
mod test;

use alloc::sync::Arc;

use bytes::Bytes;
use error_stack::Report;
use futures::{Sink, Stream, StreamExt as _, prelude::future::FutureExt as _};
use harpc_types::{procedure::ProcedureDescriptor, subsystem::SubsystemDescriptor};
use harpc_wire_protocol::{request::Request, response::Response};
use scc::ebr::Guard;
use tachyonix::SendTimeoutError;
use tokio::{
    io, pin, select,
    sync::{Notify, mpsc},
    task::AbortHandle,
};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::{
    sync::{CancellationToken, DropGuard},
    task::TaskTracker,
};

use self::collection::{TransactionCollection, TransactionState, TransactionStorage};
pub use self::stream::ResponseStream;
use super::{config::SessionConfig, transaction::TransactionTask};
use crate::session::{error::ConnectionPartiallyClosedError, gc::ConnectionGarbageCollectorTask};

/// Delegate requests to the respective transaction.
///
/// This is a 1-n task, which takes requests from the individual transactions and forwards them to
/// the connection.
struct ConnectionRequestDelegateTask<S> {
    sink: S,
    rx: mpsc::Receiver<Request>,
}

impl<S> ConnectionRequestDelegateTask<S>
where
    S: Sink<Request> + Send,
{
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    async fn run(self, cancel: CancellationToken) -> Result<(), S::Error> {
        let sink = self.sink;
        pin!(sink);

        let forward = ReceiverStream::new(self.rx).map(Ok).forward(sink).fuse();

        select! {
            result = forward => result,
            () = cancel.cancelled() => Ok(()),
        }
    }
}

/// Delegate responses to the respective transaction.
///
/// Takes into account the [`RequestId`] to route the response to the correct transaction.
///
/// [`RequestId`]: harpc_wire_protocol::request::id::RequestId
struct ConnectionResponseDelegateTask<S> {
    config: SessionConfig,
    stream: S,

    storage: TransactionStorage,

    storage_empty_notify: Arc<Notify>,
    parent: CancellationToken,

    _guard: DropGuard,
}

impl<S> ConnectionResponseDelegateTask<S>
where
    S: Stream<Item = Result<Response, Report<io::Error>>> + Send,
{
    pub(crate) async fn route(
        config: SessionConfig,
        storage: &TransactionStorage,
        response: Response,
    ) {
        let id = response.header.request_id;

        // `Clone` is preferable here, as it is relatively cheap (`Arc` internally) and we won't
        // need to lock.
        let Some(sender) =
            storage.peek_with(&id, |_, TransactionState { sender, .. }| sender.clone())
        else {
            tracing::debug!(?id, "response for unknown transaction, ignoring...");
            return;
        };

        // this creates implicit backpressure, if the transaction cannot accept more
        // requests, we will wait a short amount (specified via the deadline), if we
        // haven't processed the data until then, we will drop the
        // transaction.
        let result = sender
            .send_timeout(
                response,
                tokio::time::sleep(config.response_delivery_deadline),
            )
            .await;

        // This only happens in the case of a full buffer, which only happens if during
        // buffering in an upper layer we are not able to process
        // the data fast enough. This is also a mechanism to prevent
        // a single transaction from blocking the whole session,
        // and to prevent packet flooding.
        match result {
            Ok(()) => {
                // everything is fine
            }
            Err(SendTimeoutError::Closed(_)) => {
                tracing::info!(
                    "transaction response channel has been closed, dropping transaction"
                );

                // the channel is already closed, we don't need to do anything, as the transaction
                // will be removed automatically
            }
            Err(SendTimeoutError::Timeout(_)) => {
                tracing::warn!("transaction response channel is full, dropping response channel");

                // we only close the response channel instead of cancelling the whole transaction,
                // this allows us to still send request data
                // We have no real way of directly communication with the callee about this, this
                // will look like the connection has been prematurely closed.
                // but(!) the callee is able to detect this, by checking `Connection::is_healthy()`,
                // which will be true.
                sender.close();
            }
        }
    }

    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    async fn run(self, cancel: CancellationToken) {
        let stream = self.stream;
        pin!(stream);

        let mut parent_cancelled = false;

        tracing::debug!("starting response delegate task");

        loop {
            let response = select! {
                response = stream.next().fuse() => response,
                () = self.storage_empty_notify.notified() => {
                    // This logic might seem counterintuitive, but it relies on the following
                    // semantics:
                    //
                    // - The parent here is the `Connection` struct, which cannot be cloned.
                    // - Once the `Connection` is dropped, we know that we're in the process
                    //   of shutting down.
                    // - The only way a new transaction, used to route tasks, is created
                    //   is through `Connection::call`.
                    //
                    // This means if we have no more transactions (the storage is empty) and
                    // the parent is cancelled, we can safely shut down, as any incoming
                    // response won't have a transaction to route to.
                    //
                    // The storage is never cleared by the `Connection` itself, but rather by
                    // the transaction once it is finished. Thus, it is safe to assume that
                    // if the storage is empty, we are done.
                    //
                    // While the notification indicates that the storage has been cleared,
                    // in a highly concurrent environment, the storage might be cleared but
                    // a new transaction could be created after the notification.
                    //
                    // This scenario could lead to a premature shutdown:
                    // 1. Storage is empty (notification is fired)
                    // 2. `Connection::call` is invoked
                    // 3. `Connection` (parent) is dropped
                    // 4. We are notified
                    //
                    // As seen, simply checking if we have been notified but the parent hasn't
                    // terminated yet is not sufficient.
                    if self.parent.is_cancelled() && self.storage.is_empty() {
                        break;
                    }

                    // false alarm, wait again for the next notification
                    continue;
                },
                () = self.parent.cancelled(), if !parent_cancelled => {
                    parent_cancelled = true;

                    // if the parent connection is dropped, immediately check if storage is empty, in that case
                    // we won't be notified via the other task, as we never actually started them
                    if self.storage.is_empty() {
                        break;
                    }

                    // otherwise, we wait for the notification until we're done
                    continue;
                },
                () = cancel.cancelled() => break,
            };

            let Some(response) = response else {
                // The stream has ended, meaning the connection has been terminated
                break;
            };

            let response = match response {
                Ok(response) => response,
                Err(error) => {
                    tracing::error!(?error, "malformed response received, ignoring...");
                    continue;
                }
            };

            Self::route(self.config, &self.storage, response).await;
        }

        // we need to cancel any remaining transactions, as we won't be able to route to them
        // anymore
        // This code path is hoisted here as a defensive measure to ensure that we don't leak
        // any tasks, we only expect that there are any remaining transactions if the response
        // stream has been suddenly closed.
        let guard = Guard::new();
        for (_, state) in self.storage.iter(&guard) {
            // Receiver will shutdown automatically, removingthe transaction from the storage
            // once it is done (which happens when the rx is closed)
            // This allows us to still process any buffered responses, without suddently
            // closing all transactions.
            state.sender.close();
        }

        tracing::debug!("response delegate task has been terminated");
    }
}

pub(crate) struct ConnectionParts<'a> {
    pub config: SessionConfig,
    pub tasks: &'a TaskTracker,
    pub cancel: CancellationToken,
}

#[derive(Debug)]
pub struct Connection {
    config: SessionConfig,

    tx: mpsc::Sender<Request>,
    tasks: TaskTracker,

    transactions: TransactionCollection,

    request_delegate_handle: AbortHandle,
    response_delegate_handle: AbortHandle,

    _guard: DropGuard,
}

impl Connection {
    pub(crate) fn spawn<S, T>(
        ConnectionParts {
            config,
            tasks,
            cancel,
        }: ConnectionParts,
        sink: S,
        stream: T,
    ) -> Self
    where
        S: Sink<Request, Error: Send> + Send + 'static,
        T: Stream<Item = Result<Response, Report<io::Error>>> + Send + 'static,
    {
        let (tx, rx) = mpsc::channel(config.per_connection_request_buffer_size.get());

        let transactions = TransactionCollection::new(config, cancel.clone());

        let request_delegate_handle =
            tasks.spawn(ConnectionRequestDelegateTask { sink, rx }.run(cancel.clone()));

        let guard_this = cancel.child_token();
        // The GC should stop when the response delegate (the one observing the transactions) is
        // stopped
        let guard_gc = cancel.child_token();

        let response_delegate_handle = tasks.spawn(
            ConnectionResponseDelegateTask {
                config,
                stream,
                storage: Arc::clone(transactions.storage()),
                storage_empty_notify: Arc::clone(transactions.notify()),
                parent: guard_this.clone(),
                _guard: guard_gc.clone().drop_guard(),
            }
            .run(cancel),
        );

        tasks.spawn(
            ConnectionGarbageCollectorTask {
                every: config.per_connection_transaction_garbage_collect_interval,
                index: Arc::clone(transactions.storage()),
            }
            .run(guard_gc),
        );

        Self {
            config,

            tx,
            tasks: tasks.clone(),

            transactions,

            request_delegate_handle: request_delegate_handle.abort_handle(),
            response_delegate_handle: response_delegate_handle.abort_handle(),

            _guard: guard_this.drop_guard(),
        }
    }

    /// Check if the connection is healthy.
    ///
    /// This returns false if either the underlying read or write stream have been closed.
    pub fn is_healthy(&self) -> bool {
        !self.request_delegate_handle.is_finished() && !self.response_delegate_handle.is_finished()
    }

    /// Call a service procedure.
    ///
    /// # Errors
    ///
    /// This will return an error if the connection is unhealthy, meaning that the underlying
    /// connection is currently in its process of being closed.
    pub async fn call(
        &self,
        subsystem: SubsystemDescriptor,
        procedure: ProcedureDescriptor,
        payload: impl Stream<Item = Bytes> + Send + 'static,
    ) -> Result<ResponseStream, Report<ConnectionPartiallyClosedError>> {
        // While not strictly necessary (as the transaction will immediately terminate if the
        // underlying connection is closed) and the `ResponseStream` will return `None` it is a good
        // indicator to the user that the connection is unhealthy, and as to why, as these tasks
        // only ever stop running when the underlying connection is closed.
        if !self.is_healthy() {
            return Err(Report::new(ConnectionPartiallyClosedError {
                read: self.response_delegate_handle.is_finished(),
                write: self.request_delegate_handle.is_finished(),
            }));
        }

        let (permit, response_rx) = self.transactions.acquire().await;

        let (stream_tx, stream_rx) = mpsc::channel(1);

        // Important: the resulting stream won't be directly notified if the payload stream couldn't
        // be sent, completely (which can only happen if the `Sink` has been shutdown). This is
        // intended, as we know that `Sink` and `Stream` are both bound to each other, meaning that
        // if the request couldn't be delivered, the response won't be delivered to the consumer
        // either, leading to a "broken pipe" of sorts.
        let task = TransactionTask {
            config: self.config,
            permit,
            subsystem,
            procedure,
            response_rx,
            response_tx: stream_tx,
            request_rx: payload,
            request_tx: self.tx.clone(),
        };

        task.spawn(&self.tasks);

        // we don't need to cancel the transaction here, it will be done automatically, if the
        // stream is dropped, responses will no longer be received, which shuts down the task
        // associated with it.
        // The only task that will survive is the one that sends the request, this one will be
        // terminated once the payload stream is exhausted.
        // This means we can allow scenarios in which the response does not matter and we only want
        // to send a request.
        Ok(ResponseStream::new(stream_rx))
    }
}
