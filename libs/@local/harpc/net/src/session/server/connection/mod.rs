pub(super) mod collection;
#[cfg(test)]
pub(crate) mod test;

use alloc::sync::Arc;
use core::{error::Error, fmt::Debug, future};
use std::io;

use futures::{FutureExt, Sink, Stream, StreamExt, stream};
use harpc_codec::encode::ErrorEncoder;
use harpc_wire_protocol::{
    request::{Request, body::RequestBody, id::RequestId},
    response::{Response, kind::ResponseKind},
};
use libp2p::PeerId;
use tokio::{
    pin, select,
    sync::{OwnedSemaphorePermit, Semaphore, broadcast, mpsc},
};
use tokio_stream::{StreamNotifyClose, wrappers::ReceiverStream};
use tokio_util::{either::Either, sync::CancellationToken, task::TaskTracker};

use self::collection::TransactionCollection;
use super::{
    SessionConfig, SessionEvent,
    session_id::SessionId,
    transaction::{Transaction, TransactionParts},
};
use crate::session::{
    error::{ConnectionGracefulShutdownError, InstanceTransactionLimitReachedError},
    gc::ConnectionGarbageCollectorTask,
    writer::{ResponseContext, ResponseWriter, WriterOptions},
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

pub(crate) struct ConnectionTask<E> {
    pub peer: PeerId,
    pub session: SessionId,

    pub transactions: TransactionCollection,
    pub output: mpsc::Sender<Transaction>,
    pub events: broadcast::Sender<SessionEvent>,

    pub config: SessionConfig,
    pub encoder: E,
    pub _permit: OwnedSemaphorePermit,
}

impl<E> ConnectionTask<E>
where
    E: ErrorEncoder + Clone + Send + Sync + 'static,
{
    async fn respond_error<T>(&self, id: RequestId, error: T, tx: &mpsc::Sender<Response>)
    where
        T: Error + serde::Serialize + Send + Sync,
    {
        let (code, bytes) = self.encoder.clone().encode_error(error).into_parts();

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
                let (permit, request_tx, request_rx) =
                    match self.transactions.acquire(request_id).await {
                        Ok((permit, tx, rx)) => (permit, tx, rx),
                        Err(error) => {
                            tracing::warn!("transaction limit reached, dropping transaction");

                            self.respond_error(request_id, error, &tx).await;
                            return;
                        }
                    };

                // this creates implicit backpressure, if the session cannot accept more
                // transaction, we will wait a short amount (specified via the deadline), if we
                // haven't processed the data until then, we will not start the transaction.
                //
                // by first acquiring a permit, instead of sending, we can ensure that we won't
                // spawn a transaction if we can't deliver it.
                let transaction_permit = match tokio::time::timeout(
                    self.config.transaction_delivery_deadline,
                    self.output.reserve(),
                )
                .await
                {
                    Ok(Ok(permit)) => permit,
                    Ok(Err(_)) => {
                        // while the supervisor has been closed (or at least the stream to send
                        // transactions to), it does not mean that we can easily just stop the
                        // connection task, this is because, while the server might not be accepting
                        // any more transactions, existing transactions might still be in flight and
                        // be processed, this is also known as the "graceful shutdown" phase.
                        tracing::info!("supervisor has been dropped, dropping transaction");

                        self.respond_error(request_id, ConnectionGracefulShutdownError, &tx)
                            .await;
                        return;
                    }
                    Err(_) => {
                        // This only happens in case of a full buffer, in that case we will drop the
                        // transaction, because we can assume that the upper layer is unable to keep
                        // up with the incoming requests, it also helps us to prevent a DoS attack.
                        tracing::warn!("transaction delivery timed out, dropping transaction");

                        self.transactions.release(request_id).await;

                        self.respond_error(request_id, InstanceTransactionLimitReachedError, &tx)
                            .await;
                        return;
                    }
                };

                let (transaction, task) = Transaction::from_request(begin, TransactionParts {
                    peer: self.peer,
                    session: self.session,
                    config: self.config,
                    rx: request_rx,
                    tx: tx.clone(),
                    permit,
                });

                // The channel size is a non-zero, meaning that we always have space in the buffer
                // to send the request and resolve immediately.
                request_tx
                    .try_send(request)
                    .expect("infallible; buffer should be large enough to hold the request");

                task.start(tasks);

                transaction_permit.send(transaction);
            }
            RequestBody::Frame(_) => {
                if let Err(error) = self.transactions.send(request).await {
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
        let transactions_empty_notify = Arc::clone(self.transactions.notify());

        let cancel_gc = cancel.child_token();
        tasks.spawn(
            ConnectionGarbageCollectorTask {
                every: self
                    .config
                    .per_connection_transaction_garbage_collect_interval,
                index: Arc::clone(self.transactions.storage()),
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
        let mut connection_task_handle = tasks
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
                            self.transactions.shutdown_senders();

                            // drop the sender (as we no longer can use it anyway)
                            // this will also stop the delegate task, once all transactions have finished
                            tx.take();
                        }
                        Some(Ok(request)) => {
                            let tx = tx.clone().unwrap_or_else(|| unreachable!("sender is only unavailble once the stream is exhausted"));

                            self.handle_request(tx, &tasks, request).await;
                        },
                        Some(Err(error)) => {
                            tracing::info!(?error, "malformed request");
                        }
                    }
                },
                result = &mut connection_task_handle => {
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
                () = transactions_empty_notify.notified() => {
                    // we've been notified that an item has been removed and that the collection is now empty (at the time of notification)

                    // double check if `is_empty` (otherwise we might run into a race-condition)
                    if self.output.is_closed() && self.transactions.is_empty() {
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

        // keep the connection alive for a little while, to allow the other side to finish receiving
        // any remaining data
        tokio::time::sleep(self.config.connection_shutdown_linger).await;
    }
}
