use alloc::sync::Arc;
use core::{fmt::Debug, time::Duration};
use std::{error::Error, io};

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
    sync::{mpsc, OwnedSemaphorePermit, Semaphore},
};
use tokio_stream::{wrappers::ReceiverStream, StreamNotifyClose};
use tokio_util::sync::CancellationToken;

use super::{
    session_id::SessionId,
    transaction::{Transaction, TransactionParts},
    write::ResponseWriter,
};
use crate::{
    codec::{ErrorEncoder, ErrorExt},
    session::error::{TransactionError, TransactionLimitReachedError},
};

// TODO: make these configurable
const RESPONSE_BUFFER_SIZE: usize = 16;
const TRANSACTION_LIMIT: usize = 64;

struct Shutdown;

struct ConnectionDelegateTask<T> {
    rx: mpsc::Receiver<Response>,

    sink: T,
}

impl<T> ConnectionDelegateTask<T>
where
    T: Sink<Response, Error: Debug> + Send,
{
    async fn run(self) -> Result<(), T::Error> {
        let sink = self.sink;
        pin!(sink);

        // redirect the receiver stream to the sink, needs an extra task to drive both
        ReceiverStream::new(self.rx).map(Ok).forward(sink).await
    }
}

impl<T> IntoFuture for ConnectionDelegateTask<T>
where
    T: Sink<Response, Error: Debug> + Send,
{
    type Output = Result<(), T::Error>;

    type IntoFuture = impl Future<Output = Self::Output>;

    fn into_future(self) -> Self::IntoFuture {
        self.run()
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
                () = cancel.cancelled() => break,
                _ = interval.tick() => {}
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
    pub(crate) permit: OwnedSemaphorePermit,

    pub(crate) transactions: Arc<HashIndex<RequestId, mpsc::Sender<Request>>>,
    pub(crate) tx_transaction: mpsc::Sender<Transaction>,

    pub(crate) encoder: E,
}

impl<E> ConnectionTask<E>
where
    E: ErrorEncoder,
{
    async fn respond_error<T>(
        &self,
        id: RequestId,
        error: T,
        tx: &mpsc::Sender<Response>,
    ) -> core::result::Result<(), Shutdown>
    where
        T: ErrorExt,
    {
        let TransactionError { code, bytes } = self.encoder.encode_error(error).await;

        let mut writer = ResponseWriter::new_error(id, code, tx);
        writer.push(bytes);

        writer.flush().await.map_err(|_error| Shutdown)
    }

    async fn handle_request(
        &self,
        tx: mpsc::Sender<Response>,
        cancel: &CancellationToken,
        request: Request,
    ) -> core::result::Result<(), Shutdown> {
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
                if self.transactions.len() > TRANSACTION_LIMIT {
                    tracing::warn!("transaction limit reached, dropping transaction");

                    return self
                        .respond_error(
                            request_id,
                            TransactionLimitReachedError {
                                limit: TRANSACTION_LIMIT,
                            },
                            &tx,
                        )
                        .await;
                }

                let (transaction_tx, transaction_rx) = mpsc::channel(RESPONSE_BUFFER_SIZE);

                let (transaction, task) = Transaction::from_request(
                    request.header,
                    begin,
                    TransactionParts {
                        peer: self.peer,
                        rx: transaction_rx,
                        tx,
                        session: self.session,
                    },
                );

                // we put it in the buffer, so will resolve immediately
                transaction_tx
                    .try_send(request)
                    .expect("infallible; buffer should be large enought to hold the request");

                task.start(cancel);

                // insert the transaction into the index (replace if already exists)
                let entry = self.transactions.entry_async(request_id).await;
                match entry {
                    scc::hash_index::Entry::Occupied(entry) => {
                        entry.update(transaction_tx);
                    }
                    scc::hash_index::Entry::Vacant(entry) => {
                        entry.insert_entry(transaction_tx);
                    }
                }

                self.tx_transaction
                    .send(transaction)
                    .await
                    .map_err(|_error| Shutdown)?;
            }
            RequestBody::Frame(_) => {
                // forward the request to the transaction
                if let Some(entry) = self
                    .transactions
                    .get_async(&request.header.request_id)
                    .await
                {
                    if let Err(error) = entry.send(request).await {
                        tracing::warn!(?error, "failed to forward request to transaction");
                    }
                } else {
                    // request has no transaction, which means it is a rogue request
                    tracing::warn!(?request, "request not part of transaction");
                }
            }
        }

        // remove the transaction from the index if it is closed.
        // TODO: forced gc on timeout in upper layer (needs IPC)
        if is_end {
            // removing this also means that all the channels will cascade close
            self.transactions.remove_async(&request_id).await;
        }

        Ok(())
    }

    #[allow(clippy::integer_division_remainder_used)]
    pub(crate) async fn run<T, U>(self, cancel: CancellationToken, sink: T, stream: U)
    where
        T: Sink<Response, Error: Debug + Send> + Send + 'static,
        U: Stream<Item = error_stack::Result<Request, io::Error>> + Send,
    {
        let stream = StreamNotifyClose::new(stream);

        pin!(stream);

        let finished = Semaphore::new(0);

        let cancel_gc = cancel.child_token();
        tokio::spawn(
            ConnectionGarbageCollectorTask {
                // TODO: make this configurable
                every: Duration::from_secs(10),
                transactions: Arc::clone(&self.transactions),
            }
            .run(cancel_gc.clone()),
        );
        let _drop_gc = cancel_gc.drop_guard();

        let (tx, rx) = mpsc::channel(RESPONSE_BUFFER_SIZE);
        let mut handle = tokio::spawn(ConnectionDelegateTask { rx, sink }.into_future()).fuse();

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
                            if self.handle_request(tx.clone(), &cancel, request).await.is_err() {
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
    }
}
